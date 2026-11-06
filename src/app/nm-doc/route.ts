import { NextResponse, type NextRequest } from "next/server";
import { readDocumentAddress } from "@/lib/new-m-link";
import { DEFAULT_DESKTOP, faviconHref, fillTitle, type DesktopContent } from "@/lib/new-m-page";
import { getDesktop, publicFilename, rowByAddress } from "@/lib/new-m-page-server";
import { APP_MARKER, presignDownload } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * A document's own address on its New M domain, as the middleware hands it on:
 *
 *   /storage/applications/{number}/documents/{name}.pdf           the PDF in a browser tab, titled with the
 *                                                                  40-character name, with the PDF tab's favicon
 *   /storage/applications/{number}/documents/{name}.pdf?download  the PDF, saved as {name}.pdf
 *   /storage/applications/{number}/documents/{name}.pdf?view      the PDF itself, for the tab's frame
 *
 * ?view and ?download send the browser to a short-lived storage link, which costs this server no
 * bandwidth; the PDF is stored under the same 40-character name. Only the document's own domain
 * answers. The random name is what keeps the address private, as the number and date do for the
 * verification link.
 */

function plain(status: number, message: string): NextResponse {
  return new NextResponse(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      [APP_MARKER]: "1",
    },
  });
}

function decode(v: string | null): string {
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return "";
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The page's settings for the PDF tab (title and favicon); the design's when they cannot be read. */
async function tabSettings(): Promise<DesktopContent["meta"]> {
  try {
    return (await getDesktop()).content.meta;
  } catch (e) {
    console.error("[new-m document tab] settings", e);
    return DEFAULT_DESKTOP.meta;
  }
}

/** The favicon of the PDF tab: its own, else the page's, else the app's icon. */
function tabIcon(meta: DesktopContent["meta"]): { href: string; type: string | null } {
  const own = faviconHref(meta.pdf_favicon, "pdf");
  if (own) return { href: own, type: meta.pdf_favicon.content_type };
  const page = faviconHref(meta.favicon);
  if (page) return { href: page, type: meta.favicon.content_type };
  return { href: "/icon.svg", type: "image/svg+xml" };
}

/**
 * The tab: the PDF fills it, shown by the browser's own PDF viewer. A browser that cannot show a PDF
 * inside a page (most phones) saves it instead.
 */
function tabPage(o: { title: string; icon: { href: string; type: string | null }; filename: string; view: string; download: string; nonce: string }): string {
  const typeAttr = o.icon.type ? ` type="${escapeHtml(o.icon.type)}"` : "";
  const js = (s: string) => JSON.stringify(s).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(o.title)}</title>
<link rel="icon" href="${escapeHtml(o.icon.href)}"${typeAttr}>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#525659}iframe{display:block;width:100%;height:100%;border:0}</style>
</head>
<body>
<iframe id="pdf" title="${escapeHtml(o.filename)}"></iframe>
<noscript><style>#pdf{display:none}</style><iframe src="${escapeHtml(o.view)}" title="${escapeHtml(o.filename)}"></iframe></noscript>
<script nonce="${o.nonce}">
if (navigator.pdfViewerEnabled === false) location.replace(${js(o.download)});
else document.getElementById("pdf").src = ${js(o.view)};
</script>
</body>
</html>
`;
}

export async function GET(req: NextRequest) {
  const host = (req.headers.get("x-nm-host") ?? "").toLowerCase();
  const path = decode(req.headers.get("x-nm-path"));
  const params = new URLSearchParams(decode(req.headers.get("x-nm-search")));
  const address = readDocumentAddress(path);
  if (!host || !address) return plain(404, "Not found");

  let row;
  try {
    row = await rowByAddress(host, address.number, address.name);
  } catch (e) {
    console.error("[new-m document tab]", e);
    return plain(503, "The document is temporarily unavailable. Please try again in a moment.");
  }
  if (!row) return plain(404, "Not found");

  const filename = publicFilename(row);
  if (params.has("download") || params.has("view")) {
    const url = await presignDownload(
      row.doc_r2_key,
      filename,
      params.has("download") ? "attachment" : "inline",
      row.doc_content_type || "application/pdf",
      300,
    );
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex", [APP_MARKER]: "1" },
    });
  }

  // The tab's title is the super admin's PDF tab title, with the document's words filled in; at first
  // (and when it comes out empty) the document's 40-character name.
  const meta = await tabSettings();
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = tabPage({
    title: fillTitle(
      meta.pdf_title,
      { name: address.name, attestation_number: row.attestation_number, document_type: row.document_type },
      address.name,
    ),
    icon: tabIcon(meta),
    filename,
    view: `${path}?view`,
    download: `${path}?download`,
    nonce,
  });
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      // The frame follows ?view to a short-lived storage link, hence https: in frame-src.
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self' data:; frame-src 'self' https:; object-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      [APP_MARKER]: "1",
    },
  });
}
