import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { hashPassword, USER_COLUMNS, validatePassword } from "@/lib/auth";
import { countsFromRows, emptyCounts } from "@/lib/counts";
import { getCommissionBalances, setCommissionRates } from "@/lib/commission";
import { REVIEW_MISSING } from "@/lib/review";
import { cleanRates, getBalances } from "@/lib/finance";
import { sanitizePermissions } from "@/lib/permissions";
import { db } from "@/lib/supabase";
import type { CounterRow, Role, User, UserWithCounts } from "@/lib/types";

/** A role as sent: super admin, commission based, or (anything else) admin. */
function roleOf(input: unknown): Role {
  return input === "superadmin" ? "superadmin" : input === "commission" ? "commission" : "admin";
}

/** The database turned the role down: commission users need supabase/commission.sql first. */
function roleRefused(error: { code?: string; message?: string }): boolean {
  return error.code === "23514" && /role/.test(error.message ?? "");
}


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

    const [balances, owed] = await Promise.all([getBalances(), getCommissionBalances()]);
    const items: UserWithCounts[] = ((users ?? []) as User[]).map((u) => ({
      ...u,
      counts: countsFromRows(byUser.get(u.id) ?? []),
      pending: balances.get(u.id)?.pending ?? 0,
      owed: owed.get(u.id)?.remaining ?? 0,
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
      /** For a commission user: what each approved case earns them. */
      commission_rates?: unknown;
    }>(req);

    const email = (body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Enter a valid email address");
    const name = (body.name ?? "").trim();
    if (!name) throw new ApiError(400, "Name is required");
    const password = validatePassword(body.password);
    const role = roleOf(body.role);
    const permissions = role === "superadmin" ? {} : sanitizePermissions(body.permissions, role);
    const rates = role === "commission" ? cleanRates(body.commission_rates) : null;

    const { data, error } = await db()
      .from("users")
      .insert({ email, name, password_hash: await hashPassword(password), role, permissions, created_by: me.id })
      .select(USER_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, "A user with that email already exists");
      if (roleRefused(error)) throw new ApiError(400, REVIEW_MISSING);
      throw new ApiError(500, error.message);
    }
    if (rates) await setCommissionRates(data.id, rates, me.id);

    await logActivity({
      user_id: me.id,
      action: "create_user",
      details: { target_user_id: data.id, email, role, permissions: Object.keys(permissions), ...(rates ? { commission_rates: rates } : {}) },
    });
    return ok({ item: { ...(data as User), counts: emptyCounts() } }, { status: 201 });
  });
}
