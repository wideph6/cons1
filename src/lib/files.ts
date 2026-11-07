import { logActivity } from "./activity";
import { ApiError } from "./errors";
import { keepReplaced } from "./file-history";
import { addOldMPending } from "./old-m-pending";
import { deleteObject, headObject, isManagedKey } from "./r2";
import { isCommission, newCaseReview, requireOwnCase, RESUBMIT, REVIEW_MISSING, reviewMissing } from "./review";
import { reviewOf } from "./review-shared";
import { db } from "./supabase";
import type { FileRow, LinkRow, User } from "./types";
import { guessContentType } from "./utils";

/**
 * A file with its uploader and its link and domain. The uploader is named by its column: files has a second
 * user column (reviewed_by, supabase/commission.sql), and a plain users(...) would then be ambiguous.
 */
export const FILE_SELECT = "*, users:uploaded_by(name,email), links!inner(id,path,domain_id,domains(id,hostname))";

interface RawFile extends Omit<FileRow, "uploader" | "link"> {
  users?: { name: string; email: string } | null;
  links?: { id: string; path: string; domain_id: string; domains: { id: string; hostname: string } | null } | null;
}

export function mapFile(row: RawFile): FileRow {
  const { users, links, ...rest } = row;
  return {
    ...rest,
    uploader: users ?? null,
    link: links
      ? { id: links.id, path: links.path, domain: links.domains ?? { id: links.domain_id, hostname: "?" } }
      : null,
  };
}

export interface LinkWithDomain {
  id: string;
  domain_id: string;
  path: string;
  domain: { id: string; hostname: string };
}

export async function getLinkWithDomain(linkId: string): Promise<LinkWithDomain> {
  const { data, error } = await db()
    .from("links")
    .select("id,domain_id,path,domains(id,hostname)")
    .eq("id", linkId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "Link not found");
  const d = data as unknown as { id: string; domain_id: string; path: string; domains: { id: string; hostname: string } | null };
  if (!d.domains) throw new ApiError(404, "Domain not found");
  return { id: d.id, domain_id: d.domain_id, path: d.path, domain: d.domains };
}

export async function getFileWithContext(fileId: string): Promise<FileRow> {
  const { data, error } = await db().from("files").select(FILE_SELECT).eq("id", fileId).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "File not found");
  return mapFile(data as unknown as RawFile);
}

/** A file as this user may see it: a commission user only their own. */
export async function getFileFor(user: User, fileId: string): Promise<FileRow> {
  const file = await getFileWithContext(fileId);
  requireOwnCase(user, file.uploaded_by, "File");
  return file;
}

/** Where a file is, as the panel names it: domain/path. */
export function linkLabel(link: { path: string; domain: { hostname: string } } | null | undefined): string {
  return link ? `${link.domain.hostname}/${link.path}` : "";
}

/**
 * Renames and/or moves a file in one step, checked against the place it ends up in, and logged as a rename
 * and a move. resubmit sends a commission user's case that is not live yet for approval again.
 */
export async function placeFile(
  user: User,
  file: FileRow,
  change: { filename?: string; linkId?: string },
  opts: { resubmit?: boolean } = {},
): Promise<FileRow> {
  const filename = change.filename ?? file.filename;
  const target = change.linkId && change.linkId !== file.link_id ? await getLinkWithDomain(change.linkId) : null;
  const linkId = target?.id ?? file.link_id;
  if (filename === file.filename && !target) return file;
  if (await filenameTaken(linkId, filename, file.id)) {
    throw new ApiError(409, `A file named "${filename}" already exists in ${target ? "that" : "this"} link`);
  }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (filename !== file.filename) {
    patch.filename = filename;
    patch.content_type = guessContentType(filename, file.content_type);
    patch.renamed_at = now;
  }
  if (target) patch.link_id = target.id;
  if (opts.resubmit) Object.assign(patch, RESUBMIT);
  const { error } = await db().from("files").update(patch).eq("id", file.id);
  if (error) {
    if (error.code === "23505") throw new ApiError(409, `A file named "${filename}" already exists in ${target ? "that" : "this"} link`);
    throw new ApiError(500, error.message);
  }
  if (filename !== file.filename) {
    await logActivity({
      user_id: user.id,
      action: "rename",
      domain: file.link?.domain ?? null,
      link: file.link ? { id: file.link.id, path: file.link.path } : null,
      file: { id: file.id, filename },
      details: { from: file.filename, to: filename },
    });
  }
  if (target) {
    await logActivity({
      user_id: user.id,
      action: "move",
      domain: target.domain,
      link: { id: target.id, path: target.path },
      file: { id: file.id, filename },
      details: {
        from_hostname: file.link?.domain.hostname ?? null,
        from_path: file.link?.path ?? null,
        to_hostname: target.domain.hostname,
        to_path: target.path,
      },
    });
  }
  return getFileWithContext(file.id);
}

/**
 * A commission user's rename or move. Of a live file it waits for the super admin (visitors keep the file
 * as it is); of one not live yet it is made now and sends the file for approval again.
 */
export async function commissionPlaceFile(user: User, file: FileRow, change: { filename?: string; linkId?: string }): Promise<FileRow> {
  requireOwnCase(user, file.uploaded_by, "File");
  if (reviewOf(file) !== "approved") return placeFile(user, file, change, { resubmit: true });
  const target = change.linkId && change.linkId !== file.link_id ? await getLinkWithDomain(change.linkId) : null;
  const filename = change.filename && change.filename !== file.filename ? change.filename : undefined;
  if (!filename && !target) return file;
  if (await filenameTaken(target?.id ?? file.link_id, filename ?? file.filename, file.id)) {
    throw new ApiError(409, `A file named "${filename ?? file.filename}" already exists in ${target ? "that" : "this"} link`);
  }
  const pending = await addOldMPending({
    fileId: file.id,
    current: { filename: file.filename, linkLabel: linkLabel(file.link) },
    change: { filename, link: target ? { id: target.id, label: linkLabel(target) } : undefined },
    by: user.id,
  });
  await logActivity({
    user_id: user.id,
    action: "request_old_m_edit",
    domain: file.link?.domain ?? null,
    link: file.link ? { id: file.link.id, path: file.link.path } : null,
    file: { id: file.id, filename: file.filename },
    details: { changed: pending.summary.map((c) => c.field) },
  });
  return { ...file, pending_change: pending };
}

export async function filenameTaken(linkId: string, filename: string, exceptFileId?: string): Promise<boolean> {
  let q = db().from("files").select("id").eq("link_id", linkId).ilike("filename", filename.replace(/[%_]/g, "\\$&"));
  if (exceptFileId) q = q.neq("id", exceptFileId);
  const { data, error } = await q.limit(1);
  if (error) throw new ApiError(500, error.message);
  return (data?.length ?? 0) > 0;
}

export interface FinalizeInput {
  user: User;
  linkId: string;
  filename: string;
  key: string;
  contentType?: string | null;
  fileId?: string | null; // set when replacing
  sizeHint?: number;
  /** The super admin approved this replacement of a commission user's live file: it is saved now, as them. */
  approved?: boolean;
}

/** After the bytes are in R2: verify the object, then insert (upload) or update (replace) the file row. */
export async function finalizeUpload(input: FinalizeInput): Promise<FileRow> {
  if (!isManagedKey(input.key)) throw new ApiError(400, "Invalid storage key");

  const head = await headObject(input.key);
  if (!head) throw new ApiError(400, "The uploaded file was not found in storage. Please upload again.");

  const link = await getLinkWithDomain(input.linkId);
  const contentType = guessContentType(input.filename, input.contentType ?? head.contentType);
  const commission = isCommission(input.user);

  if (input.fileId) {
    // A commission user's replacement needs to know whose file it is and whether it is live.
    const { data: found, error } = await db()
      .from("files")
      .select(commission ? "id,link_id,filename,r2_key,size,content_type,uploaded_by,review_status" : "id,link_id,filename,r2_key,size,content_type")
      .eq("id", input.fileId)
      .maybeSingle();
    if (error) throw new ApiError(500, commission && reviewMissing(error) ? REVIEW_MISSING : error.message);
    const existing = found as unknown as {
      id: string;
      link_id: string;
      filename: string;
      r2_key: string;
      size: number | null;
      content_type: string | null;
      uploaded_by?: string | null;
      review_status?: string | null;
    } | null;
    if (!existing) throw new ApiError(404, "File to replace was not found");
    if (commission) requireOwnCase(input.user, existing.uploaded_by, "File");
    if (existing.link_id !== link.id) throw new ApiError(400, "File does not belong to this link");

    // A commission user's new version of a live file waits for the super admin; visitors keep the current one.
    if (commission && !input.approved && reviewOf(existing) === "approved") {
      const pending = await addOldMPending({
        fileId: existing.id,
        current: { filename: existing.filename, linkLabel: linkLabel(link) },
        change: { key: { key: input.key, size: head.size, contentType, sourceName: input.filename } },
        by: input.user.id,
      });
      await logActivity({
        user_id: input.user.id,
        action: "request_old_m_edit",
        domain: link.domain,
        link: { id: link.id, path: link.path },
        file: { id: existing.id, filename: existing.filename },
        details: { changed: ["file"], new_size: head.size, source_name: input.filename },
      });
      return { ...(await getFileWithContext(existing.id)), pending_change: pending };
    }

    const now = new Date().toISOString();
    const { error: upErr } = await db()
      .from("files")
      .update({
        r2_key: input.key,
        size: head.size,
        content_type: contentType,
        replaced_at: now,
        updated_at: now,
        // A commission user's case that is not live yet goes back for approval with its new file.
        ...(commission && !input.approved ? RESUBMIT : {}),
      })
      .eq("id", existing.id);
    if (upErr) throw new ApiError(500, upErr.message);

    // Visitors get the new file from now on; the old one is kept for 15 days so the super admin can compare.
    if (existing.r2_key !== input.key) {
      await keepReplaced({
        system: "old_m",
        recordId: existing.id,
        label: existing.filename,
        oldKey: existing.r2_key,
        oldFilename: existing.filename,
        oldSize: Number(existing.size ?? 0),
        oldContentType: (existing.content_type as string | null) ?? null,
        newKey: input.key,
        newFilename: input.filename,
        by: input.user.id,
      });
    }

    await logActivity({
      user_id: input.user.id,
      action: "replace",
      domain: link.domain,
      link: { id: link.id, path: link.path },
      file: { id: existing.id, filename: existing.filename },
      details: { old_size: existing.size, new_size: head.size, source_name: input.filename },
    });
    return getFileWithContext(existing.id);
  }

  if (await filenameTaken(link.id, input.filename)) {
    await deleteObject(input.key);
    throw new ApiError(409, `A file named "${input.filename}" already exists in this link`);
  }

  const { data: created, error: insErr } = await db()
    .from("files")
    .insert({
      link_id: link.id,
      filename: input.filename,
      r2_key: input.key,
      size: head.size,
      content_type: contentType,
      uploaded_by: input.user.id,
      // A commission user's upload waits for the super admin before visitors can download it.
      ...newCaseReview(input.user),
    })
    .select("id")
    .single();
  if (insErr) {
    await deleteObject(input.key);
    if (insErr.code === "23505") throw new ApiError(409, `A file named "${input.filename}" already exists in this link`);
    throw new ApiError(500, insErr.message);
  }

  await logActivity({
    user_id: input.user.id,
    action: "upload",
    domain: link.domain,
    link: { id: link.id, path: link.path },
    file: { id: created.id, filename: input.filename },
    details: { size: head.size, content_type: contentType },
  });
  return getFileWithContext(created.id);
}

/**
 * Links with their counts made of this user's own files only: a commission user sees every link (to upload
 * into) but nobody else's files, nor how many there are.
 */
export async function withOwnCounts<T extends { id: string }>(userId: string, links: T[]): Promise<T[]> {
  const { data, error } = await db().from("files").select("link_id,size,uploaded_at").eq("uploaded_by", userId);
  if (error) throw new ApiError(500, error.message);
  const mine = new Map<string, { count: number; size: number; last: string | null }>();
  for (const f of (data ?? []) as Array<{ link_id: string; size: number | null; uploaded_at: string }>) {
    const m = mine.get(f.link_id) ?? { count: 0, size: 0, last: null };
    m.count++;
    m.size += Number(f.size ?? 0);
    if (!m.last || f.uploaded_at > m.last) m.last = f.uploaded_at;
    mine.set(f.link_id, m);
  }
  return links.map((l) => ({
    ...l,
    file_count: mine.get(l.id)?.count ?? 0,
    total_size: mine.get(l.id)?.size ?? 0,
    last_upload_at: mine.get(l.id)?.last ?? null,
  }));
}

export async function listLinkKeys(linkIds: string[]): Promise<string[]> {
  if (!linkIds.length) return [];
  const { data, error } = await db().from("files").select("r2_key").in("link_id", linkIds);
  if (error) throw new ApiError(500, error.message);
  return (data ?? []).map((r) => r.r2_key as string);
}

export type { LinkRow };
