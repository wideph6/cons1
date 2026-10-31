import { logActivity } from "./activity";
import { ApiError } from "./errors";
import { deleteObject, headObject, isManagedKey } from "./r2";
import { db } from "./supabase";
import type { FileRow, LinkRow, User } from "./types";
import { guessContentType } from "./utils";

export const FILE_SELECT = "*, users(name,email), links!inner(id,path,domain_id,domains(id,hostname))";

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
}

/** After the bytes are in R2: verify the object, then insert (upload) or update (replace) the file row. */
export async function finalizeUpload(input: FinalizeInput): Promise<FileRow> {
  if (!isManagedKey(input.key)) throw new ApiError(400, "Invalid storage key");

  const head = await headObject(input.key);
  if (!head) throw new ApiError(400, "The uploaded file was not found in storage. Please upload again.");

  const link = await getLinkWithDomain(input.linkId);
  const contentType = guessContentType(input.filename, input.contentType ?? head.contentType);

  if (input.fileId) {
    const { data: existing, error } = await db()
      .from("files")
      .select("id,link_id,filename,r2_key,size")
      .eq("id", input.fileId)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!existing) throw new ApiError(404, "File to replace was not found");
    if (existing.link_id !== link.id) throw new ApiError(400, "File does not belong to this link");

    const now = new Date().toISOString();
    const { error: upErr } = await db()
      .from("files")
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

export async function listLinkKeys(linkIds: string[]): Promise<string[]> {
  if (!linkIds.length) return [];
  const { data, error } = await db().from("files").select("r2_key").in("link_id", linkIds);
  if (error) throw new ApiError(500, error.message);
  return (data ?? []).map((r) => r.r2_key as string);
}

export type { LinkRow };
