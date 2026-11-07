/**
 * Cases made by commission users wait for the super admin's approval before visitors see them
 * (supabase/commission.sql). No server imports, so the panel and the API share these names.
 */

/** Where a case stands: live, waiting for the super admin, or turned down (hidden until its user changes it). */
export type ReviewStatus = "approved" | "pending" | "rejected";

/** The three kinds of case. */
export type CaseSystem = "old_m" | "new_m" | "appo";
export const CASE_SYSTEMS: CaseSystem[] = ["old_m", "new_m", "appo"];

export const CASE_LABELS: Record<CaseSystem, string> = {
  old_m: "Old M file",
  new_m: "New M document",
  appo: "Appo document",
};

/** A case's status as a record carries it; one saved before commission.sql ran has none and is approved. */
export function reviewOf(row: { review_status?: string | null } | null | undefined): ReviewStatus {
  const s = row?.review_status;
  return s === "pending" || s === "rejected" ? s : "approved";
}

/** The longest reason the super admin may give for turning a case down. */
export const MAX_REVIEW_NOTE = 500;

/** One change a waiting Old M edit makes, as the review shows it. */
export interface OldMPendingChange {
  field: "file" | "filename" | "link";
  label: string;
  before: string;
  after: string;
}

/** An edit to an approved Old M file, waiting for approval. */
export interface OldMPendingInfo {
  id: string;
  requested_at: string;
  requested_by_name: string | null;
  summary: OldMPendingChange[];
}

/** One item in the super admin's review queue: a new case waiting, or an edit waiting. */
export interface ReviewItem {
  /** "case": a new case (approving it pays its commission); "edit": a change to a live case (no commission). */
  kind: "case" | "edit";
  system: CaseSystem;
  /** The case: files.id, new_m_records.id or appo_records.id. */
  id: string;
  /** The file's name, or the document's attestation number. */
  label: string;
  /** The domain and link it is on, for finding it. */
  where: string;
  requested_by_name: string | null;
  requested_by_role: string | null;
  requested_at: string;
  /** For an edit: what it changes. */
  changes: Array<{ label: string; before: string; after: string }>;
}

export interface ReviewQueue {
  /** False until supabase/commission.sql has been run. */
  ready: boolean;
  items: ReviewItem[];
}
