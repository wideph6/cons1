import type { VercelStatus, VercelVerification } from "./types";

const API = "https://api.vercel.com";

export function vercelConfigured(): boolean {
  return Boolean(process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID);
}

function teamQuery(): string {
  const team = process.env.VERCEL_TEAM_ID;
  return team ? `?teamId=${encodeURIComponent(team)}` : "";
}

async function vfetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) throw new Error("VERCEL_API_TOKEN is not set");
  const res = await fetch(`${API}${path}${teamQuery()}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data: data as T };
}

function projectId(): string {
  const id = process.env.VERCEL_PROJECT_ID;
  if (!id) throw new Error("VERCEL_PROJECT_ID is not set");
  return encodeURIComponent(id);
}

interface ProjectDomainResponse {
  name?: string;
  verified?: boolean;
  verification?: VercelVerification[];
  error?: { code?: string; message?: string };
}

interface DomainConfigResponse {
  misconfigured?: boolean;
  error?: { code?: string; message?: string };
}

function errMessage(data: { error?: { code?: string; message?: string } } | null, status: number): string {
  return data?.error?.message ?? data?.error?.code ?? `Vercel API error (${status})`;
}

export async function addDomainToProject(hostname: string): Promise<VercelStatus> {
  const res = await vfetch<ProjectDomainResponse>(`/v10/projects/${projectId()}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: hostname }),
  });
  if (!res.ok && res.data?.error?.code !== "domain_already_in_use_by_project") {
    // Domain may already be attached; fall through to a status check instead of failing outright.
    const status = await domainStatus(hostname);
    if (!status.added) status.error = errMessage(res.data, res.status);
    return status;
  }
  return domainStatus(hostname);
}

export async function removeDomainFromProject(hostname: string): Promise<{ ok: boolean; error?: string }> {
  const res = await vfetch<{ error?: { code?: string; message?: string } }>(
    `/v9/projects/${projectId()}/domains/${encodeURIComponent(hostname)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) return { ok: false, error: errMessage(res.data, res.status) };
  return { ok: true };
}

export async function verifyProjectDomain(hostname: string): Promise<VercelStatus> {
  await vfetch<ProjectDomainResponse>(
    `/v9/projects/${projectId()}/domains/${encodeURIComponent(hostname)}/verify`,
    { method: "POST" },
  );
  return domainStatus(hostname);
}

export async function domainStatus(hostname: string): Promise<VercelStatus> {
  const checked_at = new Date().toISOString();
  if (!vercelConfigured()) {
    return { configured: false, added: false, verified: false, misconfigured: null, checked_at };
  }
  try {
    const dom = await vfetch<ProjectDomainResponse>(
      `/v9/projects/${projectId()}/domains/${encodeURIComponent(hostname)}`,
    );
    if (!dom.ok) {
      return {
        configured: true,
        added: false,
        verified: false,
        misconfigured: null,
        error: dom.status === 404 ? undefined : errMessage(dom.data, dom.status),
        checked_at,
      };
    }
    const cfg = await vfetch<DomainConfigResponse>(`/v6/domains/${encodeURIComponent(hostname)}/config`);
    return {
      configured: true,
      added: true,
      verified: Boolean(dom.data.verified),
      misconfigured: cfg.ok ? Boolean(cfg.data.misconfigured) : null,
      verification: dom.data.verification ?? [],
      checked_at,
    };
  } catch (e) {
    return {
      configured: true,
      added: false,
      verified: false,
      misconfigured: null,
      error: e instanceof Error ? e.message : "Could not reach Vercel",
      checked_at,
    };
  }
}
