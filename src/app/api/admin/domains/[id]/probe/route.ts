import type { NextRequest } from "next/server";
import { must, ok, requireUser, run } from "@/lib/api";
import { probeHostname } from "@/lib/reach";
import { db } from "@/lib/supabase";
import type { Domain } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/domains/:id/probe
 * Fetches the domain over the public internet and reports whether this deployment is what answers.
 * Works with or without the Vercel API configured — it tests the address a visitor actually uses,
 * so it needs no extra columns and is always read live rather than from a cached status.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    await requireUser();
    const { id } = await params;
    const domain = must(await db().from("domains").select("*").eq("id", id).maybeSingle(), "Domain not found") as Domain;

    const result = await probeHostname(domain.hostname);
    if (!domain.is_active && result.serves) {
      result.level = "fail";
      result.message = `${domain.hostname} is disabled in this panel`;
      result.hint = "Turn the domain back on to serve its links.";
    }
    return ok({ result });
  });
}
