import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, must, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { USER_COLUMNS } from "@/lib/auth";
import { countsFromRows } from "@/lib/counts";
import { db } from "@/lib/supabase";
import { COUNTED_ACTIONS, type BreakdownRow, type CountedAction, type CounterRow, type User } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

async function loadCounters(id: string) {
  const { data: counters, error } = await db().rpc("user_action_counts", { p_user_id: id });
  if (error) throw new ApiError(500, error.message);
  const { data: breakdown, error: bErr } = await db().rpc("user_action_breakdown", { p_user_id: id });
  if (bErr) throw new ApiError(500, bErr.message);
  const rows = (counters ?? []) as CounterRow[];
  return { counters: rows, counts: countsFromRows(rows), breakdown: (breakdown ?? []) as BreakdownRow[] };
}

/** GET /api/admin/users/:id/counters */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;
    return ok(await loadCounters(id));
  });
}

/**
 * PATCH /api/admin/users/:id/counters
 * { action: 'upload'|'replace'|'rename'|'delete'|'all', mode: 'reset'|'set', value?: number }
 * reset -> count becomes 0 and starts counting again from now.
 * set   -> count becomes `value`; new actions add on top of it.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;
    const body = await readBody<{ action?: string; mode?: string; value?: number }>(req);

    const target = must(await db().from("users").select(USER_COLUMNS).eq("id", id).maybeSingle(), "User not found") as User;

    const actions: CountedAction[] =
      body.action === "all"
        ? COUNTED_ACTIONS
        : COUNTED_ACTIONS.includes(body.action as CountedAction)
          ? [body.action as CountedAction]
          : [];
    if (!actions.length) throw new ApiError(400, "action must be upload, replace, rename, delete or all");

    let base = 0;
    if (body.mode === "set") {
      const v = Number(body.value);
      if (!Number.isInteger(v) || v < 0 || v > 2_000_000_000) throw new ApiError(400, "value must be a whole number of 0 or more");
      base = v;
    } else if (body.mode !== "reset") {
      throw new ApiError(400, "mode must be reset or set");
    }

    const now = new Date().toISOString();
    const rows = actions.map((action) => ({
      user_id: id,
      action,
      base,
      counted_from: now,
      updated_by: me.id,
      updated_at: now,
    }));
    const { error } = await db().from("user_counters").upsert(rows, { onConflict: "user_id,action" });
    if (error) throw new ApiError(500, error.message);

    await logActivity({
      user_id: me.id,
      action: "edit_counter",
      details: { target_user_id: id, target_email: target.email, actions, mode: body.mode, value: base },
    });

    return ok(await loadCounters(id));
  });
}
