import { probeUrl, type ProbeResult } from "./r2";
import type { ReachResult } from "./types";

/** Signatures of the servers people most often find still sitting on a domain they just repointed. */
function identify(p: ProbeResult): { name: string; hint?: string } {
  const body = (p.bodySnippet ?? "").toLowerCase();
  const server = (p.server ?? "").toLowerCase();

  if (/deployment_not_found|no production deployment/.test(body) || /^vercel/.test(server)) {
    return {
      name: "Vercel, but not this project",
      hint: "DNS reaches Vercel, but the hostname is not attached to this project (or its deployment). Attach it under Vercel → Project → Settings → Domains, then re-run this test.",
    };
  }
  if (/the resource requested could not be found on this server/.test(body) || /cpanel|litespeed/.test(server) || /^apache/.test(server)) {
    return {
      name: "Apache / cPanel hosting",
      hint: "A shared-hosting server is still answering for this domain, so requests never reach Vercel. The DNS record still points at the old host — replace it with the Vercel record shown under DNS & setup.",
    };
  }
  if (/^cloudflare/.test(server) || /cloudflare/.test(body)) {
    return {
      name: "Cloudflare",
      hint: "Cloudflare answered instead of Vercel. Set the DNS record for this hostname to DNS only (grey cloud), and point it at the Vercel record shown under DNS & setup.",
    };
  }
  if (/domain (is )?(for sale|parking)|parked (free )?(at|with)|godaddy|namecheap|sedo/.test(body)) {
    return {
      name: "A domain parking page",
      hint: "The registrar's parking page is still live. Delete the parking / forwarding record and add the Vercel record shown under DNS & setup.",
    };
  }
  return {
    name: p.server ? `Another server (${p.server})` : "Another server",
    hint: "Some other site is answering on this hostname. Point its DNS record at Vercel using the values under DNS & setup, and remove any conflicting A / CNAME / URL-forwarding record.",
  };
}

/**
 * Asks the hostname for a path that can only ever be answered by the public download route,
 * then reports whether our own deployment is what answered.
 */
export async function probeHostname(hostname: string): Promise<ReachResult> {
  const nonce = Math.random().toString(36).slice(2, 10);
  const probeUrlStr = `https://${hostname}/link-manager-probe-${nonce}/probe.txt`;
  const checked_at = new Date().toISOString();
  const p = await probeUrl(probeUrlStr, 12_000);

  const base = {
    hostname,
    probe_url: probeUrlStr,
    status: p.status,
    reason: p.reason,
    server: p.server,
    location: p.location,
    checked_at,
  };

  if (p.status === 0) {
    return {
      ...base,
      serves: null,
      answered_by: "nothing",
      level: "fail",
      message: `${hostname} did not answer`,
      hint: `The hostname does not resolve yet, or has no HTTPS certificate. Add the DNS record shown under DNS & setup and wait for it to propagate. (${p.error ?? "no response"})`,
    };
  }

  if (p.app) {
    // Our deployment answered. The only bad outcome left is the host not matching a domain row.
    if (p.reason === "domain_not_found") {
      return {
        ...base,
        serves: true,
        answered_by: "this app",
        level: "fail",
        message: `This app answered, but it does not recognise the hostname "${hostname}"`,
        hint: "The request arrived with a different host than the one saved here. Check the hostname spelling in this panel, and whether a redirect changed it on the way.",
      };
    }
    if (p.reason === "domain_disabled") {
      return { ...base, serves: true, answered_by: "this app", level: "fail", message: `${hostname} is disabled in this panel`, hint: "Turn the domain back on to serve its links." };
    }
    return {
      ...base,
      serves: true,
      answered_by: "this app",
      level: "ok",
      message: `${hostname} reaches this app — links on this domain will work`,
    };
  }

  if (p.status >= 300 && p.status < 400 && p.location) {
    let target = p.location;
    try {
      target = new URL(p.location, probeUrlStr).host;
    } catch {
      /* keep the raw value */
    }
    return {
      ...base,
      serves: false,
      answered_by: "a redirect",
      level: "fail",
      message: `${hostname} redirects to ${target} instead of serving files`,
      hint: `Every address on this domain is being sent to ${target}, so the link never reaches this app. Remove the redirect: in Vercel → Settings → Domains set this domain to "No Redirect", and delete any URL-forwarding record at your DNS provider.`,
    };
  }

  const who = identify(p);
  return {
    ...base,
    serves: false,
    answered_by: who.name,
    level: "fail",
    message: `${who.name} answered for ${hostname} (HTTP ${p.status}), not this app`,
    hint: who.hint,
  };
}
