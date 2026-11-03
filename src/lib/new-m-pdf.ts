import { NextResponse, type NextRequest } from "next/server";
import { APP_MARKER, getObjectRange, headObjectFull } from "./r2";

/** What a document's PDF needs to be sent. */
export interface PdfSource {
  doc_r2_key: string;
  doc_size: number | null;
  doc_content_type: string;
}

export function pdfError(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", [APP_MARKER]: "1" },
  });
}

function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\u0020-\u007e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * A document's PDF, sent from this site with byte-range support, so a viewer can read a large scan in
 * pieces and the visitor only ever sees this site's address and the given file name.
 */
export async function sendPdf(
  req: NextRequest,
  pdf: PdfSource,
  filename: string,
  disposition: "inline" | "attachment",
  head: boolean,
): Promise<Response> {
  const range = head ? null : req.headers.get("range");
  const valid = range && /^bytes=\d*-\d*$/.test(range.trim()) ? range.trim() : undefined;
  try {
    const headers = new Headers({
      "content-type": pdf.doc_content_type || "application/pdf",
      "content-disposition": contentDisposition(disposition, filename),
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=300",
      "x-robots-tag": "noindex",
      "x-content-type-options": "nosniff",
      [APP_MARKER]: "1",
    });
    if (head) {
      const meta = await headObjectFull(pdf.doc_r2_key);
      if (meta.ETag) headers.set("etag", meta.ETag);
      if (meta.ContentLength !== undefined) headers.set("content-length", String(meta.ContentLength));
      return new NextResponse(null, { status: 200, headers });
    }
    const obj = await getObjectRange(pdf.doc_r2_key, valid);
    if (obj.ETag) headers.set("etag", obj.ETag);
    if (obj.ContentLength !== undefined) headers.set("content-length", String(obj.ContentLength));
    if (obj.ContentRange) headers.set("content-range", obj.ContentRange);
    const status = obj.ContentRange && valid ? 206 : 200;
    const body = obj.Body ? (obj.Body as { transformToWebStream: () => ReadableStream }).transformToWebStream() : null;
    return new NextResponse(body, { status, headers });
  } catch (e) {
    const code = (e as { $metadata?: { httpStatusCode?: number }; name?: string }) ?? {};
    if (code.$metadata?.httpStatusCode === 416 || code.name === "InvalidRange") {
      return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${pdf.doc_size ?? 0}` } });
    }
    if (code.$metadata?.httpStatusCode === 404 || code.name === "NoSuchKey") {
      return pdfError(404, "The document file is missing from storage.");
    }
    console.error("[new-m document] read", e);
    return pdfError(503, "The document is temporarily unavailable. Please try again in a moment.");
  }
}
