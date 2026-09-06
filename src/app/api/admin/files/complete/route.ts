import type { NextRequest } from "next/server";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { finalizeUpload } from "@/lib/files";
import { cleanFilename } from "@/lib/utils";

interface Body {
  link_id?: string;
  filename?: string;
  key?: string;
  content_type?: string;
  file_id?: string;
}

/** POST /api/admin/files/complete — called after the browser finished the direct upload to R2. */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    const body = await readBody<Body>(req);
    if (!body.key) throw new ApiError(400, "key is required");
    if (!body.link_id) throw new ApiError(400, "link_id is required");

    if (body.file_id) requirePermission(user, "replace");
    else requirePermission(user, "upload");

    const item = await finalizeUpload({
      user,
      linkId: body.link_id,
      filename: cleanFilename(body.filename ?? body.key.split("/").pop()),
      key: body.key,
      contentType: body.content_type,
      fileId: body.file_id ?? null,
    });
    return ok({ item }, { status: body.file_id ? 200 : 201 });
  });
}
