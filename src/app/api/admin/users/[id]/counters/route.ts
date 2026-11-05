import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, must, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { USER_COLUMNS } from "@/lib/auth";
import { countsFromRows } from "@/lib/counts";
import { getBalances, getRates } from "@/lib/finance";
import { BILLED_ACTIONS, countChangeAmount, NO_BALANCE, SYSTEM_LABELS } from "@/lib/finance-shared";
import { db } from "@/lib/supabase";
import { COUNTED_ACTIONS, type BreakdownRow, type CountChange, type CountedAction, type CounterRow, type User } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** The remarks a count change must carry: what lowering or resetting a count is for. */
const MIN_REMARKS = 3;
const MAX_REMARKS = 300;

/** The latest count changes made to this user, with who made them and why. */
async function countChanges(id: string): Promise<CountChange[]> {
  const { data, error } = await db()
    .from("activity_log")
    .select("id,created_at,details,users(name,email)")
    .eq("action", "edit_counter")
    .eq("details->>target_user_id", id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return ((data ?? []) as unknown as Array<{ id: number; created_at: string; details: Record<string, unknown>; users: { name: string | null; email: string | null } | null }>).map(
    (r) => ({
      id: r.id,
      created_at: r.created_at,
      by: r.users?.name || r.users?.email || null,
      mode: String(r.details?.mode ?? ""),
      actions: Array.isArray(r.details?.actions) ? (r.details.actions as string[]) : [],
      changes: Array.isArray(r.details?.changes) ? (r.details.changes as CountChange["changes"]) : [],
      amount_change: Number(r.details?.amount_change ?? 0) || 0,
      remarks: String(r.details?.remarks ?? ""),
    }),
  );
}

async function loadCounters(id: string) {
  const [counters, breakdown, rates, balances, history] = await Promise.all([
    db().rpc("user_action_counts", { p_user_id: id }),
    db().rpc("user_action_breakdown", { p_user_id: id }),
    getRates(),
    getBalances([id]),
    countChanges(id),
  ]);
  if (counters.error) throw new ApiError(500, counters.error.message);
  if (breakdown.error) throw new ApiError(500, breakdown.error.message);
  const rows = (counters.data ?? []) as CounterRow[];
  return {
    history,
    counters: rows,
    counts: countsFromRows(rows),
    breakdown: (breakdown.data ?? []) as BreakdownRow[],
    // For the warnings: what a count change does to what the user owes.
    rates,
    balance: balances.get(id) ?? { ...NO_BALANCE },
  };
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
 * { action: 'upload'|'replace'|'rename'|'delete'|'create_new_m'|'create_appo'|'all', mode: 'reset'|'set'|'subtract', value?: number, remarks?: string }
 * reset    -> the count becomes 0 and starts counting again from now.
 * set      -> the count becomes `value`; new actions add on top of it.
 * subtract -> the count goes down by `value` (never below 0).
 * For an admin, a count that costs money moves what they owe with it, by the change times the rate now in
 * force: lowering or resetting it takes that much off, raising it adds that much. Both are saved together.
 * Lowering or resetting a count needs remarks saying why; they are kept with the change.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;
    const body = await readBody<{ action?: string; mode?: string; value?: number; remarks?: unknown }>(req);
    const remarks = String(body.remarks ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_REMARKS);

    const target = must(await db().from("users").select(USER_COLUMNS).eq("id", id).maybeSingle(), "User not found") as User;

    const actions: CountedAction[] =
      body.action === "all"
        ? COUNTED_ACTIONS
        : COUNTED_ACTIONS.includes(body.action as CountedAction)
          ? [body.action as CountedAction]
          : [];
    if (!actions.length) throw new ApiError(400, `action must be one of ${COUNTED_ACTIONS.join(", ")} or all`);
    if (!["reset", "set", "subtract"].includes(body.mode ?? "")) throw new ApiError(400, "mode must be reset, set or subtract");

    let value = 0;
    if (body.mode !== "reset") {
      const v = Number(body.value);
      if (!Number.isInteger(v) || v < 0 || v > 2_000_000_000) throw new ApiError(400, "value must be a whole number of 0 or more");
      if (body.mode === "subtract" && v === 0) throw new ApiError(400, "Enter how many to subtract");
      value = v;
    }

    const now = await loadCounters(id);
    const lowers = actions.some((a) => {
      const before = now.counts[a];
      const after = body.mode === "reset" ? 0 : body.mode === "set" ? value : Math.max(0, before - value);
      return after < before;
    });
    if ((body.mode !== "set" || lowers) && remarks.length < MIN_REMARKS) {
      throw new ApiError(400, "Write remarks saying why the count is lowered or reset");
    }
    const rows: Array<{ action: CountedAction; base: number }> = [];
    const entries: Array<{ system: string; quantity: number; rate: number; amount: number; note: string }> = [];
    for (const action of actions) {
      const before = now.counts[action];
      const after = body.mode === "reset" ? 0 : body.mode === "set" ? value : Math.max(0, before - value);
      rows.push({ action, base: after });
      const amount = countChangeAmount(action, after - before, now.rates, target.role);
      const system = BILLED_ACTIONS[action];
      if (amount !== 0 && system) {
        entries.push({
          system,
          quantity: after - before,
          rate: now.rates[system],
          amount,
          note: `${SYSTEM_LABELS[system]} count ${body.mode === "reset" ? "reset" : body.mode === "set" ? "set" : "lowered"} from ${before} to ${after}${remarks ? ` · Remarks: ${remarks}` : ""}`,
        });
      }
    }

    const res = await db().rpc("finance_set_counts", { p_user: id, p_by: me.id, p_rows: rows, p_entries: entries });
    if (res.error) {
      // Before finance.sql there is no money to move: the counts are saved as they always were.
      const notThere = res.error.code === "PGRST202" || res.error.code === "42883";
      if (!notThere || entries.length) throw new ApiError(500, res.error.message);
      const stamp = new Date().toISOString();
      const { error } = await db()
        .from("user_counters")
        .upsert(
          rows.map((r) => ({ user_id: id, action: r.action, base: r.base, counted_from: stamp, updated_by: me.id, updated_at: stamp })),
          { onConflict: "user_id,action" },
        );
      if (error) throw new ApiError(500, error.message);
    }

    await logActivity({
      user_id: me.id,
      action: "edit_counter",
      details: {
        target_user_id: id,
        target_email: target.email,
        actions,
        mode: body.mode,
        value,
        changes: actions.map((a, i) => ({ action: a, before: now.counts[a], after: rows[i].base })),
        amount_change: entries.reduce((sum, e) => sum + e.amount, 0),
        remarks,
      },
    });

    return ok(await loadCounters(id));
  });
}
