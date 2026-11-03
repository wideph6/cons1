import { NextResponse, type NextRequest } from "next/server";
import { matchTemplate, readDocumentAddress } from "@/lib/new-m-link";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

function requestHost(req: NextRequest): string {
  const raw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return raw.split(",")[0].trim().split(":")[0].toLowerCase();
}

/* ---------------- New M verification links ---------------- */

/**
 * The links of each New M domain, kept briefly so a visit costs no database call most of the time.
 * A domain or link added or edited in the panel answers within this long on every server.
 */
const LINKS_TTL_MS = 30_000;
const linkCache = new Map<string, { at: number; templates: string[] | null }>();

/** The New M links served on a host, or null when the host is not a New M domain. */
async function newMLinks(host: string): Promise<string[] | null> {
  const hit = linkCache.get(host);
  if (hit && Date.now() - hit.at < LINKS_TTL_MS) return hit.templates;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const candidates = host.startsWith("www.") ? [host, host.slice(4)] : [host, `www.${host}`];
  const list = candidates.map((h) => `"${h.replace(/"/g, "")}"`).join(",");
  // New-format keys (sb_secret_…) belong in the apikey header only; legacy JWT keys also go as a Bearer token.
  const headers: Record<string, string> = { apikey: key, Accept: "application/json" };
  if (!key.startsWith("sb_secret_") && !key.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${key}`;
  let templates: string[] | null = null;
  try {
    const res = await fetch(
      `${url}/rest/v1/new_m_domains?select=hostname,new_m_link_templates(template)&hostname=in.(${encodeURIComponent(list)})`,
      {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return hit?.templates ?? null;
    const rows = (await res.json()) as Array<{ hostname: string; new_m_link_templates: Array<{ template: string }> | null }>;
    const row = rows.find((r) => r.hostname === host) ?? rows[0];
    templates = row ? (row.new_m_link_templates ?? []).map((t) => t.template) : null;
  } catch {
    // An unreachable database must not take the site down; the previous answer stands, if any.
    return hit?.templates ?? null;
  }
  if (linkCache.size > 500) linkCache.clear();
  linkCache.set(host, { at: Date.now(), templates });
  return templates;
}

/** Paths that always belong to the app itself and are never read as a verification link. */
function isAppPath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/") ||
    pathname === "/login" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/nm-assets/")
  );
}

/** Hands a New M visit to the app's own route for it, with the address the visitor opened. */
function serveNewM(req: NextRequest, host: string, route: "/nm-view" | "/nm-doc"): NextResponse {
  const target = req.nextUrl.clone();
  target.pathname = route;
  target.search = "";
  const headers = new Headers(req.headers);
  headers.set("x-nm-host", host);
  headers.set("x-nm-path", encodeURIComponent(req.nextUrl.pathname));
  headers.set("x-nm-search", encodeURIComponent(req.nextUrl.search));
  return NextResponse.rewrite(target, { request: { headers } });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = requestHost(req);

  // The verification page and the document tab are only ever reached through a New M address, never
  // by their own.
  if (pathname === "/nm-view" || pathname.startsWith("/nm-view/") || pathname === "/nm-doc" || pathname.startsWith("/nm-doc/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isAdminArea =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth/");

  if (!isAdminArea) {
    if (!isAppPath(pathname)) {
      const templates = await newMLinks(host);
      // A document's PDF address (/storage/applications/…/documents/….pdf) on any New M domain.
      if (templates !== null && readDocumentAddress(pathname)) return serveNewM(req, host, "/nm-doc");
      if (templates?.some((t) => matchTemplate(t, pathname, req.nextUrl.search))) return serveNewM(req, host, "/nm-view");
    }
    return NextResponse.next();
  }

  // Optionally pin the admin panel to specific hostnames (ADMIN_HOSTS="admin.example.com,localhost").
  const adminHosts = (process.env.ADMIN_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (adminHosts.length && !adminHosts.includes(host)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const isApi = pathname.startsWith("/api/");

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const session = await verifySession(token);
    if (!session) {
      if (isApi) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname === "/login" && token) {
    const session = await verifySession(token);
    if (session) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Every request except the framework's own files and the page's fonts: New M links can be any path.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|nm-assets/).*)"],
};
