import { NextResponse, type NextRequest } from "next/server";
import { matchTemplate as matchAppoTemplate, readDocumentAddress as readAppoAddress } from "@/lib/appo-link";
import { matchTemplate, readDocumentAddress } from "@/lib/new-m-link";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

function requestHost(req: NextRequest): string {
  const raw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return raw.split(",")[0].trim().split(":")[0].toLowerCase();
}

/* ---------------- New M and Appo verification links ---------------- */

/**
 * The links of each New M (or Appo) domain, kept briefly so a visit costs no database call most of the
 * time. A domain or link added or edited in the panel answers within this long on every server.
 */
const LINKS_TTL_MS = 30_000;

/** New M, and Appo — its independent copy — each with their own domains, links and cache. */
interface LinkSystem {
  domains: string;
  links: string;
  cache: Map<string, { at: number; templates: string[] | null }>;
}
const NEW_M: LinkSystem = { domains: "new_m_domains", links: "new_m_link_templates", cache: new Map() };
const APPO: LinkSystem = { domains: "appo_domains", links: "appo_link_templates", cache: new Map() };

/** The links a system serves on a host, or null when the host is not one of its domains. */
async function domainLinks(system: LinkSystem, host: string): Promise<string[] | null> {
  const hit = system.cache.get(host);
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
      `${url}/rest/v1/${system.domains}?select=hostname,${system.links}(template)&hostname=in.(${encodeURIComponent(list)})`,
      {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return hit?.templates ?? null;
    const rows = (await res.json()) as Array<Record<string, unknown> & { hostname: string }>;
    const row = rows.find((r) => r.hostname === host) ?? rows[0];
    templates = row ? ((row[system.links] as Array<{ template: string }> | null) ?? []).map((t) => t.template) : null;
  } catch {
    // An unreachable database must not take the site down; the previous answer stands, if any.
    return hit?.templates ?? null;
  }
  if (system.cache.size > 500) system.cache.clear();
  system.cache.set(host, { at: Date.now(), templates });
  return templates;
}

/** Paths that always belong to the app itself and are never read as a verification link. */
function isAppPath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/") ||
    pathname === "/login" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/nm-assets/") ||
    pathname.startsWith("/appo-assets/")
  );
}

/** Routes reached only through a New M or Appo address, never by their own. */
const INTERNAL_ROUTES = ["/nm-view", "/nm-doc", "/appo-view", "/appo-doc"];

/**
 * Hands a New M or Appo visit to the app's own route for it, with the address the visitor opened in
 * headers named after the system (x-nm-… or x-appo-…). also names the other system too, for a route that
 * hands the visit on when it is not its own. Such headers sent by the visitor are dropped first, so only
 * the middleware ever sets them.
 */
function serve(req: NextRequest, host: string, route: string, prefix: "x-nm" | "x-appo", also?: "x-nm" | "x-appo"): NextResponse {
  const target = req.nextUrl.clone();
  target.pathname = route;
  target.search = "";
  const headers = new Headers(req.headers);
  for (const p of ["x-nm", "x-appo"]) for (const k of ["host", "path", "search"]) headers.delete(`${p}-${k}`);
  for (const p of also ? [prefix, also] : [prefix]) {
    headers.set(`${p}-host`, host);
    headers.set(`${p}-path`, encodeURIComponent(req.nextUrl.pathname));
    headers.set(`${p}-search`, encodeURIComponent(req.nextUrl.search));
  }
  return NextResponse.rewrite(target, { request: { headers } });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = requestHost(req);

  if (INTERNAL_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isAdminArea =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth/");

  if (!isAdminArea) {
    if (!isAppPath(pathname)) {
      const search = req.nextUrl.search;
      const [newM, appo] = await Promise.all([domainLinks(NEW_M, host), domainLinks(APPO, host)]);
      // A document's PDF address (/storage/applications/…/documents/….pdf) on any New M domain, then a link.
      // On a host Appo serves too, the address may be one of Appo's documents: New M hands it on to Appo when
      // the document is not its own (otherwise Appo's "View document" on such a host would never open).
      if (newM !== null && readDocumentAddress(pathname)) {
        return serve(req, host, "/nm-doc", "x-nm", appo !== null && readAppoAddress(pathname) ? "x-appo" : undefined);
      }
      if (newM?.some((t) => matchTemplate(t, pathname, search))) return serve(req, host, "/nm-view", "x-nm");
      // The same for Appo's own domains. A host set up in both answers as New M.
      if (appo !== null && readAppoAddress(pathname)) return serve(req, host, "/appo-doc", "x-appo");
      if (appo?.some((t) => matchAppoTemplate(t, pathname, search))) return serve(req, host, "/appo-view", "x-appo");
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
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|nm-assets/|appo-assets/).*)"],
};
