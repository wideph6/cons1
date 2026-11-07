import {
  NO_COMMISSION_BALANCE,
  NO_COMMISSION_RATES,
  type CommissionAccount,
  type CommissionBalance,
  type CommissionEntry,
  type CommissionRates,
  type CommissionRequest,
} from "./commission-shared";
import { ApiError } from "./errors";
import { canSeeOwnAccount, getVisibility } from "./finance";
import { formatMoney } from "./finance-shared";
import type { CaseSystem } from "./review-shared";
import { must } from "./api";
import { USER_COLUMNS } from "./auth";
import { db } from "./supabase";
import type { User } from "./types";

/**
 * Commission users' accounts (supabase/commission.sql): what each approved case earned them, what was taken
 * back for cases deleted after approval, and what the super admin paid them. A payment to a user who sees
 * their Finance tab waits for them to accept it; to one who does not, the super admin records it outright.
 */

export const COMMISSION_MISSING =
  "The commission tables are not in the database yet. Run supabase/commission.sql in Supabase → SQL Editor, then reload this page.";

/** The commission user an address names; anyone else is turned away. */
export async function commissionUser(id: string): Promise<User> {
  const u = must(await db().from("users").select(USER_COLUMNS).eq("id", id).maybeSingle(), "User not found") as User;
  if (u.role !== "commission") throw new ApiError(400, "This user is not commission based.");
  return u;
}

/** A user as an account names them. */
export const who = (u: User) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

function missing(error: { code?: string } | null | undefined): boolean {
  const c = error?.code;
  return c === "42P01" || c === "PGRST205" || c === "PGRST202" || c === "42883" || c === "42703";
}

function fail(error: { code?: string; message: string }): ApiError {
  return missing(error) ? new ApiError(500, COMMISSION_MISSING) : new ApiError(500, error.message);
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const money = (v: number) => Math.round(v * 100) / 100;

/** Whether supabase/commission.sql has been run. */
export async function commissionReady(): Promise<boolean> {
  const { error } = await db().from("commission_rates").select("user_id").limit(1);
  if (error && missing(error)) return false;
  if (error) throw fail(error);
  return true;
}

/** What one approved case earns each of these users, by id; nothing set is 0 for every system. */
export async function getCommissionRates(userIds: string[]): Promise<Map<string, CommissionRates>> {
  const out = new Map<string, CommissionRates>();
  if (!userIds.length) return out;
  const { data, error } = await db().from("commission_rates").select("user_id,rate_old_m,rate_new_m,rate_appo").in("user_id", userIds);
  if (error) {
    if (missing(error)) return out;
    throw fail(error);
  }
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    out.set(String(r.user_id), { old_m: num(r.rate_old_m), new_m: num(r.rate_new_m), appo: num(r.rate_appo) });
  }
  return out;
}

export async function setCommissionRates(userId: string, rates: CommissionRates, by: string): Promise<void> {
  const { error } = await db().from("commission_rates").upsert({
    user_id: userId,
    rate_old_m: rates.old_m,
    rate_new_m: rates.new_m,
    rate_appo: rates.appo,
    updated_by: by,
    updated_at: new Date().toISOString(),
  });
  if (error) throw fail(error);
}

/** Every commission user's balance (or these users'), by id. */
export async function getCommissionBalances(userIds?: string[]): Promise<Map<string, CommissionBalance>> {
  let q = db().from("commission_balances").select("user_id,remaining,earned,reversed,paid");
  if (userIds) q = q.in("user_id", userIds);
  const { data, error } = await q;
  if (error) {
    if (missing(error)) return new Map();
    throw fail(error);
  }
  const out = new Map<string, CommissionBalance>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    out.set(String(r.user_id), { remaining: num(r.remaining), earned: num(r.earned), reversed: num(r.reversed), paid: num(r.paid) });
  }
  return out;
}

interface RequestRow {
  id: string;
  user_id: string;
  amount: number | string;
  note: string;
  status: CommissionRequest["status"];
  created_at: string;
  decided_at: string | null;
  decision_note: string;
  receiver: { name: string | null; email: string | null } | null;
  sender: { name: string | null; email: string | null } | null;
}

const REQUEST_COLUMNS =
  "id,user_id,amount,note,status,created_at,decided_at,decision_note,receiver:users!commission_requests_user_id_fkey(name,email),sender:users!commission_requests_created_by_fkey(name,email)";

function mapRequest(r: RequestRow): CommissionRequest {
  return {
    id: r.id,
    user_id: r.user_id,
    user_name: r.receiver?.name ?? null,
    user_email: r.receiver?.email ?? null,
    amount: num(r.amount),
    note: r.note ?? "",
    status: r.status,
    created_by_name: r.sender?.name || r.sender?.email || null,
    created_at: r.created_at,
    decided_at: r.decided_at,
    decision_note: r.decision_note ?? "",
  };
}

/** Payments sent, newest first: one user's, or everyone's (only those still waiting, when pendingOnly). */
export async function listCommissionRequests(opts: { userId?: string; pendingOnly?: boolean; limit?: number } = {}): Promise<CommissionRequest[]> {
  let q = db().from("commission_requests").select(REQUEST_COLUMNS);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.pendingOnly) q = q.eq("status", "pending");
  const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (error) {
    if (missing(error)) return [];
    throw fail(error);
  }
  return ((data ?? []) as unknown as RequestRow[]).map(mapRequest);
}

/** One commission user's account: rates, balance, the latest changes to it and the payments sent to them. */
export async function getCommissionAccount(user: { id: string; name: string; email: string; role: string }): Promise<CommissionAccount> {
  const [rates, balances, visibility, entries, requests] = await Promise.all([
    getCommissionRates([user.id]),
    getCommissionBalances([user.id]),
    getVisibility([user.id]),
    db()
      .from("commission_entries")
      .select("id,kind,system,record_id,label,rate,amount,note,request_id,created_at,creator:users!commission_entries_created_by_fkey(name,email)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500),
    listCommissionRequests({ userId: user.id, limit: 100 }),
  ]);
  if (entries.error && !missing(entries.error)) throw fail(entries.error);
  const rows = (entries.data ?? []) as unknown as Array<Record<string, unknown> & { creator: { name: string | null; email: string | null } | null }>;
  const mapped: CommissionEntry[] = rows.map((e) => ({
    id: Number(e.id),
    kind: e.kind as CommissionEntry["kind"],
    system: (e.system as CaseSystem | null) ?? null,
    record_id: (e.record_id as string | null) ?? null,
    label: String(e.label ?? ""),
    rate: num(e.rate),
    amount: num(e.amount),
    note: String(e.note ?? ""),
    request_id: (e.request_id as string | null) ?? null,
    created_by_name: e.creator?.name || e.creator?.email || null,
    created_at: String(e.created_at),
  }));
  return {
    user,
    visible: visibility.get(user.id) ?? false,
    rates: rates.get(user.id) ?? { ...NO_COMMISSION_RATES },
    balance: balances.get(user.id) ?? { ...NO_COMMISSION_BALANCE },
    waiting: money(requests.filter((r) => r.status === "pending").reduce((s, r) => s + r.amount, 0)),
    entries: mapped,
    requests,
  };
}

/**
 * The super admin pays a commission user. Never more than they are still owed, less what was already sent and
 * is waiting. A user who sees their Finance tab gets a payment to accept, and nothing changes until they do;
 * for one who does not, the payment is recorded straight away.
 */
export async function payCommission(userId: string, amount: number, note: string, by: string): Promise<"sent" | "recorded"> {
  const [balances, waiting, visible] = await Promise.all([
    getCommissionBalances([userId]),
    listCommissionRequests({ userId, pendingOnly: true, limit: 200 }),
    canSeeOwnAccount(userId),
  ]);
  const remaining = balances.get(userId)?.remaining ?? 0;
  const sent = money(waiting.reduce((s, r) => s + r.amount, 0));
  const open = money(remaining - sent);
  if (amount > open + 0.001) {
    throw new ApiError(
      400,
      open > 0
        ? `That is more than is left to pay: ${formatMoney(open)}${sent > 0 ? ` (${formatMoney(sent)} already sent and waiting for the user)` : ""}.`
        : sent > 0
          ? `Nothing more is owed: ${formatMoney(sent)} is already sent and waiting for the user to accept it.`
          : "Nothing is owed to this user now.",
    );
  }
  if (visible) {
    const { error } = await db().from("commission_requests").insert({ user_id: userId, amount, note, created_by: by });
    if (error) throw fail(error);
    return "sent";
  }
  const { error } = await db().from("commission_entries").insert({ user_id: userId, kind: "payment", amount: -amount, note, created_by: by });
  if (error) throw fail(error);
  return "recorded";
}

/** The super admin takes back a payment still waiting for the user. */
export async function cancelCommissionRequest(id: string, note: string): Promise<CommissionRequest> {
  const { data, error } = await db()
    .from("commission_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString(), decision_note: note })
    .eq("id", id)
    .eq("status", "pending")
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  if (error) throw fail(error);
  if (!data) throw new ApiError(409, "This payment is not waiting any more. Reload to see it.");
  return mapRequest(data as unknown as RequestRow);
}

/** The user accepts a payment sent to them (it comes off what they are owed) or turns it down. Once only. */
export async function decideCommissionRequest(id: string, userId: string, accept: boolean, note: string): Promise<void> {
  const { data, error } = await db().rpc("commission_decide_request", { p_id: id, p_user: userId, p_accept: accept, p_note: note });
  if (error) throw fail(error);
  if (data === "not_pending") throw new ApiError(409, "This payment is not waiting any more. Reload to see it.");
}
