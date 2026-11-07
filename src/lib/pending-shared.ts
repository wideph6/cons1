/**
 * Edits to month-old New M and Appo documents wait for the super admin's approval. No server imports, so
 * the panel and the API agree on the rule.
 */

/** A document uploaded longer ago than this (by its upload date, not its attestation date) needs approval to change. */
export const APPROVAL_AFTER_DAYS = 30;

/**
 * Whether an edit by this user to a live document uploaded at createdAt waits for approval. The super admin's
 * never does; a commission user's always does.
 */
export function needsApproval(role: string, createdAt: string, now = Date.now()): boolean {
  if (role === "superadmin") return false;
  if (role === "commission") return true;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t > APPROVAL_AFTER_DAYS * 86_400_000;
}

/** One field a waiting edit changes, as the review shows it. */
export interface PendingChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

/** An edit waiting for approval, as a document in the list carries it. */
export interface PendingEditInfo {
  id: string;
  requested_at: string;
  requested_by_name: string | null;
  summary: PendingChange[];
  /** The edit replaces the PDF. */
  new_doc: boolean;
}
