import { ApiError } from "./errors";
import { deleteObject } from "./r2";
import { REVIEW_MISSING, reviewMissing } from "./review";
import type { OldMPendingChange, OldMPendingInfo } from "./review-shared";
import { db } from "./supabase";

/**
 * A commission user's replace, rename or move of one of their approved Old M files waits here for the super
 * admin (supabase/commission.sql); visitors keep getting the file as it was. One waiting change per file: a
 * later change to the same file joins it (a newer replacement takes the place of an earlier one).
 */

const TABLE = "old_m_pending_edits";
const COLUMNS =
  "id,file_id,new_filename,new_link_id,new_key,new_size,new_content_type,summary,requested_by,requested_at,users:requested_by(name,email)";

interface Row {
  id: string;
  file_id: string;
  new_filename: string | null;
  new_link_id: string | null;
  new_key: string | null;
  new_size: number | string | null;
  new_content_type: string | null;
  summary: OldMPendingChange[];
  requested_by: string | null;
  requested_at: string;
  users: { name: string | null; email: string | null } | null;
}

export interface OldMPendingRow {
  info: OldMPendingInfo;
  newFilename: string | null;
  newLinkId: string | null;
  newKey: string | null;
  newSize: number;
  newContentType: string | null;
  requestedBy: string | null;
}

function info(r: Row): OldMPendingInfo {
  return {
    id: r.id,
    requested_at: r.requested_at,
    requested_by_name: r.users?.name || r.users?.email || null,
    summary: Array.isArray(r.summary) ? r.summary : [],
  };
}

function toRow(r: Row): OldMPendingRow {
  return {
    info: info(r),
    newFilename: r.new_filename,
    newLinkId: r.new_link_id,
    newKey: r.new_key,
    newSize: Number(r.new_size ?? 0),
    newContentType: r.new_content_type,
    requestedBy: r.requested_by,
  };
}

/** The change waiting for each of these files, by file id. Empty before commission.sql has run. */
export async function oldMPendingFor(fileIds: string[]): Promise<Map<string, OldMPendingInfo>> {
  const out = new Map<string, OldMPendingInfo>();
  if (!fileIds.length) return out;
  const { data, error } = await db().from(TABLE).select(COLUMNS).in("file_id", fileIds);
  if (error) {
    if (!reviewMissing(error)) console.error("[old-m-pending] read failed", error.message);
    return out;
  }
  for (const r of (data ?? []) as unknown as Row[]) out.set(r.file_id, info(r));
  return out;
}

/** The change waiting for one file, or null. */
export async function oldMPendingRow(fileId: string): Promise<OldMPendingRow | null> {
  const { data, error } = await db().from(TABLE).select(COLUMNS).eq("file_id", fileId).maybeSingle();
  if (error) {
    if (reviewMissing(error)) return null;
    throw new ApiError(500, error.message);
  }
  return data ? toRow(data as unknown as Row) : null;
}

export interface OldMChange {
  /** A new file already uploaded to storage, to replace the current one. */
  key?: { key: string; size: number; contentType: string; sourceName: string };
  filename?: string;
  link?: { id: string; label: string };
}

/**
 * Keeps a change to an approved file waiting for approval, joined to any change already waiting for it.
 * current is the file as it is live now (name and link), for the review's before and after.
 */
export async function addOldMPending(input: {
  fileId: string;
  current: { filename: string; linkLabel: string };
  change: OldMChange;
  by: string;
}): Promise<OldMPendingInfo> {
  const before = await oldMPendingRow(input.fileId);
  const filename = input.change.filename ?? before?.newFilename ?? null;
  const linkId = input.change.link?.id ?? before?.newLinkId ?? null;
  const key = input.change.key ?? (before?.newKey ? { key: before.newKey, size: before.newSize, contentType: before.newContentType ?? "", sourceName: "" } : null);
  const earlier = (field: OldMPendingChange["field"]) => before?.info.summary.find((c) => c.field === field) ?? null;

  const summary: OldMPendingChange[] = [];
  if (key) {
    const was = earlier("file");
    summary.push(
      input.change.key
        ? { field: "file", label: "File", before: input.current.filename, after: `New file${input.change.key.sourceName ? ` (${input.change.key.sourceName})` : ""}` }
        : (was ?? { field: "file", label: "File", before: input.current.filename, after: "New file" }),
    );
  }
  if (filename !== null && filename !== input.current.filename) {
    summary.push({ field: "filename", label: "Name", before: input.current.filename, after: filename });
  }
  if (linkId) {
    const was = earlier("link");
    summary.push(
      input.change.link
        ? { field: "link", label: "Link", before: input.current.linkLabel, after: input.change.link.label }
        : (was ?? { field: "link", label: "Link", before: input.current.linkLabel, after: "Another link" }),
    );
  }
  if (!summary.length) throw new ApiError(400, "Nothing would change.");

  const { data, error } = await db()
    .from(TABLE)
    .upsert(
      {
        file_id: input.fileId,
        new_filename: filename !== null && filename !== input.current.filename ? filename : null,
        new_link_id: linkId,
        new_key: key?.key ?? null,
        new_size: key?.size ?? null,
        new_content_type: key?.contentType || null,
        summary,
        requested_by: input.by,
        requested_at: new Date().toISOString(),
      },
      { onConflict: "file_id" },
    )
    .select(COLUMNS)
    .single();
  if (error) {
    if (reviewMissing(error)) throw new ApiError(500, REVIEW_MISSING);
    throw new ApiError(500, error.message);
  }
  // A newer replacement takes the place of one already waiting; the earlier upload is not needed any more.
  if (input.change.key && before?.newKey && before.newKey !== input.change.key.key) {
    await deleteObject(before.newKey).catch(() => undefined);
  }
  return info(data as unknown as Row);
}

/** Takes a waiting change away (approved or turned down). */
export async function dropOldMPending(id: string): Promise<void> {
  const { error } = await db().from(TABLE).delete().eq("id", id);
  if (error && !reviewMissing(error)) throw new ApiError(500, error.message);
}
