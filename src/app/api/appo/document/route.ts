import { NextResponse, type NextRequest } from "next/server";
import { dateFromParam, NUMBER_RE, tidyNumber } from "@/lib/appo-link";
import { publicFilename, rowByNumberAndDate } from "@/lib/appo-page-server";
import { APP_MARKER, getObjectRange, headObjectFull, presignDownload } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * GET /api/appo/document?number=GEN-…&date=YYYY-MM-DD[&mode=open|download]
 *
 * The PDF behind a verification page. Whoever holds the attestation number and its issue date — the
 * two things printed in the verification link — can read the document, exactly as the page shows it.
 *
 * Without mode the file is served from this site with byte-range support, so the page's viewer can
 * read a large scan in pieces (no storage CORS needed). mode=open and mode=download send the browser
 * to a short-lived storage link instead, which costs this server no bandwidth.
 */

function fail(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", [APP_MARKER]: "1" },
  });
}

/** `2026-10-31`, or `31102026` as the link writes it. */
function readDate(v: string | null): string | null {
  const s = (v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return dateFromParam(s);
}

function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\u0020-\u007e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function handle(req: NextRequest, head: boolean): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const number = tidyNumber(sp.get("number") ?? "");
  const date = readDate(sp.get("date"));
  if (!NUMBER_RE.test(number) || !date) return fail(400, "The attestation number or date is not valid.");

  let row;
  try {
    row = await rowByNumberAndDate(number, date);
  } catch (e) {
    console.error("[appo document]", e);
    return fail(503, "The document is temporarily unavailable. Please try again in a moment.");
  }
  if (!row) return fail(404, "No document matches this attestation number and date.");

  // Saved under the document's 40-character name, never the name it was uploaded with.
  const filename = publicFilename(row);
  const mode = sp.get("mode");
  if (mode === "open" || mode === "download") {
    const url = await presignDownload(
      row.doc_r2_key,
      filename,
      mode === "download" ? "attachment" : "inline",
      row.doc_content_type || "application/pdf",
      300,
    );
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex", [APP_MARKER]: "1" },
    });
  }

  const range = head ? null : req.headers.get("range");
  const valid = range && /^bytes=\d*-\d*$/.test(range.trim()) ? range.trim() : undefined;
  try {
    const headers = new Headers({
      "content-type": row.doc_content_type || "application/pdf",
      "content-disposition": contentDisposition("inline", filename),
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=300",
      "x-robots-tag": "noindex",
      "x-content-type-options": "nosniff",
      [APP_MARKER]: "1",
    });
    if (head) {
      const meta = await headObjectFull(row.doc_r2_key);
      if (meta.ETag) headers.set("etag", meta.ETag);
      if (meta.ContentLength !== undefined) headers.set("content-length", String(meta.ContentLength));
      return new NextResponse(null, { status: 200, headers });
    }
    const obj = await getObjectRange(row.doc_r2_key, valid);
    if (obj.ETag) headers.set("etag", obj.ETag);
    if (obj.ContentLength !== undefined) headers.set("content-length", String(obj.ContentLength));
    if (obj.ContentRange) headers.set("content-range", obj.ContentRange);
    const status = obj.ContentRange && valid ? 206 : 200;
    const body = obj.Body ? (obj.Body as { transformToWebStream: () => ReadableStream }).transformToWebStream() : null;
    return new NextResponse(body, { status, headers });
  } catch (e) {
    const code = (e as { $metadata?: { httpStatusCode?: number }; name?: string }) ?? {};
    if (code.$metadata?.httpStatusCode === 416 || code.name === "InvalidRange") {
      return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${row.doc_size ?? 0}` } });
    }
    if (code.$metadata?.httpStatusCode === 404 || code.name === "NoSuchKey") {
      return fail(404, "The document file is missing from storage.");
    }
    console.error("[appo document] read", e);
    return fail(503, "The document is temporarily unavailable. Please try again in a moment.");
  }
}

export async function GET(req: NextRequest) {
  return handle(req, false);
}

export async function HEAD(req: NextRequest) {
  return handle(req, true);
}
