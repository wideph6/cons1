import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, requireSuperadmin, requireUser, run } from "@/lib/api";
import { makeNewMKey, presignDownload, putObject } from "@/lib/r2";
import { cleanFilename, fileExtension } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Logos are small; anything larger is almost certainly the wrong file. */
const MAX_LOGO = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/**
 * POST /api/admin/new-m/page/asset (multipart: file) — stores a logo for the verification page in R2
 * under new-m/page/ and returns its key. The page points at it once the super admin saves; an upload
 * that is never saved is swept up by the storage cleanup.
 */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireSuperadmin(user);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "Expected a multipart form upload");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "No image was sent");
    if (file.size === 0) throw new ApiError(400, "The image is empty");
    if (file.size > MAX_LOGO) throw new ApiError(413, "The logo must be 2 MB or smaller");

    const filename = cleanFilename(file.name);
    const contentType = TYPES[fileExtension(filename)];
    if (!contentType) throw new ApiError(400, "The logo must be a PNG, JPG, WebP, GIF or SVG image");

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (contentType === "image/svg+xml") {
      const text = new TextDecoder().decode(bytes.slice(0, 4096)).toLowerCase();
      if (!text.includes("<svg")) throw new ApiError(400, "That file is not an SVG image");
    }

    const key = makeNewMKey("page", filename);
    await putObject(key, bytes, contentType);
    const url = await presignDownload(key, filename, "inline", contentType, 12 * 60 * 60);

    after(() => logActivity({ user_id: user.id, action: "upload_new_m_page_logo", details: { filename } }));
    return ok({ key, url, content_type: contentType, filename }, { status: 201 });
  });
}
