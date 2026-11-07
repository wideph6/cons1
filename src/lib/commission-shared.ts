import type { CaseSystem } from "./review-shared";

/**
 * Commission users' accounts: what each is owed for their approved cases, and what they have been paid
 * (supabase/commission.sql). Unlike an admin's account (what they owe), the money here goes to the user.
 * No server imports, so the panel and the API share these names and sums.
 */

/** What one approved new case earns this user, by system, in rupees. */
export type CommissionRates = Record<CaseSystem, number>;
export const NO_COMMISSION_RATES: CommissionRates = { old_m: 0, new_m: 0, appo: 0 };

export const COMMISSION_LABELS: Record<CaseSystem, string> = {
  old_m: "Old M file (each approved upload)",
  new_m: "New M document (each approved)",
  appo: "Appo document (each approved)",
};

export type CommissionEntryKind = "commission" | "reversal" | "payment";

export interface CommissionEntry {
  id: number;
  kind: CommissionEntryKind;
  system: CaseSystem | null;
  /** The case it is for (commission, reversal). */
  record_id: string | null;
  /** The case's file name or attestation number. */
  label: string;
  rate: number;
  /** Adds to what the user is owed (positive) or takes off it (negative). */
  amount: number;
  note: string;
  request_id: string | null;
  created_by_name: string | null;
  created_at: string;
}

export type CommissionRequestStatus = "pending" | "accepted" | "rejected" | "cancelled";

/** A payment the super admin sent; it counts once the user accepts it. */
export interface CommissionRequest {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  amount: number;
  note: string;
  status: CommissionRequestStatus;
  created_by_name: string | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string;
}

export interface CommissionBalance {
  /** What the user is owed now (negative when paid more). */
  remaining: number;
  /** Everything their approved cases earned. */
  earned: number;
  /** Taken back for cases deleted after approval. */
  reversed: number;
  /** Everything paid to them. */
  paid: number;
}
export const NO_COMMISSION_BALANCE: CommissionBalance = { remaining: 0, earned: 0, reversed: 0, paid: 0 };

/** One commission user's account, as the super admin (or the user, when allowed) sees it. */
export interface CommissionAccount {
  user: { id: string; name: string; email: string; role: string };
  /** The user sees their Finance tab: payments to them wait for them to accept. Off: the super admin records them. */
  visible: boolean;
  rates: CommissionRates;
  balance: CommissionBalance;
  /** Payments sent and still waiting for the user. */
  waiting: number;
  entries: CommissionEntry[];
  requests: CommissionRequest[];
}

/** Every commission user's account in brief, for the super admin's Finance page. */
export interface CommissionOverviewRow {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  visible: boolean;
  balance: CommissionBalance;
  waiting: number;
}
