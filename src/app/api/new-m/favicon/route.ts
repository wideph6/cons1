import { NextResponse, type NextRequest } from "next/server";
import { faviconHref } from "@/lib/new-m-page";
import { getDesktop } from "@/lib/new-m-page-server";
import { APP_MARKER, getObjectBytes } from "@/lib/r2";

export const dynamic = "force-dynamic";

/** The upload limit for a favicon, with room to spare. */
const MAX_FAVICON = 1024 * 1024;

function missing(): NextResponse {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", [APP_MARKER]: "1" },
  });
}

/**
 * GET /api/new-m/favicon?v=… — the verification page's favicon, as the super admin uploaded it under
 * New M → Page design; with for=pdf, the favicon of the tab a document's PDF opens in. Public, like the
 * page itself. Served from this site at an address that only changes with a new upload, so browsers
 * can keep it instead of chasing a short-lived storage link.
 */
export async function GET(req: NextRequest) {
  const which = req.nextUrl.searchParams.get("for") === "pdf" ? "pdf" : "page";
  let favicon;
  try {
    const { meta } = (await getDesktop()).content;
    favicon = which === "pdf" ? meta.pdf_favicon : meta.favicon;
  } catch (e) {
    console.error("[new-m favicon]", e);
    return missing();
  }
  if (!favicon.key || !favicon.content_type) return missing();

  const obj = await getObjectBytes(favicon.key, MAX_FAVICON).catch(() => null);
  if (!obj) return missing();

  // The address of the favicon in use may be kept for a year; any other (an older one) only briefly.
  const current = req.nextUrl.search === new URL(faviconHref(favicon, which) ?? "/", "http://x").search;
  return new NextResponse(obj.bytes as BodyInit, {
    headers: {
      "content-type": favicon.content_type,
      "cache-control": current ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "x-content-type-options": "nosniff",
      // An SVG opened on its own must not run anything on this site.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-robots-tag": "noindex",
      [APP_MARKER]: "1",
    },
  });
}
