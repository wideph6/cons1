import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { USER_COLUMNS } from "@/lib/auth";
import { commissionReady, getCommissionBalances, listCommissionRequests } from "@/lib/commission";
import { NO_COMMISSION_BALANCE } from "@/lib/commission-shared";
import { cleanRates, financeReady, getBalances, getRates, getVisibility, listRequests, setRates } from "@/lib/finance";
import { NO_BALANCE, type FinanceBalance, type FinanceOverview } from "@/lib/finance-shared";
import { db } from "@/lib/supabase";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/admin/finance — every user's balance, the rates, and the payment requests waiting. Super admin only. */
export async function GET() {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const [ready, commissionOn] = await Promise.all([financeReady(), commissionReady()]);
    const [users, rates, balances, visibility, requests, owed, sent] = await Promise.all([
      db().from("users").select(USER_COLUMNS).order("created_at"),
      getRates(),
      ready ? getBalances() : Promise.resolve(new Map<string, FinanceBalance>()),
      ready ? getVisibility() : Promise.resolve(new Map<string, boolean>()),
      ready ? listRequests({ pendingOnly: true, limit: 200 }) : Promise.resolve([]),
      commissionOn ? getCommissionBalances() : Promise.resolve(new Map()),
      commissionOn ? listCommissionRequests({ pendingOnly: true, limit: 500 }) : Promise.resolve([]),
    ]);
    if (users.error) throw new ApiError(500, users.error.message);
    const waiting = new Map<string, number>();
    for (const r of requests) waiting.set(r.user_id, (waiting.get(r.user_id) ?? 0) + 1);
    const sentTo = new Map<string, number>();
    for (const r of sent) sentTo.set(r.user_id, Math.round(((sentTo.get(r.user_id) ?? 0) + r.amount) * 100) / 100);
    const all = (users.data ?? []) as User[];
    const overview: FinanceOverview = {
      ready,
      rates,
      requests,
      commission_ready: commissionOn,
      // Commission users are owed money, not charged: their accounts are listed apart.
      commission: all
        .filter((u) => u.role === "commission")
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          is_active: u.is_active,
          visible: visibility.get(u.id) ?? false,
          balance: owed.get(u.id) ?? { ...NO_COMMISSION_BALANCE },
          waiting: sentTo.get(u.id) ?? 0,
        })),
      users: all.filter((u) => u.role !== "commission").map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        is_active: u.is_active,
        visible: visibility.get(u.id) ?? false,
        balance: balances.get(u.id) ?? { ...NO_BALANCE },
        pending_requests: waiting.get(u.id) ?? 0,
      })),
    };
    return ok(overview);
  });
}

/**
 * PATCH /api/admin/finance { rates: { old_m, new_m, appo } } — what each new entry costs from now on.
 * Entries already made keep the amount they were charged. Super admin only.
 */
export async function PATCH(req: NextRequest) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const body = await readBody<{ rates?: unknown }>(req);
    const before = await getRates();
    const rates = await setRates(cleanRates(body.rates), me.id);
    after(() => logActivity({ user_id: me.id, action: "update_finance_rates", details: { from: before, to: rates } }));
    return ok({ rates });
  });
}
