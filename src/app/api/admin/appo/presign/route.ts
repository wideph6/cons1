import type { NextRequest } from "next/server";
import { ApiError, ok, readBody, requireUser, run } from "@/lib/api";
import { requireAppoWrite } from "@/lib/appo";
import { maxUploadBytes, presignUpload } from "@/lib/r2";
import { makeAppoKey, type AppoKind } from "@/lib/appo-r2";
import { cleanFilename, fileExtension, guessContentType } from "@/lib/utils";

interface Body {
  kind?: string;
  filename?: string;
  size?: number;
  content_type?: string;
}

/** Signature images are shown small; anything larger is a mistake. */
const SIGNATURE_LIMIT = 2 * 1024 * 1024;
const SIGNATURE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function parseKind(v: unknown): AppoKind {
  if (v === "docs" || v === "signatures") return v;
  throw new ApiError(400, "kind must be 'docs' or 'signatures'");
}

/** POST /api/admin/appo/presign — a short-lived direct-upload URL for R2. */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireAppoWrite(user);
    const body = await readBody<Body>(req);

    const kind = parseKind(body.kind);
    const size = Number(body.size ?? 0);
    if (!Number.isFinite(size) || size < 0) throw new ApiError(400, "Invalid file size");

    const filename = cleanFilename(body.filename);
    const contentType = guessContentType(filename, body.content_type);

    const limit = kind === "signatures" ? SIGNATURE_LIMIT : maxUploadBytes();
    if (size > limit) {
      throw new ApiError(413, `File is larger than the ${Math.round(limit / 1024 / 1024)} MB limit`);
    }
    if (kind === "docs" && fileExtension(filename) !== "pdf") {
      throw new ApiError(400, "Only PDF files can be uploaded to Appo");
    }
    if (kind === "signatures" && !SIGNATURE_TYPES.includes(contentType)) {
      throw new ApiError(400, "The signature must be a PNG, JPEG, WebP or GIF image");
    }

    const key = makeAppoKey(kind, filename);
    const url = await presignUpload(key, contentType, 900);

    return ok({ url, key, kind, content_type: contentType, filename, max_bytes: limit });
  });
}
