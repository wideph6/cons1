import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, must, ok, requirePermission, requireUser, run } from "@/lib/api";
import { db } from "@/lib/supabase";
import type { Domain } from "@/lib/types";
import { addDomainToProject, domainStatus, removeDomainFromProject, vercelConfigured, verifyProjectDomain } from "@/lib/vercel";

type Ctx = { params: Promise<{ id: string }> };

async function loadDomain(id: string): Promise<Domain> {
  return must(await db().from("domains").select("*").eq("id", id).maybeSingle(), "Domain not found") as Domain;
}

/** GET — refresh Vercel status for this domain. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    await requireUser();
    const { id } = await params;
    const domain = await loadDomain(id);
    const status = await domainStatus(domain.hostname);
    await db().from("domains").update({ vercel_status: status }).eq("id", id);
    return ok({ status });
  });
}

/** POST — attach the domain to the Vercel project (or re-run verification). */
export async function POST(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "edit_domain");
    if (!vercelConfigured()) {
      throw new ApiError(400, "Vercel API is not configured. Set VERCEL_API_TOKEN and VERCEL_PROJECT_ID.");
    }
    const { id } = await params;
    const domain = await loadDomain(id);
    const verifyOnly = req.nextUrl.searchParams.get("verify") === "1";
    const status = verifyOnly ? await verifyProjectDomain(domain.hostname) : await addDomainToProject(domain.hostname);
    await db().from("domains").update({ vercel_status: status }).eq("id", id);
    await logActivity({
      user_id: user.id,
      action: "update_domain",
      domain: { id, hostname: domain.hostname },
      details: { vercel: verifyOnly ? "verify" : "add", added: status.added, verified: status.verified },
    });
    return ok({ status });
  });
}

/** DELETE — detach from the Vercel project (keeps the domain in this panel). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "edit_domain");
    if (!vercelConfigured()) throw new ApiError(400, "Vercel API is not configured.");
    const { id } = await params;
    const domain = await loadDomain(id);
    const res = await removeDomainFromProject(domain.hostname);
    if (!res.ok) throw new ApiError(502, res.error ?? "Vercel refused the request");
    const status = await domainStatus(domain.hostname);
    await db().from("domains").update({ vercel_status: status }).eq("id", id);
    await logActivity({
      user_id: user.id,
      action: "update_domain",
      domain: { id, hostname: domain.hostname },
      details: { vercel: "remove" },
    });
    return ok({ status });
  });
}
