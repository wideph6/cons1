import { NextResponse, type NextRequest } from "next/server";
import { readDocumentAddress } from "@/lib/new-m-link";
import { faviconHref } from "@/lib/new-m-page";
import { getDesktop, publicFilename, rowByAddress } from "@/lib/new-m-page-server";
import { pdfError, sendPdf } from "@/lib/new-m-pdf";
import { APP_MARKER } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * A document's own address on its New M domain, as the middleware hands it on:
 *
 *   /storage/applications/{number}/documents/{name}.pdf           the PDF in a browser tab, titled with this
 *                                                                  full address, with the PDF tab's favicon
 *   /storage/applications/{number}/documents/{name}.pdf?download  the PDF, saved as {name}.pdf
 *   /storage/applications/{number}/documents/{name}.pdf?view      the PDF itself, for the tab's frame
 *
 * The PDF is sent from this site rather than a storage link, whose address carries the name the file
 * was uploaded with. Only the document's own domain answers. The random 40-character name is what
 * keeps the address private, as the number and date do for the verification link.
 */

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

/** The favicon of the PDF tab: its own, else the page's, else the app's icon. */
async function tabIcon(): Promise<{ href: string; type: string | null }> {
  try {
    const { meta } = (await getDesktop()).content;
    const own = faviconHref(meta.pdf_favicon, "pdf");
    if (own) return { href: own, type: meta.pdf_favicon.content_type };
    const page = faviconHref(meta.favicon);
    if (page) return { href: page, type: meta.favicon.content_type };
  } catch (e) {
    console.error("[new-m document tab] favicon", e);
  }
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

async function handle(req: NextRequest, head: boolean): Promise<Response> {
  const host = (req.headers.get("x-nm-host") ?? "").toLowerCase();
  const path = decode(req.headers.get("x-nm-path"));
  const params = new URLSearchParams(decode(req.headers.get("x-nm-search")));
  const address = readDocumentAddress(path);
  if (!host || !address) return pdfError(404, "Not found");

  let row;
  try {
    row = await rowByAddress(host, address.number, address.name);
  } catch (e) {
    console.error("[new-m document tab]", e);
    return pdfError(503, "The document is temporarily unavailable. Please try again in a moment.");
  }
  if (!row) return pdfError(404, "Not found");

  const filename = publicFilename(row);
  if (params.has("download")) return sendPdf(req, row, filename, "attachment", head);
  if (params.has("view")) return sendPdf(req, row, filename, "inline", head);

  // The tab's title is always the document's full address, as the visitor's browser reached it.
  const shownHost = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? host).split(",")[0].trim().toLowerCase();
  const proto = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(/:$/, "")).split(",")[0].trim() || "https";
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = tabPage({
    title: `${proto}://${shownHost}${path}`,
    icon: await tabIcon(),
    filename,
    view: `${path}?view`,
    download: `${path}?download`,
    nonce,
  });
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; object-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      [APP_MARKER]: "1",
    },
  });
}

export async function GET(req: NextRequest) {
  return handle(req, false);
}

export async function HEAD(req: NextRequest) {
  return handle(req, true);
}
