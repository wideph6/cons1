import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { hashPassword, USER_COLUMNS, validatePassword } from "@/lib/auth";
import { countsFromRows, emptyCounts } from "@/lib/counts";
import { sanitizePermissions } from "@/lib/permissions";
import { db } from "@/lib/supabase";
import type { CounterRow, User, UserWithCounts } from "@/lib/types";

/** GET /api/admin/users — all users with their action counts (super admin only). */
export async function GET() {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);

    const { data: users, error } = await db().from("users").select(USER_COLUMNS).order("created_at");
    if (error) throw new ApiError(500, error.message);

    const { data: counts, error: cErr } = await db().rpc("user_action_counts");
    if (cErr) throw new ApiError(500, cErr.message);

    const byUser = new Map<string, CounterRow[]>();
    for (const row of (counts ?? []) as CounterRow[]) {
      const arr = byUser.get(row.user_id) ?? [];
      arr.push(row);
      byUser.set(row.user_id, arr);
    }

    const items: UserWithCounts[] = ((users ?? []) as User[]).map((u) => ({
      ...u,
      counts: countsFromRows(byUser.get(u.id) ?? []),
    }));
    return ok({ items });
  });
}

/** POST /api/admin/users  { email, name, password, role?, permissions? } */
export async function POST(req: NextRequest) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const body = await readBody<{
      email?: string;
      name?: string;
      password?: string;
      role?: string;
      permissions?: Record<string, boolean>;
    }>(req);

    const email = (body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Enter a valid email address");
    const name = (body.name ?? "").trim();
    if (!name) throw new ApiError(400, "Name is required");
    const password = validatePassword(body.password);
    const role = body.role === "superadmin" ? "superadmin" : "admin";
    const permissions = role === "superadmin" ? {} : sanitizePermissions(body.permissions);

    const { data, error } = await db()
      .from("users")
      .insert({ email, name, password_hash: await hashPassword(password), role, permissions, created_by: me.id })
      .select(USER_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, "A user with that email already exists");
      throw new ApiError(500, error.message);
    }

    await logActivity({
      user_id: me.id,
      action: "create_user",
      details: { target_user_id: data.id, email, role, permissions: Object.keys(permissions) },
    });
    return ok({ item: { ...(data as User), counts: emptyCounts() } }, { status: 201 });
  });
}
