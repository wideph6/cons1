import { ApiError } from "./errors";
import type { PendingChange, PendingEditInfo } from "./pending-shared";
import { db } from "./supabase";

/** Each system's table of edits waiting for approval (supabase/finance.sql). */
export type PendingTable = "new_m_pending_edits" | "appo_pending_edits";

export const PENDING_MISSING =
  "Edits to documents uploaded more than a month ago need the super admin's approval, but the table for them is not in the database yet. Run supabase/finance.sql in Supabase → SQL Editor, then try again.";

function missing(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

interface Row {
  id: string;
  record_id: string;
  request: Record<string, unknown>;
  summary: PendingChange[];
  new_doc_key: string | null;
  requested_by: string | null;
  requested_at: string;
  users: { name: string | null; email: string | null } | null;
}

const COLUMNS = "id,record_id,request,summary,new_doc_key,requested_by,requested_at,users:requested_by(name,email)";

function info(r: Row): PendingEditInfo {
  return {
    id: r.id,
    requested_at: r.requested_at,
    requested_by_name: r.users?.name || r.users?.email || null,
    summary: Array.isArray(r.summary) ? r.summary : [],
    new_doc: Boolean(r.new_doc_key),
  };
}

/** The edits waiting for each of these documents, by document id. Empty before finance.sql has run. */
export async function pendingFor(table: PendingTable, recordIds: string[]): Promise<Map<string, PendingEditInfo>> {
  const out = new Map<string, PendingEditInfo>();
  if (!recordIds.length) return out;
  const { data, error } = await db().from(table).select(COLUMNS).in("record_id", recordIds);
  if (error) {
    if (!missing(error)) console.error("[pending-edits] read failed", error.message);
    return out;
  }
  for (const r of (data ?? []) as unknown as Row[]) out.set(r.record_id, info(r));
  return out;
}

export interface PendingRow {
  info: PendingEditInfo;
  request: Record<string, unknown>;
  newDocKey: string | null;
  requestedBy: string | null;
}

/** The edit waiting for one document, with what was sent, or null when none is. */
export async function pendingRow(table: PendingTable, recordId: string): Promise<PendingRow | null> {
  const { data, error } = await db().from(table).select(COLUMNS).eq("record_id", recordId).maybeSingle();
  if (error) {
    if (missing(error)) return null;
    throw new ApiError(500, error.message);
  }
  if (!data) return null;
  const r = data as unknown as Row;
  return { info: info(r), request: r.request ?? {}, newDocKey: r.new_doc_key, requestedBy: r.requested_by };
}

/** Saves an edit to wait for approval. Only one may wait per document. */
export async function addPending(
  table: PendingTable,
  input: { recordId: string; request: unknown; summary: PendingChange[]; newDocKey: string | null; by: string },
): Promise<PendingEditInfo> {
  const { data, error } = await db()
    .from(table)
    .insert({ record_id: input.recordId, request: input.request, summary: input.summary, new_doc_key: input.newDocKey, requested_by: input.by })
    .select(COLUMNS)
    .single();
  if (error) {
    if (missing(error)) throw new ApiError(500, PENDING_MISSING);
    if (error.code === "23505") {
      throw new ApiError(409, "This document already has a change waiting for the super admin's approval. Wait for it to be approved or turned down.");
    }
    throw new ApiError(500, error.message);
  }
  return info(data as unknown as Row);
}

/** Takes a waiting edit away (approved or turned down). */
export async function dropPending(table: PendingTable, id: string): Promise<void> {
  const { error } = await db().from(table).delete().eq("id", id);
  if (error && !missing(error)) throw new ApiError(500, error.message);
}

/** A value as the review shows it. */
export function shown(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s || "—";
}
