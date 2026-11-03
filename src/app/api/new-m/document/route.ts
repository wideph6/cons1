import { NextResponse, type NextRequest } from "next/server";
import { dateFromParam, NUMBER_RE, tidyNumber } from "@/lib/new-m-link";
import { publicFilename, rowByNumberAndDate } from "@/lib/new-m-page-server";
import { pdfError, sendPdf } from "@/lib/new-m-pdf";
import { APP_MARKER, presignDownload } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * GET /api/new-m/document?number=GEN-…&date=YYYY-MM-DD[&mode=open|download]
 *
 * The PDF behind a verification page. Whoever holds the attestation number and its issue date — the
 * two things printed in the verification link — can read the document, exactly as the page shows it.
 *
 * Without mode the file is served from this site with byte-range support, so the page's viewer can
 * read a large scan in pieces (no storage CORS needed). mode=open and mode=download send the browser
 * to a short-lived storage link instead, which costs this server no bandwidth; the page only uses them
 * for documents without their own /storage/applications/… address yet.
 */

/** `2026-10-31`, or `31102026` as the link writes it. */
function readDate(v: string | null): string | null {
  const s = (v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return dateFromParam(s);
}

async function handle(req: NextRequest, head: boolean): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const number = tidyNumber(sp.get("number") ?? "");
  const date = readDate(sp.get("date"));
  if (!NUMBER_RE.test(number) || !date) return pdfError(400, "The attestation number or date is not valid.");

  let row;
  try {
    row = await rowByNumberAndDate(number, date);
  } catch (e) {
    console.error("[new-m document]", e);
    return pdfError(503, "The document is temporarily unavailable. Please try again in a moment.");
  }
  if (!row) return pdfError(404, "No document matches this attestation number and date.");

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
  return sendPdf(req, row, filename, "inline", head);
}

export async function GET(req: NextRequest) {
  return handle(req, false);
}

export async function HEAD(req: NextRequest) {
  return handle(req, true);
}
