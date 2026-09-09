import { probeUrl, type ProbeResult } from "./r2";
import type { DnsCheck, DnsLookup, DnsRecord, ReachResult } from "./types";

// ---------------------------------------------------------------------------
// DNS: ask two public resolvers what the hostname currently points at.
// This is what a visitor's browser sees, independent of whatever a dashboard claims.
// ---------------------------------------------------------------------------

interface Resolver {
  name: string;
  url: (query: string) => string;
  headers: Record<string, string>;
}

const RESOLVERS: Resolver[] = [
  { name: "Cloudflare 1.1.1.1", url: (q) => `https://cloudflare-dns.com/dns-query?${q}`, headers: { accept: "application/dns-json" } },
  { name: "Google 8.8.8.8", url: (q) => `https://dns.google/resolve?${q}`, headers: {} },
];

const RR_TYPE: Record<number, string> = { 1: "A", 5: "CNAME", 12: "PTR", 28: "AAAA" };

// Vercel's anycast ranges as observed from cname.vercel-dns.com and *.vercel.app (Sep 2026), plus the legacy edge IP.
const VERCEL_IP_PREFIXES = ["76.76.21.", "216.198.79.", "64.29.17.", "66.33.60."];
const VERCEL_IPS = new Set(["76.223.126.88"]);

export function pointsAtVercel(r: DnsRecord): boolean {
  if (r.type === "CNAME") return /vercel-dns|\.vercel\.app$/i.test(r.value);
  if (r.type === "A") return VERCEL_IPS.has(r.value) || VERCEL_IP_PREFIXES.some((p) => r.value.startsWith(p));
  return false;
}

/**
 * Splits one resolver's answer into Vercel and non-Vercel destinations. A CNAME to Vercel makes every
 * address behind it Vercel's, whatever range it lands in — so the IP list above never causes a false alarm.
 */
function splitRecords(records: DnsRecord[]): { vercel: DnsRecord[]; other: DnsRecord[] } {
  const cnames = records.filter((r) => r.type === "CNAME");
  const addresses = records.filter((r) => r.type === "A");
  if (cnames.some(pointsAtVercel)) return { vercel: addresses.length ? addresses : cnames, other: [] };
  if (addresses.length === 0) return { vercel: [], other: cnames };
  return { vercel: addresses.filter(pointsAtVercel), other: addresses.filter((r) => !pointsAtVercel(r)) };
}

interface DohAnswer {
  Status?: number;
  Answer?: Array<{ name: string; type: number; data: string }>;
}

async function doh(resolver: Resolver, name: string, type: string): Promise<DohAnswer> {
  const res = await fetch(resolver.url(`name=${encodeURIComponent(name)}&type=${type}`), {
    headers: resolver.headers,
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new Error(`${resolver.name} answered HTTP ${res.status}`);
  return (await res.json()) as DohAnswer;
}

async function reverseName(resolver: Resolver, ip: string): Promise<string | undefined> {
  try {
    const arpa = `${ip.split(".").reverse().join(".")}.in-addr.arpa`;
    const r = await doh(resolver, arpa, "PTR");
    const ptr = r.Answer?.find((a) => a.type === 12)?.data;
    return ptr ? ptr.replace(/\.$/, "") : undefined;
  } catch {
    return undefined;
  }
}

async function lookup(resolver: Resolver, hostname: string): Promise<DnsLookup> {
  try {
    const r = await doh(resolver, hostname, "A");
    const records: DnsRecord[] = (r.Answer ?? [])
      .filter((a) => a.type === 1 || a.type === 5)
      .map((a) => ({ type: RR_TYPE[a.type] ?? String(a.type), value: a.data.replace(/\.$/, "") }));
    const stray = splitRecords(records).other.find((x) => x.type === "A");
    const owner = stray ? await reverseName(resolver, stray.value) : undefined;
    return { resolver: resolver.name, records, owner };
  } catch (e) {
    return { resolver: resolver.name, records: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkDns(hostname: string): Promise<DnsCheck> {
  const lookups = await Promise.all(RESOLVERS.map((r) => lookup(r, hostname)));
  const answered = lookups.filter((l) => !l.error);
  if (answered.length === 0) {
    return { lookups, verdict: "unknown", summary: "Could not query public DNS resolvers from the server." };
  }

  const split = answered.map((l) => splitRecords(l.records));
  const vercel = split.flatMap((s) => s.vercel);
  const other = split.flatMap((s) => s.other);
  if (vercel.length === 0 && other.length === 0) {
    return { lookups, verdict: "none", summary: `${hostname} has no A or CNAME record in public DNS yet.` };
  }
  const owner = answered.map((l) => l.owner).find(Boolean);
  const describe = (rs: DnsRecord[]) => Array.from(new Set(rs.map((r) => `${r.type} ${r.value}`))).join(", ");

  if (other.length === 0) {
    return { lookups, verdict: "vercel", summary: `${hostname} resolves to Vercel (${describe(vercel)}).` };
  }
  if (vercel.length > 0) {
    return {
      lookups,
      verdict: "mixed",
      summary: `${hostname} has two destinations at once: Vercel (${describe(vercel)}) and ${describe(other)}${owner ? ` (${owner})` : ""}. Browsers pick one at random, so the link works only sometimes.`,
    };
  }
  return {
    lookups,
    verdict: "not_vercel",
    summary: `${hostname} resolves to ${describe(other)}${owner ? ` (a server named ${owner})` : ""}, not to Vercel.`,
  };
}

// ---------------------------------------------------------------------------
// HTTP: fetch the hostname and see who actually answers.
// ---------------------------------------------------------------------------

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
  if (/the resource requested could not be found on this server|powered by litespeed/.test(body) || /cpanel|litespeed/.test(server) || /^apache/.test(server)) {
    const engine = /litespeed/.test(server) || /litespeed/.test(body) ? "LiteSpeed" : "Apache";
    return {
      name: `${engine} / cPanel hosting`,
      hint: `A shared-hosting server (${engine}) is still answering for this domain, so requests never reach Vercel. Its DNS record still points at the old host.`,
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

const DNS_FIX =
  "Fix at your DNS provider: apex domain → one A record @ 76.76.21.21; subdomain → one CNAME record → cname.vercel-dns.com. Delete the old record so only the Vercel one remains.";

/** Puts the concrete DNS finding first, so the reader sees the exact record to change. */
function withDns(hint: string | undefined, dns: DnsCheck): string {
  if (dns.verdict === "not_vercel" || dns.verdict === "mixed" || dns.verdict === "none") {
    return `${dns.summary} ${DNS_FIX}${hint ? ` ${hint}` : ""}`;
  }
  return hint ?? dns.summary;
}

/**
 * Asks the hostname for a path that can only ever be answered by the public download route,
 * then reports whether our own deployment is what answered — alongside what public DNS says.
 */
export async function probeHostname(hostname: string): Promise<ReachResult> {
  const nonce = Math.random().toString(36).slice(2, 10);
  const probeUrlStr = `https://${hostname}/link-manager-probe-${nonce}/probe.txt`;
  const checked_at = new Date().toISOString();
  const [p, dns] = await Promise.all([probeUrl(probeUrlStr, 12_000), checkDns(hostname)]);

  const base = {
    hostname,
    probe_url: probeUrlStr,
    dns,
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
      hint: withDns(
        dns.verdict === "vercel"
          ? `DNS already points at Vercel, so this is usually a certificate still being issued — wait a few minutes and run again. (${p.error ?? "no response"})`
          : `The hostname does not resolve yet, or has no HTTPS certificate. (${p.error ?? "no response"})`,
        dns,
      ),
    };
  }

  if (p.app) {
    // Our deployment answered. The only bad outcomes left: host not matching a domain row, or DNS still split.
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
    if (dns.verdict === "mixed") {
      return {
        ...base,
        serves: true,
        answered_by: "this app (sometimes)",
        level: "warn",
        message: `${hostname} reached this app this time, but its DNS still has a second destination`,
        hint: withDns(undefined, dns),
      };
    }
    return {
      ...base,
      serves: true,
      answered_by: "this app",
      level: "ok",
      message: `${hostname} reaches this app — links on this domain will work`,
      hint: "If your own browser still shows a different site, it is using a cached DNS answer: run ipconfig /flushdns (Windows) or try from mobile data.",
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
    hint: withDns(who.hint, dns),
  };
}
