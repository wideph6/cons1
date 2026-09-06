import type { NextRequest } from "next/server";
import { ok, requireUser, run } from "@/lib/api";
import { getFileWithContext } from "@/lib/files";
import { headObject, presignDownload, probeUrl, type ProbeResult } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { buildPublicUrl } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export interface LinkCheckResult {
  public_url: string;
  hostname: string;
  domain_active: boolean;
  link_path: string;
  filename: string;
  storage: { exists: boolean; size?: number; error?: string };
  signed_url: ProbeResult;
  public_route: ProbeResult;
  redirect_target: ProbeResult | null;
  download_mode: string;
  findings: Array<{ level: "ok" | "warn" | "fail"; text: string; hint?: string }>;
}

/**
 * GET /api/admin/files/:id/check
 * Walks the whole download chain from the server: storage object → signed URL → public address → redirect target.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    await requireUser();
    const { id } = await params;
    const file = await getFileWithContext(id);
    if (!file.link) throw new Error("File has no link");

    const hostname = file.link.domain.hostname;
    const publicUrl = buildPublicUrl(hostname, file.link.path, file.filename);
    const findings: LinkCheckResult["findings"] = [];

    const { data: domainRow } = await db().from("domains").select("is_active").eq("id", file.link.domain.id).maybeSingle();
    const domainActive = domainRow?.is_active !== false;
    if (!domainActive) findings.push({ level: "fail", text: `Domain ${hostname} is disabled`, hint: "Enable it in Domains." });

    // 1. Object really in R2?
    let storage: LinkCheckResult["storage"];
    try {
      const head = await headObject(file.r2_key);
      storage = head ? { exists: true, size: head.size } : { exists: false };
    } catch (e) {
      storage = { exists: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (storage.exists) findings.push({ level: "ok", text: `Storage object found (${storage.size} bytes)` });
    else
      findings.push({
        level: "fail",
        text: "Storage object not found",
        hint: storage.error
          ? `R2 error: ${storage.error}. Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.`
          : "The object is missing from the bucket. Replace the file to upload it again.",
      });

    // 2. Does R2 accept our signed link?
    const signedUrl = await presignDownload(file.r2_key, file.filename, "attachment", file.content_type, 120);
    const signed = await probeUrl(signedUrl);
    if (signed.status === 206 || signed.status === 200) {
      findings.push({ level: "ok", text: `Signed storage link works (HTTP ${signed.status})` });
      if (signed.contentDisposition && !/attachment/i.test(signed.contentDisposition)) {
        findings.push({ level: "warn", text: "Storage did not apply the download header", hint: `content-disposition was: ${signed.contentDisposition}` });
      }
    } else {
      findings.push({
        level: "fail",
        text: `Storage rejected the signed link (HTTP ${signed.status || "no response"})`,
        hint: signed.error
          ? signed.error
          : /SignatureDoesNotMatch/i.test(signed.bodySnippet ?? "")
            ? "Signature mismatch: the R2 access key or secret in Vercel is wrong, or R2_ACCOUNT_ID does not match the bucket's account."
            : /NoSuchBucket/i.test(signed.bodySnippet ?? "")
              ? "R2_BUCKET does not match the bucket name in Cloudflare."
              : /AccessDenied/i.test(signed.bodySnippet ?? "")
                ? "The R2 API token lacks Object Read permission for this bucket."
                : signed.bodySnippet,
      });
    }

    // 3. Does the public address reach this app and redirect to storage?
    const pub = await probeUrl(publicUrl);
    let redirectTarget: ProbeResult | null = null;
    const downloadMode = (process.env.DOWNLOAD_MODE ?? "redirect").toLowerCase();

    if (pub.status === 0) {
      findings.push({
        level: "fail",
        text: `Public address is unreachable: ${pub.error ?? "no response"}`,
        hint: `${hostname} does not resolve or does not answer over HTTPS. Check the DNS record and that the domain shows "Valid Configuration" in Vercel → Settings → Domains.`,
      });
    } else if (pub.status >= 300 && pub.status < 400 && pub.location) {
      const target = pub.location;
      const isStorage = /r2\.cloudflarestorage\.com/i.test(target);
      if (isStorage) {
        findings.push({ level: "ok", text: "Public address answers and redirects to storage" });
        redirectTarget = await probeUrl(target);
        if (redirectTarget.status === 206 || redirectTarget.status === 200) {
          findings.push({ level: "ok", text: `Redirect target serves the file (HTTP ${redirectTarget.status})` });
        } else {
          findings.push({
            level: "fail",
            text: `Redirect target failed (HTTP ${redirectTarget.status || "no response"})`,
            hint: redirectTarget.bodySnippet ?? redirectTarget.error,
          });
        }
      } else if (/^https?:\/\/[^/]+\/?$/.test(target) || /vercel\.com|vercel\.app/.test(target)) {
        findings.push({
          level: "fail",
          text: `Public address redirects somewhere else: ${target}`,
          hint: "Another service answered instead of this app. If the domain's DNS is on Cloudflare, set the record to DNS only (grey cloud), or check the domain is attached to this Vercel project.",
        });
      } else {
        findings.push({ level: "warn", text: `Public address redirects to ${target}` });
      }
    } else if (pub.status === 404 && pub.reason) {
      const hints: Record<string, string> = {
        domain_not_found: `The app answered, but no domain named "${hostname}" matched the request host. Check the hostname in Domains matches exactly what the browser uses.`,
        domain_disabled: "The domain is disabled in Domains. Enable it.",
        link_not_found: "The link path in the address does not match any link on this domain.",
        file_not_found: "The file name in the address does not match this file.",
        bad_request: "The address is missing the file name.",
      };
      findings.push({ level: "fail", text: `App answered 404 (${pub.reason})`, hint: hints[pub.reason] ?? pub.reason });
    } else if (pub.status === 404) {
      findings.push({
        level: "fail",
        text: "Public address returned 404 from something other than this app",
        hint: `The response came without the app's marker. ${hostname} is probably pointing at a different site or a Vercel project that is not this one. Server said: ${pub.bodySnippet?.slice(0, 160) ?? "(empty)"}`,
      });
    } else if (pub.status === 200 && downloadMode === "proxy") {
      const attached = /attachment/i.test(pub.contentDisposition ?? "");
      findings.push(
        attached
          ? { level: "ok", text: "Public address streams the file with a download header (proxy mode)" }
          : { level: "warn", text: "Public address answered 200 but without a download header", hint: `content-type ${pub.contentType ?? "?"}` },
      );
    } else if (pub.status === 200) {
      findings.push({
        level: "fail",
        text: "Public address answered 200 with a page instead of redirecting to storage",
        hint: `Expected a redirect. Got content-type ${pub.contentType ?? "?"} — probably a Cloudflare proxy page, a parking page, or another site on this hostname. If the DNS is on Cloudflare, switch the record to DNS only (grey cloud).`,
      });
    } else if (pub.status === 503) {
      findings.push({
        level: "fail",
        text: "App answered 503 — a server error while preparing the download",
        hint: "Open Vercel → Deployments → latest → Functions logs for the exact error. Usually a missing or wrong R2/Supabase environment variable.",
      });
    } else {
      findings.push({ level: "fail", text: `Public address answered HTTP ${pub.status}`, hint: pub.bodySnippet ?? pub.error });
    }

    return ok({
      public_url: publicUrl,
      hostname,
      domain_active: domainActive,
      link_path: file.link.path,
      filename: file.filename,
      storage,
      signed_url: signed,
      public_route: pub,
      redirect_target: redirectTarget,
      download_mode: downloadMode,
      findings,
    } satisfies LinkCheckResult);
  });
}
