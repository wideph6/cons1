import { NextResponse, type NextRequest } from "next/server";
import { APP_MARKER, getObjectStream, presignDownload } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { contentDisposition } from "@/lib/utils";

export const dynamic = "force-dynamic";

type NotFoundReason = "bad_request" | "domain_not_found" | "domain_disabled" | "link_not_found" | "file_not_found";

const REASON_TEXT: Record<NotFoundReason, string> = {
  bad_request: "The address is incomplete.",
  domain_not_found: "This domain is not set up to serve files.",
  domain_disabled: "This domain is currently disabled.",
  link_not_found: "There is no link at this path.",
  file_not_found: "There is no file with this name in that link.",
};

function notFound(reason: NotFoundReason, host: string): NextResponse {
  const detail = REASON_TEXT[reason];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>File not found</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f5f8;color:#1b2333}main{max-width:26rem;padding:2rem}p.code{font-family:ui-monospace,Menlo,Consolas,monospace;color:#5e6b7e;margin:0 0 .25rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#5e6b7e;margin:0 0 .5rem}small{font-family:ui-monospace,Menlo,Consolas,monospace;color:#8a96a8;font-size:12px}</style></head>
<body><main><p class="code">404</p><h1>File not found</h1><p>${detail} Check the link and try again.</p><small>${reason} · ${host || "no host"}</small></main></body></html>`;
  return new NextResponse(html, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-reason": reason,
      [APP_MARKER]: "1",
    },
  });
}

function requestHost(req: NextRequest): string {
  const raw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return raw.split(",")[0].trim().split(":")[0].toLowerCase();
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Public download endpoint.
 * https://<domain>/<link path>/<filename>  ->  file downloads automatically.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const host = requestHost(req);
  const segments = (slug ?? []).map(decode).filter(Boolean);
  if (!host || segments.length === 0) return notFound("bad_request", host);

  const filename = segments[segments.length - 1];
  const path = segments.slice(0, -1).join("/");

  try {
    const hostCandidates = host.startsWith("www.") ? [host, host.slice(4)] : [host, `www.${host}`];
    const { data: domains } = await db()
      .from("domains")
      .select("id,hostname,is_active")
      .in("hostname", hostCandidates);
    const domain =
      domains?.find((d) => d.hostname === host) ?? domains?.find((d) => hostCandidates.includes(d.hostname));
    if (!domain) return notFound("domain_not_found", host);
    if (!domain.is_active) return notFound("domain_disabled", host);

    const { data: link } = await db()
      .from("links")
      .select("id")
      .eq("domain_id", domain.id)
      .eq("path", path)
      .maybeSingle();
    if (!link) return notFound("link_not_found", host);

    let { data: file } = await db()
      .from("files")
      .select("id,r2_key,filename,content_type,size")
      .eq("link_id", link.id)
      .eq("filename", filename)
      .maybeSingle();
    if (!file) {
      // Tolerate case differences in the typed URL.
      const res = await db()
        .from("files")
        .select("id,r2_key,filename,content_type,size")
        .eq("link_id", link.id)
        .ilike("filename", filename.replace(/[%_]/g, "\\$&"))
        .limit(1)
        .maybeSingle();
      file = res.data;
    }
    if (!file) return notFound("file_not_found", host);

    await db().rpc("increment_download", { file_uuid: file.id });

    const mode = (process.env.DOWNLOAD_MODE ?? "redirect").toLowerCase();
    if (mode === "proxy") {
      const obj = await getObjectStream(file.r2_key);
      const body = obj.Body ? (obj.Body as { transformToWebStream: () => ReadableStream }).transformToWebStream() : null;
      if (!body) return notFound("file_not_found", host);
      const headers = new Headers({
        [APP_MARKER]: "1",
        "content-type": file.content_type || "application/octet-stream",
        "content-disposition": contentDisposition("attachment", file.filename),
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex",
      });
      if (obj.ContentLength) headers.set("content-length", String(obj.ContentLength));
      return new NextResponse(body, { status: 200, headers });
    }

    const url = await presignDownload(file.r2_key, file.filename, "attachment", file.content_type, 120);
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex", [APP_MARKER]: "1" },
    });
  } catch (e) {
    console.error("[download]", e);
    return new NextResponse("Download is temporarily unavailable. Please try again in a moment.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", [APP_MARKER]: "1" },
    });
  }
}
