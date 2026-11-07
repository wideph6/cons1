import type { CommissionOverviewRow } from "./commission-shared";
import type { CountedAction } from "./types";

/**
 * Users' finance accounts: what each admin owes for the entries they make, and what they have paid. No
 * server imports, so the panel and the API share these names and sums.
 */

/** The three kinds of new entry an admin is charged for. */
export type FinanceSystem = "old_m" | "new_m" | "appo";
export const FINANCE_SYSTEMS: FinanceSystem[] = ["old_m", "new_m", "appo"];

export const SYSTEM_LABELS: Record<FinanceSystem, string> = {
  old_m: "Old M file upload",
  new_m: "New M document",
  appo: "Appo document",
};

/** The counted actions that cost money, and which rate each uses. Replaces, renames and deletes cost nothing. */
export const BILLED_ACTIONS: Partial<Record<CountedAction, FinanceSystem>> = {
  upload: "old_m",
  create_new_m: "new_m",
  create_appo: "appo",
};

/** What one new entry of each kind costs now, in rupees. */
export type FinanceRates = Record<FinanceSystem, number>;
export const NO_RATES: FinanceRates = { old_m: 0, new_m: 0, appo: 0 };

export type FinanceEntryKind = "charge" | "count_change" | "payment";

export interface FinanceEntry {
  id: number;
  kind: FinanceEntryKind;
  system: FinanceSystem | null;
  quantity: number;
  rate: number;
  /** Adds to what the user owes (positive) or takes off it (negative). */
  amount: number;
  note: string;
  request_id: string | null;
  created_by_name: string | null;
  created_at: string;
}

export type FinanceRequestStatus = "pending" | "accepted" | "rejected";

export interface FinanceRequest {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  amount: number;
  note: string;
  status: FinanceRequestStatus;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string;
  created_at: string;
}

export interface FinanceBalance {
  /** What the user owes now (negative when they paid more). */
  pending: number;
  /** Everything they have paid. */
  paid: number;
  /** Everything their entries were charged. */
  charged: number;
}

export const NO_BALANCE: FinanceBalance = { pending: 0, paid: 0, charged: 0 };

/** One user's account, as the super admin (or the user, when allowed) sees it. */
export interface FinanceAccount {
  user: { id: string; name: string; email: string; role: string };
  /** The user may see this account and send payment requests. */
  visible: boolean;
  balance: FinanceBalance;
  entries: FinanceEntry[];
  requests: FinanceRequest[];
  rates: FinanceRates;
}

/** Every user's balance, for the super admin's overview. */
export interface FinanceOverviewRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  visible: boolean;
  balance: FinanceBalance;
  pending_requests: number;
}

export interface FinanceOverview {
  /** False until supabase/finance.sql has been run. */
  ready: boolean;
  rates: FinanceRates;
  /** Admins (and the super admin): what they owe. */
  users: FinanceOverviewRow[];
  requests: FinanceRequest[];
  /** False until supabase/commission.sql has been run. */
  commission_ready: boolean;
  /** Commission users: what they are owed. */
  commission: CommissionOverviewRow[];
}

/** Money as the panel writes it: Rs 1,250 or Rs 1,250.50. */
export function formatMoney(n: number): string {
  const v = Math.round(n * 100) / 100;
  const whole = Number.isInteger(v);
  return `Rs ${v.toLocaleString("en-PK", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** A rupee amount typed in: positive, at most two decimals. Null when it is not one. */
export function parseAmount(input: unknown): number | null {
  const n = typeof input === "number" ? input : typeof input === "string" && input.trim() !== "" ? Number(input.trim().replace(/,/g, "")) : NaN;
  if (!Number.isFinite(n)) return null;
  const v = Math.round(n * 100) / 100;
  return v > 0 && v <= 100_000_000 ? v : null;
}

/**
 * What changing a count by delta entries does to what the user owes: delta x the rate now in force, for the
 * actions that cost money and for admins only (the super admin is never charged). Zero otherwise.
 */
export function countChangeAmount(action: CountedAction, delta: number, rates: FinanceRates, role: string): number {
  const system = BILLED_ACTIONS[action];
  if (!system || role !== "admin") return 0;
  return Math.round(delta * rates[system] * 100) / 100;
}
