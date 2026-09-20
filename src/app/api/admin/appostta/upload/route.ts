import type { NextRequest } from "next/server";
import { ApiError, ok, requireUser, run } from "@/lib/api";
import { requireApposttaWrite } from "@/lib/appostta";
import { makeApposttaKey, putObject, type ApposttaKind } from "@/lib/r2";
import { cleanFilename, guessContentType } from "@/lib/utils";

// Vercel serverless functions accept request bodies up to ~4.5 MB. Larger files use the direct-to-R2 path.
const SERVER_UPLOAD_LIMIT = 4 * 1024 * 1024;
const SIGNATURE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * POST /api/admin/appostta/upload (multipart: file, kind) — fallback for when the browser cannot
 * reach R2 directly, usually because the bucket has no CORS rule. Returns the key to attach.
 */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireApposttaWrite(user);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "Expected a multipart form upload");
    }

    const file = form.get("file");
    const rawKind = String(form.get("kind") ?? "");
    if (rawKind !== "docs" && rawKind !== "signatures") throw new ApiError(400, "kind must be 'docs' or 'signatures'");
    const kind: ApposttaKind = rawKind;

    if (!(file instanceof File)) throw new ApiError(400, "No file was sent");
    if (file.size > SERVER_UPLOAD_LIMIT) {
      throw new ApiError(413, "Files over 4 MB must be uploaded directly to storage (check the R2 CORS setup).");
    }

    const filename = cleanFilename(file.name);
    const contentType = guessContentType(filename, file.type);
    if (kind === "signatures" && !SIGNATURE_TYPES.includes(contentType)) {
      throw new ApiError(400, "The signature must be a PNG, JPEG, WebP or GIF image");
    }

    const key = makeApposttaKey(kind, filename);
    await putObject(key, new Uint8Array(await file.arrayBuffer()), contentType);

    return ok({ key, kind, filename, content_type: contentType, size: file.size }, { status: 201 });
  });
}
