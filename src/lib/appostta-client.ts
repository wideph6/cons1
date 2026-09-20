"use client";

import { api, ClientError, postFormWithProgress, putWithProgress } from "./client";

/** Files at or under this size can still go through the server when direct upload is blocked. */
const SERVER_FALLBACK_LIMIT = 4 * 1024 * 1024;

export interface UploadedObject {
  key: string;
  filename: string;
  content_type: string;
  size: number;
}

/**
 * Puts one file in R2 and returns the key to attach to a record.
 *
 * Tries the browser -> R2 direct upload first and falls back to posting through our own server when
 * that is blocked, which almost always means the bucket is missing a CORS rule.
 */
export async function uploadApposttaFile(
  file: File,
  kind: "docs" | "signatures",
  onProgress?: (fraction: number) => void,
): Promise<UploadedObject> {
  const presign = await api<{ url: string; key: string; content_type: string; filename: string }>(
    "/api/admin/appostta/presign",
    { json: { kind, filename: file.name, size: file.size, content_type: file.type } },
  );

  try {
    await putWithProgress(presign.url, file, presign.content_type, (p) => onProgress?.(p));
    return { key: presign.key, filename: presign.filename, content_type: presign.content_type, size: file.size };
  } catch (e) {
    const status = e instanceof ClientError ? e.status : -1;
    if (status !== 0) throw e;
    if (file.size > SERVER_FALLBACK_LIMIT) {
      throw new Error(
        "Direct upload to storage was blocked. Add a CORS rule to your R2 bucket (see README) — files over 4 MB need it.",
      );
    }
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    onProgress?.(0);
    return await postFormWithProgress<UploadedObject>("/api/admin/appostta/upload", form, (p) => onProgress?.(p));
  }
}
