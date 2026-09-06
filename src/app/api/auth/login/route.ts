import { NextResponse, type NextRequest } from "next/server";
import { ApiError, readBody, run } from "@/lib/api";
import { hashPassword, publicUser, verifyPassword } from "@/lib/auth";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { db } from "@/lib/supabase";
import type { DbUser } from "@/lib/types";

export async function POST(req: NextRequest) {
  return run(async () => {
    const body = await readBody<{ email?: string; password?: string }>(req);
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) throw new ApiError(400, "Email and password are required");

    const bootEmail = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
    const bootPassword = process.env.SUPERADMIN_PASSWORD ?? "";
    const matchesBootstrap = Boolean(bootEmail && bootPassword && email === bootEmail && password === bootPassword);

    const { data: found, error } = await db().from("users").select("*").eq("email", email).maybeSingle();
    if (error) throw new ApiError(500, error.message);
    let user = found as DbUser | null;

    if (!user && matchesBootstrap) {
      // First run: create the super admin from environment variables.
      const { count } = await db().from("users").select("id", { count: "exact", head: true });
      if ((count ?? 0) === 0) {
        const { data: created, error: insErr } = await db()
          .from("users")
          .insert({
            email,
            name: "Super admin",
            password_hash: await hashPassword(password),
            role: "superadmin",
            permissions: {},
          })
          .select("*")
          .single();
        if (insErr) throw new ApiError(500, insErr.message);
        user = created as DbUser;
      }
    }

    if (!user) throw new ApiError(401, "Email or password is incorrect");

    let valid = await verifyPassword(password, user.password_hash);
    if (!valid && matchesBootstrap && user.role === "superadmin") {
      // Recovery: the env password was changed; sync it to the super admin account.
      const { error: upErr } = await db()
        .from("users")
        .update({ password_hash: await hashPassword(password), is_active: true })
        .eq("id", user.id);
      if (upErr) throw new ApiError(500, upErr.message);
      valid = true;
      user.is_active = true;
    }
    if (!valid) throw new ApiError(401, "Email or password is incorrect");
    if (!user.is_active) throw new ApiError(403, "This account is disabled. Contact the super admin.");

    await db().from("users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);

    const token = await signSession({ sub: user.id, email: user.email, name: user.name, role: user.role });
    const res = NextResponse.json({ user: publicUser(user) });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  });
}
