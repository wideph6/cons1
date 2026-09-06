import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { cleanFilename, contentDisposition } from "./utils";

let client: S3Client | null = null;

function bucket(): string {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error("R2_BUCKET must be set.");
  return b;
}

export function r2(): S3Client {
  if (client) return client;
  const account = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!account || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set.");
  }
  client = new S3Client({
    region: "auto",
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // R2 does not want the newer default checksum headers on every request.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

/** Unique object key; the original name is kept in the key for readability in the R2 dashboard. */
export function makeObjectKey(filename: string): string {
  const safe = cleanFilename(filename).replace(/[^A-Za-z0-9._-]/g, "_");
  return `files/${crypto.randomUUID()}/${safe}`;
}

export function isManagedKey(key: unknown): key is string {
  return typeof key === "string" && /^files\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(key);
}

export async function presignUpload(key: string, contentType: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

export async function presignDownload(
  key: string,
  filename: string,
  disposition: "attachment" | "inline",
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: contentDisposition(disposition, filename),
      ResponseContentType: contentType,
      ResponseCacheControl: "private, no-store",
    }),
    { expiresIn },
  );
}

export async function headObject(key: string): Promise<{ size: number; contentType: string | undefined } | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404 || (e as { name?: string })?.name === "NotFound") return null;
    throw e;
  }
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await r2().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, ContentLength: body.byteLength }),
  );
}

export async function getObjectStream(key: string) {
  const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return res;
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (e) {
    console.warn("[r2] delete failed", key, e);
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    try {
      await r2().send(
        new DeleteObjectsCommand({
          Bucket: bucket(),
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    } catch (e) {
      console.warn("[r2] bulk delete failed, falling back to single deletes", e);
      for (const k of chunk) await deleteObject(k);
    }
  }
}

export function maxUploadBytes(): number {
  const mb = parseInt(process.env.MAX_UPLOAD_MB ?? "200", 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 200) * 1024 * 1024;
}
