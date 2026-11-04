import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, requireSuperadmin, requireUser, run } from "@/lib/api";
import { presignDownload, putObject } from "@/lib/r2";
import { makeAppoKey } from "@/lib/appo-r2";
import { cleanFilename, fileExtension } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Logos are small; anything larger is almost certainly the wrong file. */
const MAX_LOGO = 2 * 1024 * 1024;
/** A favicon is fetched with every first visit, so it is kept smaller still. */
const MAX_FAVICON = 1024 * 1024;
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};
/** A favicon may also be the classic .ico. */
const FAVICON_TYPES: Record<string, string> = { ...TYPES, ico: "image/x-icon" };

/**
 * POST /api/admin/appo/page/asset (multipart: file, kind?) — stores a logo, or with kind=favicon the
 * browser tab's icon, for the verification page in R2 under appo/page/ and returns its key. The page
 * points at it once the super admin saves; an upload that is never saved is swept up by the storage
 * cleanup.
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
    const favicon = form.get("kind") === "favicon";
    const what = favicon ? "favicon" : "logo";
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "No image was sent");
    if (file.size === 0) throw new ApiError(400, "The image is empty");
    if (file.size > (favicon ? MAX_FAVICON : MAX_LOGO)) {
      throw new ApiError(413, `The ${what} must be ${favicon ? "1" : "2"} MB or smaller`);
    }

    const filename = cleanFilename(file.name);
    const contentType = (favicon ? FAVICON_TYPES : TYPES)[fileExtension(filename)];
    if (!contentType) {
      throw new ApiError(400, favicon ? "The favicon must be an ICO, PNG, SVG, JPG, WebP or GIF image" : "The logo must be a PNG, JPG, WebP, GIF or SVG image");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (contentType === "image/svg+xml") {
      const text = new TextDecoder().decode(bytes.slice(0, 4096)).toLowerCase();
      if (!text.includes("<svg")) throw new ApiError(400, "That file is not an SVG image");
    }
    if (contentType === "image/x-icon" && !(bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0)) {
      throw new ApiError(400, "That file is not an ICO image");
    }

    const key = makeAppoKey("page", filename);
    await putObject(key, bytes, contentType);
    const url = await presignDownload(key, filename, "inline", contentType, 12 * 60 * 60);

    after(() =>
      logActivity({ user_id: user.id, action: favicon ? "upload_appo_page_favicon" : "upload_appo_page_logo", details: { filename } }),
    );
    return ok({ key, url, content_type: contentType, filename }, { status: 201 });
  });
}
