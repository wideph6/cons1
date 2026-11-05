import { ApiError } from "./errors";
import { deleteObject, presignDownload } from "./r2";
import { db } from "./supabase";

/**
 * Replaced files are kept for a while. When a user replaces an Old M file or a New M / Appo document's PDF,
 * visitors only ever get the new one, but the old one stays in R2 for KEEP_DAYS days so the super admin can
 * compare the two. After that it is deleted from R2 (the row stays, marked deleted_at, as a record of it).
 */
export type HistorySystem = "old_m" | "new_m" | "appo";
export const HISTORY_SYSTEMS: HistorySystem[] = ["old_m", "new_m", "appo"];
export const KEEP_DAYS = 15;

function missing(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export interface KeepInput {
  system: HistorySystem;
  recordId: string;
  label: string;
  oldKey: string;
  oldFilename: string;
  oldSize: number;
  oldContentType: string | null;
  newKey: string | null;
  newFilename: string;
  by: string | null;
}

/**
 * Keeps the file that was just replaced for KEEP_DAYS days instead of deleting it. Before supabase/finance.sql
 * has made the table, it is deleted straight away as it always was. Never throws: the replace already happened.
 */
export async function keepReplaced(input: KeepInput): Promise<void> {
  if (!input.oldKey || input.oldKey === input.newKey) return;
  try {
    const { error } = await db().from("replaced_files").insert({
      system: input.system,
      record_id: input.recordId,
      label: input.label,
      old_key: input.oldKey,
      old_filename: input.oldFilename,
      old_size: input.oldSize,
      old_content_type: input.oldContentType || "application/pdf",
      new_key: input.newKey,
      new_filename: input.newFilename,
      replaced_by: input.by,
      delete_after: new Date(Date.now() + KEEP_DAYS * 86_400_000).toISOString(),
    });
    if (!error) return;
    if (!missing(error)) console.error("[file-history] could not keep the replaced file", error.message);
  } catch (e) {
    console.error("[file-history] could not keep the replaced file", e);
  }
  await deleteObject(input.oldKey);
}

let lastSweep = 0;

/**
 * Deletes from R2 every kept file whose days are up. Cheap to call often: it runs at most once an hour per
 * server instance (force skips that). Never throws.
 */
export async function sweepReplaced(force = false): Promise<number> {
  if (!force && Date.now() - lastSweep < 3_600_000) return 0;
  lastSweep = Date.now();
  try {
    const { data, error } = await db()
      .from("replaced_files")
      .select("id,old_key")
      .is("deleted_at", null)
      .lte("delete_after", new Date().toISOString())
      .limit(200);
    if (error) {
      if (!missing(error)) console.error("[file-history] sweep failed", error.message);
      return 0;
    }
    let done = 0;
    for (const row of (data ?? []) as Array<{ id: string; old_key: string }>) {
      await deleteObject(row.old_key);
      const { error: upErr } = await db().from("replaced_files").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
      if (!upErr) done++;
    }
    return done;
  } catch (e) {
    console.error("[file-history] sweep failed", e);
    return 0;
  }
}

/** How many earlier files each record still has kept, by record id. */
export async function previousCounts(system: HistorySystem, recordIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!recordIds.length) return out;
  const { data, error } = await db()
    .from("replaced_files")
    .select("record_id")
    .eq("system", system)
    .in("record_id", recordIds)
    .is("deleted_at", null);
  if (error) {
    if (!missing(error)) console.error("[file-history] count failed", error.message);
    return out;
  }
  for (const r of (data ?? []) as Array<{ record_id: string }>) out.set(r.record_id, (out.get(r.record_id) ?? 0) + 1);
  return out;
}

/** One file shown in the comparison: links to show it in the page and to save it. */
export interface HistoryFile {
  filename: string;
  size: number;
  content_type: string;
  view_url: string;
  download_url: string;
}

export interface PreviousFile extends HistoryFile {
  id: string;
  replaced_at: string;
  delete_after: string;
  replaced_by_name: string | null;
}

const LINK_TTL = 60 * 60;

export async function fileLinks(key: string, filename: string, contentType: string, size: number): Promise<HistoryFile> {
  const [view, download] = await Promise.all([
    presignDownload(key, filename, "inline", contentType, LINK_TTL),
    presignDownload(key, filename, "attachment", contentType, LINK_TTL),
  ]);
  return { filename, size, content_type: contentType, view_url: view, download_url: download };
}

/** A record's earlier files still kept, newest first, with links to view and download each. */
export async function previousFiles(system: HistorySystem, recordId: string): Promise<PreviousFile[]> {
  const { data, error } = await db()
    .from("replaced_files")
    .select("id,old_key,old_filename,old_size,old_content_type,replaced_at,delete_after,users:replaced_by(name,email)")
    .eq("system", system)
    .eq("record_id", recordId)
    .is("deleted_at", null)
    .order("replaced_at", { ascending: false });
  if (error) {
    if (missing(error)) return [];
    throw new ApiError(500, error.message);
  }
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    old_key: string;
    old_filename: string;
    old_size: number;
    old_content_type: string;
    replaced_at: string;
    delete_after: string;
    users: { name: string | null; email: string | null } | null;
  }>;
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      replaced_at: r.replaced_at,
      delete_after: r.delete_after,
      replaced_by_name: r.users?.name || r.users?.email || null,
      ...(await fileLinks(r.old_key, r.old_filename || "previous.pdf", r.old_content_type || "application/pdf", Number(r.old_size ?? 0))),
    })),
  );
}

/**
 * Every R2 key the app is holding on to besides the records' own: kept replaced files and PDFs sent with
 * edits waiting for approval. The storage report counts them as in use, so its cleanup never takes them.
 */
export async function heldKeys(): Promise<string[]> {
  const [kept, newM, appo] = await Promise.all([
    db().from("replaced_files").select("old_key").is("deleted_at", null),
    db().from("new_m_pending_edits").select("new_doc_key").not("new_doc_key", "is", null),
    db().from("appo_pending_edits").select("new_doc_key").not("new_doc_key", "is", null),
  ]);
  for (const r of [kept, newM, appo]) {
    if (r.error && !missing(r.error)) throw new ApiError(500, r.error.message);
  }
  return [
    ...((kept.data ?? []) as Array<{ old_key: string }>).map((r) => r.old_key),
    ...((newM.data ?? []) as Array<{ new_doc_key: string }>).map((r) => r.new_doc_key),
    ...((appo.data ?? []) as Array<{ new_doc_key: string }>).map((r) => r.new_doc_key),
  ].filter(Boolean);
}
