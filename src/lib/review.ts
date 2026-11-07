import { ApiError } from "./errors";
import {
  CASE_LABELS,
  type CaseSystem,
  type ReviewItem,
  type ReviewQueue,
  type ReviewStatus,
} from "./review-shared";
import { db } from "./supabase";
import type { User } from "./types";

/**
 * Commission users' cases (supabase/commission.sql): each new one waits for the super admin's approval,
 * which pays its commission, and a commission user only ever sees their own. Shared by the Old M, New M
 * and Appo routes.
 */

export const REVIEW_MISSING =
  "Commission users need supabase/commission.sql. Run it in Supabase → SQL Editor, then try again.";

/** A table, column or function that commission.sql adds is not there yet. */
export function reviewMissing(error: { code?: string } | null | undefined): boolean {
  const c = error?.code;
  return c === "42P01" || c === "PGRST205" || c === "42703" || c === "PGRST202" || c === "42883" || c === "PGRST204";
}

export function isCommission(user: { role: string } | null | undefined): boolean {
  return user?.role === "commission";
}

/** A commission user only sees their own cases: anyone else's is "not found" to them. */
export function requireOwnCase(user: User, ownerId: string | null | undefined, what = "Document"): void {
  if (isCommission(user) && ownerId !== user.id) throw new ApiError(404, `${what} not found`);
}

/** The review columns a new case starts with: a commission user's waits for approval; everyone else's is live. */
export function newCaseReview(user: User): Record<string, unknown> {
  return isCommission(user) ? { review_status: "pending", review_note: "" } : {};
}

/** A commission user's case that is not live yet, changed: it is sent (again) for approval. */
export const RESUBMIT = { review_status: "pending", review_note: "" } as const;

/**
 * The super admin approves or turns down a waiting new case. Approved, it is live from now on and a commission
 * user's case earns their rate for its system — one database step, once. Turned down, it stays hidden with
 * the reason until its user changes it.
 */
export async function decideCase(system: CaseSystem, id: string, by: string, approve: boolean, note: string): Promise<ReviewStatus> {
  const { data, error } = await db().rpc("commission_review", {
    p_system: system,
    p_record: id,
    p_by: by,
    p_approve: approve,
    p_note: note,
  });
  if (error) {
    if (reviewMissing(error)) throw new ApiError(500, REVIEW_MISSING);
    throw new ApiError(500, error.message);
  }
  if (data === "not_pending") throw new ApiError(409, "This case is not waiting for approval any more. Reload to see where it stands.");
  if (data === "bad_system") throw new ApiError(400, "Unknown kind of case");
  return data as ReviewStatus;
}

/** A turned-down case its user sends again as it is. */
export async function resubmitCase(system: CaseSystem, id: string, user: User): Promise<void> {
  const table = system === "old_m" ? "files" : system === "new_m" ? "new_m_records" : "appo_records";
  const owner = system === "old_m" ? "uploaded_by" : "created_by";
  const { data, error } = await db()
    .from(table)
    .update(RESUBMIT)
    .eq("id", id)
    .eq(owner, user.id)
    .eq("review_status", "rejected")
    .select("id")
    .maybeSingle();
  if (error) {
    if (reviewMissing(error)) throw new ApiError(500, REVIEW_MISSING);
    throw new ApiError(500, error.message);
  }
  if (!data) throw new ApiError(409, "Only a case the super admin turned down can be sent again.");
}

/** A reason as typed: one line, at most 500 characters. */
export function cleanNote(input: unknown): string {
  return String(input ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

type Who = { name: string | null; email: string | null; role: string | null };

/** Names and roles of the people behind the queue's items, in one read. */
async function people(ids: string[]): Promise<Map<string, Who>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await db().from("users").select("id,name,email,role").in("id", unique);
  return new Map(((data ?? []) as Array<{ id: string } & Who>).map((u) => [u.id, u]));
}

const nameOf = (w: Who | undefined) => w?.name || w?.email || null;

/**
 * Everything waiting for the super admin, oldest first: new cases (Old M files, New M and Appo documents)
 * and edits to live cases (Old M, New M and Appo). Each part that is missing from the database (before
 * commission.sql or finance.sql) is simply left out.
 */
export async function reviewQueue(): Promise<ReviewQueue> {
  const [files, newM, appo, newMEdits, appoEdits, oldMEdits] = await Promise.all([
    db()
      .from("files")
      .select("id,filename,uploaded_by,uploaded_at,links(path,domains(hostname))")
      .eq("review_status", "pending")
      .order("uploaded_at")
      .limit(500),
    db()
      .from("new_m_view")
      .select("id,attestation_number,created_by,created_at,domain_hostname,link_name")
      .eq("review_status", "pending")
      .order("created_at")
      .limit(500),
    db()
      .from("appo_view")
      .select("id,attestation_number,created_by,created_at,domain_hostname,link_name")
      .eq("review_status", "pending")
      .order("created_at")
      .limit(500),
    db()
      .from("new_m_pending_edits")
      .select("record_id,summary,requested_by,requested_at,new_m_records(attestation_number,new_m_domains(hostname))")
      .order("requested_at")
      .limit(500),
    db()
      .from("appo_pending_edits")
      .select("record_id,summary,requested_by,requested_at,appo_records(attestation_number,appo_domains(hostname))")
      .order("requested_at")
      .limit(500),
    db()
      .from("old_m_pending_edits")
      .select("file_id,summary,requested_by,requested_at,files(filename,links(path,domains(hostname)))")
      .order("requested_at")
      .limit(500),
  ]);
  const ready = !reviewMissing(files.error) && !files.error;
  for (const r of [files, newM, appo, newMEdits, appoEdits, oldMEdits]) {
    if (r.error && !reviewMissing(r.error)) throw new ApiError(500, r.error.message);
  }
  type Change = { label?: string; before?: string; after?: string };
  const changes = (summary: unknown) =>
    (Array.isArray(summary) ? (summary as Change[]) : []).map((c) => ({
      label: String(c.label ?? ""),
      before: String(c.before ?? ""),
      after: String(c.after ?? ""),
    }));
  type Raw = Record<string, unknown>;
  const rows = <T,>(r: { data: unknown; error: unknown }) => (r.error ? [] : ((r.data ?? []) as T[]));

  const items: Array<Omit<ReviewItem, "requested_by_name" | "requested_by_role"> & { by: string | null }> = [];
  for (const f of rows<Raw & { links: { path: string; domains: { hostname: string } | null } | null }>(files)) {
    items.push({
      kind: "case",
      system: "old_m",
      id: String(f.id),
      label: String(f.filename),
      where: f.links ? `${f.links.domains?.hostname ?? "?"}/${f.links.path}` : "",
      by: (f.uploaded_by as string | null) ?? null,
      requested_at: String(f.uploaded_at),
      changes: [],
    });
  }
  for (const [system, data] of [
    ["new_m", newM],
    ["appo", appo],
  ] as const) {
    for (const r of rows<Raw>(data)) {
      items.push({
        kind: "case",
        system,
        id: String(r.id),
        label: String(r.attestation_number),
        where: [r.domain_hostname, r.link_name].filter(Boolean).join(" · "),
        by: (r.created_by as string | null) ?? null,
        requested_at: String(r.created_at),
        changes: [],
      });
    }
  }
  for (const e of rows<Raw & { new_m_records: { attestation_number: string; new_m_domains: { hostname: string } | null } | null }>(newMEdits)) {
    items.push({
      kind: "edit",
      system: "new_m",
      id: String(e.record_id),
      label: e.new_m_records?.attestation_number ?? "",
      where: e.new_m_records?.new_m_domains?.hostname ?? "",
      by: (e.requested_by as string | null) ?? null,
      requested_at: String(e.requested_at),
      changes: changes(e.summary),
    });
  }
  for (const e of rows<Raw & { appo_records: { attestation_number: string; appo_domains: { hostname: string } | null } | null }>(appoEdits)) {
    items.push({
      kind: "edit",
      system: "appo",
      id: String(e.record_id),
      label: e.appo_records?.attestation_number ?? "",
      where: e.appo_records?.appo_domains?.hostname ?? "",
      by: (e.requested_by as string | null) ?? null,
      requested_at: String(e.requested_at),
      changes: changes(e.summary),
    });
  }
  for (const e of rows<Raw & { files: { filename: string; links: { path: string; domains: { hostname: string } | null } | null } | null }>(oldMEdits)) {
    items.push({
      kind: "edit",
      system: "old_m",
      id: String(e.file_id),
      label: e.files?.filename ?? "",
      where: e.files?.links ? `${e.files.links.domains?.hostname ?? "?"}/${e.files.links.path}` : "",
      by: (e.requested_by as string | null) ?? null,
      requested_at: String(e.requested_at),
      changes: changes(e.summary),
    });
  }
  const who = await people(items.map((i) => i.by ?? ""));
  return {
    ready,
    items: items
      .map(({ by, ...i }) => ({ ...i, requested_by_name: nameOf(who.get(by ?? "")), requested_by_role: who.get(by ?? "")?.role ?? null }))
      .sort((a, b) => a.requested_at.localeCompare(b.requested_at)),
  };
}

/** How many things wait for the super admin, for the sidebar. 0 when the tables are not there yet. */
export async function reviewCount(): Promise<number> {
  const head = { count: "exact" as const, head: true };
  const results = await Promise.all([
    db().from("files").select("id", head).eq("review_status", "pending"),
    db().from("new_m_records").select("id", head).eq("review_status", "pending"),
    db().from("appo_records").select("id", head).eq("review_status", "pending"),
    db().from("new_m_pending_edits").select("id", head),
    db().from("appo_pending_edits").select("id", head),
    db().from("old_m_pending_edits").select("id", head),
  ]);
  return results.reduce((n, r) => n + (r.error ? 0 : (r.count ?? 0)), 0);
}

export { CASE_LABELS };
