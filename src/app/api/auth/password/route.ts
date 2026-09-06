import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireUser, run } from "@/lib/api";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    const body = await readBody<{ current_password?: string; new_password?: string }>(req);
    const next = validatePassword(body.new_password);

    const { data, error } = await db().from("users").select("password_hash").eq("id", user.id).single();
    if (error || !data) throw new ApiError(500, error?.message ?? "User not found");
    if (!(await verifyPassword(body.current_password ?? "", data.password_hash))) {
      throw new ApiError(400, "Current password is incorrect");
    }

    const { error: upErr } = await db()
      .from("users")
      .update({ password_hash: await hashPassword(next) })
      .eq("id", user.id);
    if (upErr) throw new ApiError(500, upErr.message);

    await logActivity({ user_id: user.id, action: "change_password" });
    return ok({ ok: true });
  });
}
