import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

function requestHost(req: NextRequest): string {
  const raw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return raw.split(",")[0].trim().split(":")[0].toLowerCase();
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Optionally pin the admin panel to specific hostnames (ADMIN_HOSTS="admin.example.com,localhost").
  const adminHosts = (process.env.ADMIN_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (adminHosts.length && !adminHosts.includes(requestHost(req))) {
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
  matcher: ["/admin/:path*", "/api/admin/:path*", "/login", "/api/auth/:path*"],
};
