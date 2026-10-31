import { logActivity, type ActivityInput } from "./activity";
import { ApiError } from "./errors";
import { deleteObject, headObject, isManagedKey, isNewMKey, makeNewMKey, makeObjectKey } from "./r2";
import { db } from "./supabase";
import type { FileRow, LinkRow, User } from "./types";
import { guessContentType } from "./utils";

export const FILE_SELECT = "*, users(name,email), links!inner(id,path,domain_id,domains(id,hostname))";

/**
 * Where one file manager keeps its links, files and stored objects. Old M is the original and owns
 * the tables the public download route reads; New M mirrors it in tables and a prefix of its own.
 */
export interface FileStore {
  links: string;
  linksView: string;
  files: string;
  /** Embeds the link under the name `links`, so mapFile reads rows from either store the same way. */
  linkEmbed: string;
  select: string;
  makeKey: (filename: string) => string;
  isKey: (key: unknown) => key is string;
  /** Put in front of every activity action, so the two managers' history stays apart. */
  actionPrefix: string;
  /** activity_log.link_id and file_id are foreign keys to Old M's tables, so only Old M fills them. */
  logsIds: boolean;
}

export const OLD_M: FileStore = {
  links: "links",
  linksView: "links_view",
  files: "files",
  linkEmbed: "links",
  select: FILE_SELECT,
  makeKey: makeObjectKey,
  isKey: isManagedKey,
  actionPrefix: "",
  logsIds: true,
};

export const NEW_M: FileStore = {
  links: "new_m_links",
  linksView: "new_m_links_view",
  files: "new_m_files",
  linkEmbed: "links:new_m_links",
  select: "*, users(name,email), links:new_m_links!inner(id,path,domain_id,domains(id,hostname))",
  makeKey: makeNewMKey,
  isKey: isNewMKey,
  actionPrefix: "new_m_",
  logsIds: false,
};

/** Shown when New M's tables are not in the database yet. */
export const NEW_M_MISSING =
  "New M's tables are not in the database yet. Run supabase/new-m.sql in Supabase → SQL Editor, then reload this page.";

/** True when a query failed because its table does not exist, i.e. a setup SQL file has not been run yet. */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/** Record an action taken in one store. Never throws, like logActivity. */
export function logStoreActivity(store: FileStore, input: ActivityInput): Promise<void> {
  return logActivity({
    ...input,
    action: store.actionPrefix + input.action,
    link: input.link && !store.logsIds ? { id: null, path: input.link.path } : input.link,
    file: input.file && !store.logsIds ? { id: null, filename: input.file.filename } : input.file,
  });
}

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

export async function getLinkWithDomain(linkId: string, store: FileStore = OLD_M): Promise<LinkWithDomain> {
  const { data, error } = await db()
    .from(store.links)
    .select("id,domain_id,path,domains(id,hostname)")
    .eq("id", linkId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "Link not found");
  const d = data as unknown as { id: string; domain_id: string; path: string; domains: { id: string; hostname: string } | null };
  if (!d.domains) throw new ApiError(404, "Domain not found");
  return { id: d.id, domain_id: d.domain_id, path: d.path, domain: d.domains };
}

export async function getFileWithContext(fileId: string, store: FileStore = OLD_M): Promise<FileRow> {
  const { data, error } = await db().from(store.files).select(store.select).eq("id", fileId).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "File not found");
  return mapFile(data as unknown as RawFile);
}

export async function filenameTaken(
  linkId: string,
  filename: string,
  exceptFileId?: string,
  store: FileStore = OLD_M,
): Promise<boolean> {
  let q = db().from(store.files).select("id").eq("link_id", linkId).ilike("filename", filename.replace(/[%_]/g, "\\$&"));
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
  store?: FileStore;
}

/** After the bytes are in R2: verify the object, then insert (upload) or update (replace) the file row. */
export async function finalizeUpload(input: FinalizeInput): Promise<FileRow> {
  const store = input.store ?? OLD_M;
  if (!store.isKey(input.key)) throw new ApiError(400, "Invalid storage key");

  const head = await headObject(input.key);
  if (!head) throw new ApiError(400, "The uploaded file was not found in storage. Please upload again.");

  const link = await getLinkWithDomain(input.linkId, store);
  const contentType = guessContentType(input.filename, input.contentType ?? head.contentType);

  if (input.fileId) {
    const { data: existing, error } = await db()
      .from(store.files)
      .select("id,link_id,filename,r2_key,size")
      .eq("id", input.fileId)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!existing) throw new ApiError(404, "File to replace was not found");
    if (existing.link_id !== link.id) throw new ApiError(400, "File does not belong to this link");

    const now = new Date().toISOString();
    const { error: upErr } = await db()
      .from(store.files)
      .update({
        r2_key: input.key,
        size: head.size,
        content_type: contentType,
        replaced_at: now,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (upErr) throw new ApiError(500, upErr.message);

    if (existing.r2_key !== input.key) await deleteObject(existing.r2_key);

    await logStoreActivity(store, {
      user_id: input.user.id,
      action: "replace",
      domain: link.domain,
      link: { id: link.id, path: link.path },
      file: { id: existing.id, filename: existing.filename },
      details: { old_size: existing.size, new_size: head.size, source_name: input.filename },
    });
    return getFileWithContext(existing.id, store);
  }

  if (await filenameTaken(link.id, input.filename, undefined, store)) {
    await deleteObject(input.key);
    throw new ApiError(409, `A file named "${input.filename}" already exists in this link`);
  }

  const { data: created, error: insErr } = await db()
    .from(store.files)
    .insert({
      link_id: link.id,
      filename: input.filename,
      r2_key: input.key,
      size: head.size,
      content_type: contentType,
      uploaded_by: input.user.id,
    })
    .select("id")
    .single();
  if (insErr) {
    await deleteObject(input.key);
    if (insErr.code === "23505") throw new ApiError(409, `A file named "${input.filename}" already exists in this link`);
    throw new ApiError(500, insErr.message);
  }

  await logStoreActivity(store, {
    user_id: input.user.id,
    action: "upload",
    domain: link.domain,
    link: { id: link.id, path: link.path },
    file: { id: created.id, filename: input.filename },
    details: { size: head.size, content_type: contentType },
  });
  return getFileWithContext(created.id, store);
}

export async function listLinkKeys(linkIds: string[], store: FileStore = OLD_M): Promise<string[]> {
  if (!linkIds.length) return [];
  const { data, error } = await db().from(store.files).select("r2_key").in("link_id", linkIds);
  if (error) throw new ApiError(500, error.message);
  return (data ?? []).map((r) => r.r2_key as string);
}

export type { LinkRow };
