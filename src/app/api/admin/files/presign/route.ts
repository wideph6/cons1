import type { NextRequest } from "next/server";
import { ApiError, must, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { filenameTaken, getLinkWithDomain } from "@/lib/files";
import { makeObjectKey, maxUploadBytes, presignUpload } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { cleanFilename, guessContentType } from "@/lib/utils";

interface Body {
  link_id?: string;
  filename?: string;
  size?: number;
  content_type?: string;
  file_id?: string; // present when replacing an existing file
}

/** POST /api/admin/files/presign — returns a short-lived direct-upload URL for R2. */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    const body = await readBody<Body>(req);

    const size = Number(body.size ?? 0);
    if (!Number.isFinite(size) || size < 0) throw new ApiError(400, "Invalid file size");
    const limit = maxUploadBytes();
    if (size > limit) throw new ApiError(413, `File is larger than the ${Math.round(limit / 1024 / 1024)} MB limit`);

    let linkId: string;
    let filename: string;

    if (body.file_id) {
      requirePermission(user, "replace");
      const existing = must(
        await db().from("files").select("id,link_id,filename").eq("id", body.file_id).maybeSingle(),
        "File not found",
      ) as { id: string; link_id: string; filename: string };
      linkId = existing.link_id;
      filename = existing.filename;
    } else {
      requirePermission(user, "upload");
      if (!body.link_id) throw new ApiError(400, "link_id is required");
      linkId = body.link_id;
      filename = cleanFilename(body.filename);
      await getLinkWithDomain(linkId);
      if (await filenameTaken(linkId, filename)) {
        throw new ApiError(409, `A file named "${filename}" already exists in this link. Use Replace instead.`);
      }
    }

    const contentType = guessContentType(filename, body.content_type);
    const key = makeObjectKey(filename);
    const url = await presignUpload(key, contentType, 900);

    return ok({ url, key, content_type: contentType, filename, link_id: linkId, max_bytes: limit });
  });
}
