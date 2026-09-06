import type { NextRequest } from "next/server";
import { ApiError, ok, requirePermission, requireUser, run } from "@/lib/api";
import { finalizeUpload, getLinkWithDomain } from "@/lib/files";
import { makeObjectKey, putObject } from "@/lib/r2";
import { cleanFilename, guessContentType } from "@/lib/utils";

// Vercel serverless functions accept request bodies up to ~4.5 MB. Larger files use the direct-to-R2 path.
const SERVER_UPLOAD_LIMIT = 4 * 1024 * 1024;

/** POST /api/admin/files/upload (multipart: file, link_id, file_id?) — fallback upload through the server. */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "Expected a multipart form upload");
    }
    const file = form.get("file");
    const linkId = String(form.get("link_id") ?? "");
    const fileId = form.get("file_id") ? String(form.get("file_id")) : null;

    if (!(file instanceof File)) throw new ApiError(400, "No file was sent");
    if (!linkId) throw new ApiError(400, "link_id is required");
    if (file.size > SERVER_UPLOAD_LIMIT) {
      throw new ApiError(413, "Files over 4 MB must be uploaded directly to storage (check the R2 CORS setup).");
    }

    if (fileId) requirePermission(user, "replace");
    else requirePermission(user, "upload");

    await getLinkWithDomain(linkId);
    const filename = cleanFilename(file.name);
    const contentType = guessContentType(filename, file.type);
    const key = makeObjectKey(filename);
    await putObject(key, new Uint8Array(await file.arrayBuffer()), contentType);

    const item = await finalizeUpload({ user, linkId, filename, key, contentType, fileId });
    return ok({ item }, { status: fileId ? 200 : 201 });
  });
}
