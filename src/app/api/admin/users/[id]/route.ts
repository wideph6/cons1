import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, must, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { hashPassword, USER_COLUMNS, validatePassword } from "@/lib/auth";
import { countsFromRows } from "@/lib/counts";
import { sanitizePermissions } from "@/lib/permissions";
import { db } from "@/lib/supabase";
import type { BreakdownRow, CounterRow, User } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/users/:id — profile, counters, breakdown by domain/link. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;

    const user = must(await db().from("users").select(USER_COLUMNS).eq("id", id).maybeSingle(), "User not found") as User;

    const { data: counters, error: cErr } = await db().rpc("user_action_counts", { p_user_id: id });
    if (cErr) throw new ApiError(500, cErr.message);
    const { data: breakdown, error: bErr } = await db().rpc("user_action_breakdown", { p_user_id: id });
    if (bErr) throw new ApiError(500, bErr.message);

    const rows = (counters ?? []) as CounterRow[];
    return ok({
      item: user,
      counters: rows,
      counts: countsFromRows(rows),
      breakdown: (breakdown ?? []) as BreakdownRow[],
    });
  });
}

/** PATCH /api/admin/users/:id  { name?, email?, role?, permissions?, is_active?, password? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;
    const body = await readBody<{
      name?: string;
      email?: string;
      role?: string;
      permissions?: Record<string, boolean>;
      is_active?: boolean;
      password?: string;
    }>(req);

    const target = must(await db().from("users").select(USER_COLUMNS).eq("id", id).maybeSingle(), "User not found") as User;
    const isSelf = target.id === me.id;

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ApiError(400, "Name is required");
      patch.name = name;
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Enter a valid email address");
      patch.email = email;
    }
    if (body.role !== undefined) {
      const role = body.role === "superadmin" ? "superadmin" : "admin";
      if (isSelf && role !== "superadmin") throw new ApiError(400, "You cannot remove your own super admin role");
      patch.role = role;
    }
    if (body.permissions !== undefined) patch.permissions = sanitizePermissions(body.permissions);
    if (body.is_active !== undefined) {
      if (isSelf && !body.is_active) throw new ApiError(400, "You cannot disable your own account");
      patch.is_active = Boolean(body.is_active);
    }
    if (body.password !== undefined && body.password !== "") {
      patch.password_hash = await hashPassword(validatePassword(body.password));
    }
    if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");

    const { data, error } = await db().from("users").update(patch).eq("id", id).select(USER_COLUMNS).single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, "A user with that email already exists");
      throw new ApiError(500, error.message);
    }

    const { password_hash: _pw, ...loggable } = patch;
    void _pw;
    await logActivity({
      user_id: me.id,
      action: "update_user",
      details: {
        target_user_id: id,
        target_email: target.email,
        changes: { ...loggable, ...(patch.password_hash ? { password: "changed" } : {}) },
      },
    });
    return ok({ item: data });
  });
}

/** DELETE /api/admin/users/:id — permanently removes the account (history is kept, attribution becomes blank). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;
    if (id === me.id) throw new ApiError(400, "You cannot delete your own account");

    const target = must(await db().from("users").select(USER_COLUMNS).eq("id", id).maybeSingle(), "User not found") as User;
    const { error } = await db().from("users").delete().eq("id", id);
    if (error) throw new ApiError(500, error.message);

    await logActivity({
      user_id: me.id,
      action: "delete_user",
      details: { target_user_id: id, target_email: target.email, target_name: target.name },
    });
    return ok({ ok: true });
  });
}
