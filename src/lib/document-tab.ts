import { NextResponse, type NextRequest } from "next/server";
import * as appoLink from "./appo-link";
import * as appoPage from "./appo-page";
import * as appoServer from "./appo-page-server";
import * as newMLink from "./new-m-link";
import * as newMPage from "./new-m-page";
import * as newMServer from "./new-m-page-server";
import { APP_MARKER, presignDownload } from "./r2";

/**
 * A document's own address, as the middleware hands it on to /nm-doc or /appo-doc:
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
 *
 * New M and Appo write the same address, so on a host set up in both it does not tell whose document it
 * is: both are looked up at once (one round trip, as on a host of one system only) and whichever has it
 * answers, with its own tab title and favicon.
 */

/** The favicon fields the tab uses (New M's and Appo's page settings have the same shape). */
type Favicon = Parameters<typeof newMPage.faviconHref>[0];

interface TabMeta {
  pdf_title: string;
  favicon: Favicon;
  pdf_favicon: Favicon;
}

/** A document row, as both systems' address lookups return it. */
interface DocRow {
  attestation_number: string;
  document_type: string;
  doc_filename: string;
  doc_r2_key: string;
  doc_content_type: string;
  doc_hash_name?: string | null;
}

/** What one system brings to its documents' own addresses. */
interface DocumentSystem {
  /** For the logs. */
  label: string;
  find: (host: string, number: string, name: string) => Promise<DocRow | null>;
  /** The page's settings for the PDF tab (title and favicon); the design's when they cannot be read. */
  meta: () => Promise<TabMeta>;
  faviconHref: (f: Favicon, which?: "page" | "pdf") => string | null;
  fillTitle: (template: string, values: Record<string, string | null | undefined>, fallback: string) => string;
  publicFilename: (row: DocRow) => string;
}

function system(
  label: string,
  server: { rowByAddress: DocumentSystem["find"]; getDesktop: () => Promise<{ content: { meta: TabMeta } }>; publicFilename: DocumentSystem["publicFilename"] },
  page: { DEFAULT_DESKTOP: { meta: TabMeta }; faviconHref: DocumentSystem["faviconHref"]; fillTitle: DocumentSystem["fillTitle"] },
): DocumentSystem {
  return {
    label,
    find: (host, number, name) => server.rowByAddress(host, number, name),
    meta: async () => {
      try {
        return (await server.getDesktop()).content.meta;
      } catch (e) {
        console.error(`[${label} document tab] settings`, e);
        return page.DEFAULT_DESKTOP.meta;
      }
    },
    faviconHref: page.faviconHref,
    fillTitle: page.fillTitle,
    publicFilename: server.publicFilename,
  };
}

export const NEW_M_DOCS = system("new-m", newMServer, newMPage);
export const APPO_DOCS = system("appo", appoServer, appoPage);

export function plain(status: number, message: string): NextResponse {
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

/** The address the visitor opened, from the middleware's headers (x-nm-… or x-appo-…), or null when it is none. */
export function readVisit(req: NextRequest, prefix: "x-nm" | "x-appo") {
  const host = (req.headers.get(`${prefix}-host`) ?? "").toLowerCase();
  const path = decode(req.headers.get(`${prefix}-path`));
  const params = new URLSearchParams(decode(req.headers.get(`${prefix}-search`)));
  // Both systems read the address the same way; each with its own reader all the same.
  const address = prefix === "x-nm" ? newMLink.readDocumentAddress(path) : appoLink.readDocumentAddress(path);
  return host && address ? { host, path, params, address } : null;
}

export type Visit = NonNullable<ReturnType<typeof readVisit>>;

/** The favicon of the PDF tab: its own, else the page's, else the app's icon. */
function tabIcon(sys: DocumentSystem, meta: TabMeta): { href: string; type: string | null } {
  const own = sys.faviconHref(meta.pdf_favicon, "pdf");
  if (own) return { href: own, type: meta.pdf_favicon.content_type };
  const page = sys.faviconHref(meta.favicon);
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

/** Answers a found document's address: its PDF (?view, ?download), or the tab that shows it. */
export async function serveDocument(sys: DocumentSystem, row: DocRow, visit: Visit): Promise<NextResponse> {
  const { path, params, address } = visit;
  const filename = sys.publicFilename(row);
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
  const meta = await sys.meta();
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = tabPage({
    title: sys.fillTitle(
      meta.pdf_title,
      { name: address.name, attestation_number: row.attestation_number, document_type: row.document_type },
      address.name,
    ),
    icon: tabIcon(sys, meta),
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

/**
 * Finds the document an address names among these systems, all at once, and answers it: the first system
 * that has it (they never share one). Not found when none does; temporarily unavailable when a lookup
 * failed and none found it.
 */
export async function answerDocument(visit: Visit, systems: DocumentSystem[]): Promise<NextResponse> {
  const found = await Promise.allSettled(systems.map((s) => s.find(visit.host, visit.address.number, visit.address.name)));
  for (let i = 0; i < systems.length; i++) {
    const r = found[i];
    if (r.status === "fulfilled" && r.value) return serveDocument(systems[i], r.value, visit);
  }
  const failed = found.findIndex((r) => r.status === "rejected");
  if (failed >= 0) {
    console.error(`[${systems[failed].label} document tab]`, (found[failed] as PromiseRejectedResult).reason);
    return plain(503, "The document is temporarily unavailable. Please try again in a moment.");
  }
  return plain(404, "Not found");
}
