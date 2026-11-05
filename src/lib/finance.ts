import { ApiError } from "./errors";
import {
  FINANCE_SYSTEMS,
  NO_BALANCE,
  NO_RATES,
  type FinanceAccount,
  type FinanceBalance,
  type FinanceEntry,
  type FinanceRates,
  type FinanceRequest,
  type FinanceSystem,
} from "./finance-shared";
import { db } from "./supabase";

/** Shown when the finance tables are not in the database yet. */
export const FINANCE_MISSING =
  "The finance tables are not in the database yet. Run supabase/finance.sql in Supabase → SQL Editor, then reload this page.";

function missing(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202" || error?.code === "42883";
}

function fail(error: { code?: string; message: string }): ApiError {
  return missing(error) ? new ApiError(500, FINANCE_MISSING) : new ApiError(500, error.message);
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Whether supabase/finance.sql has been run. */
export async function financeReady(): Promise<boolean> {
  const { error } = await db().from("finance_settings").select("id").limit(1);
  if (error && missing(error)) return false;
  if (error) throw fail(error);
  return true;
}

/** What one new entry of each kind costs now; nothing while finance.sql has not been run. */
export async function getRates(): Promise<FinanceRates> {
  const { data, error } = await db().from("finance_settings").select("rate_old_m,rate_new_m,rate_appo").eq("id", true).maybeSingle();
  if (error) {
    if (missing(error)) return { ...NO_RATES };
    throw fail(error);
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return { old_m: num(r.rate_old_m), new_m: num(r.rate_new_m), appo: num(r.rate_appo) };
}

export async function setRates(rates: FinanceRates, by: string): Promise<FinanceRates> {
  const { error } = await db()
    .from("finance_settings")
    .upsert({ id: true, rate_old_m: rates.old_m, rate_new_m: rates.new_m, rate_appo: rates.appo, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw fail(error);
  return rates;
}

/** Every user's balance by id. */
export async function getBalances(userIds?: string[]): Promise<Map<string, FinanceBalance>> {
  let q = db().from("finance_balances").select("user_id,pending,paid,charged");
  if (userIds) q = q.in("user_id", userIds);
  const { data, error } = await q;
  if (error) {
    if (missing(error)) return new Map();
    throw fail(error);
  }
  const out = new Map<string, FinanceBalance>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    out.set(String(r.user_id), { pending: num(r.pending), paid: num(r.paid), charged: num(r.charged) });
  }
  return out;
}

/** Who may see their own account. */
export async function getVisibility(userIds?: string[]): Promise<Map<string, boolean>> {
  let q = db().from("finance_accounts").select("user_id,visible");
  if (userIds) q = q.in("user_id", userIds);
  const { data, error } = await q;
  if (error) {
    if (missing(error)) return new Map();
    throw fail(error);
  }
  return new Map(((data ?? []) as Array<{ user_id: string; visible: boolean }>).map((r) => [r.user_id, Boolean(r.visible)]));
}

/** Whether this user may see their own account; false while finance.sql has not been run. */
export async function canSeeOwnAccount(userId: string): Promise<boolean> {
  return (await getVisibility([userId])).get(userId) ?? false;
}

export async function setVisible(userId: string, visible: boolean, by: string): Promise<void> {
  const { error } = await db()
    .from("finance_accounts")
    .upsert({ user_id: userId, visible, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw fail(error);
}

interface RequestRow {
  id: string;
  user_id: string;
  amount: number | string;
  note: string;
  status: FinanceRequest["status"];
  decided_at: string | null;
  decision_note: string;
  created_at: string;
  requester: { name: string | null; email: string | null } | null;
  decider: { name: string | null; email: string | null } | null;
}

const REQUEST_COLUMNS =
  "id,user_id,amount,note,status,decided_at,decision_note,created_at,requester:users!finance_requests_user_id_fkey(name,email),decider:users!finance_requests_decided_by_fkey(name,email)";

function mapRequest(r: RequestRow): FinanceRequest {
  return {
    id: r.id,
    user_id: r.user_id,
    user_name: r.requester?.name ?? null,
    user_email: r.requester?.email ?? null,
    amount: num(r.amount),
    note: r.note ?? "",
    status: r.status,
    decided_by_name: r.decider?.name || r.decider?.email || null,
    decided_at: r.decided_at,
    decision_note: r.decision_note ?? "",
    created_at: r.created_at,
  };
}

/** Payment requests, newest first: one user's, or everyone's (only those waiting, when pendingOnly). */
export async function listRequests(opts: { userId?: string; pendingOnly?: boolean; limit?: number } = {}): Promise<FinanceRequest[]> {
  let q = db().from("finance_requests").select(REQUEST_COLUMNS);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.pendingOnly) q = q.eq("status", "pending");
  const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (error) {
    if (missing(error)) return [];
    throw fail(error);
  }
  return ((data ?? []) as unknown as RequestRow[]).map(mapRequest);
}

/** One user's account: balance, the latest changes to it, their requests and the rates now in force. */
export async function getAccount(user: { id: string; name: string; email: string; role: string }): Promise<FinanceAccount> {
  const [balances, visibility, entries, requests, rates] = await Promise.all([
    getBalances([user.id]),
    getVisibility([user.id]),
    db()
      .from("finance_entries")
      .select("id,kind,system,quantity,rate,amount,note,request_id,created_at,creator:users!finance_entries_created_by_fkey(name,email)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(300),
    listRequests({ userId: user.id, limit: 100 }),
    getRates(),
  ]);
  if (entries.error && !missing(entries.error)) throw fail(entries.error);
  const rows = (entries.data ?? []) as unknown as Array<Record<string, unknown> & { creator: { name: string | null; email: string | null } | null }>;
  const mapped: FinanceEntry[] = rows.map((e) => ({
    id: Number(e.id),
    kind: e.kind as FinanceEntry["kind"],
    system: (e.system as FinanceSystem | null) ?? null,
    quantity: num(e.quantity),
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
    balance: balances.get(user.id) ?? { ...NO_BALANCE },
    entries: mapped,
    requests,
    rates,
  };
}

/** Money the super admin received in hand, taken off what the user owes. */
export async function recordPayment(userId: string, amount: number, note: string, by: string): Promise<void> {
  const { error } = await db().from("finance_entries").insert({ user_id: userId, kind: "payment", amount: -amount, note, created_by: by });
  if (error) throw fail(error);
}

export async function createRequest(userId: string, amount: number, note: string): Promise<FinanceRequest> {
  const { data, error } = await db().from("finance_requests").insert({ user_id: userId, amount, note }).select(REQUEST_COLUMNS).single();
  if (error) throw fail(error);
  return mapRequest(data as unknown as RequestRow);
}

/** Accepts (taking the amount off what the user owes) or turns down a waiting payment request. */
export async function decideRequest(id: string, accept: boolean, note: string, by: string): Promise<FinanceRequest> {
  const { data, error } = await db().rpc("finance_decide_request", { p_id: id, p_by: by, p_accept: accept, p_note: note });
  if (error) throw fail(error);
  if (data === "not_pending") throw new ApiError(409, "This request was already decided. Reload to see it.");
  const { data: row, error: rErr } = await db().from("finance_requests").select(REQUEST_COLUMNS).eq("id", id).single();
  if (rErr) throw fail(rErr);
  return mapRequest(row as unknown as RequestRow);
}

/** Rates as typed in settings: each 0 or more, at most two decimals. */
export function cleanRates(input: unknown): FinanceRates {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = { ...NO_RATES };
  for (const s of FINANCE_SYSTEMS) {
    const raw = o[s];
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : 0;
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new ApiError(400, "Each amount must be 0 or more");
    out[s] = Math.round(n * 100) / 100;
  }
  return out;
}
