import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { db } from "@/lib/supabase";
import type { Domain, LinkRow } from "@/lib/types";
import { normalizeHostname } from "@/lib/utils";
import { addDomainToProject, vercelConfigured } from "@/lib/vercel";

/** GET /api/admin/domains?include=links  — all domains (optionally with their links and counts). */
export async function GET(req: NextRequest) {
  return run(async () => {
    await requireUser();
    const include = req.nextUrl.searchParams.get("include") ?? "";

    const { data: domains, error } = await db().from("domains").select("*").order("hostname");
    if (error) throw new ApiError(500, error.message);

    const { data: links, error: lErr } = await db().from("links_view").select("*").order("path");
    if (lErr) throw new ApiError(500, lErr.message);

    const byDomain = new Map<string, LinkRow[]>();
    for (const l of (links ?? []) as LinkRow[]) {
      const arr = byDomain.get(l.domain_id) ?? [];
      arr.push(l);
      byDomain.set(l.domain_id, arr);
    }

    const items: Domain[] = ((domains ?? []) as Domain[]).map((d) => {
      const ls = byDomain.get(d.id) ?? [];
      return {
        ...d,
        file_count: ls.reduce((s, l) => s + (l.file_count ?? 0), 0),
        total_size: ls.reduce((s, l) => s + Number(l.total_size ?? 0), 0),
        ...(include.includes("links") ? { links: ls } : {}),
      };
    });

    return ok({ items, vercel_configured: vercelConfigured() });
  });
}

/** POST /api/admin/domains  { hostname, notes?, add_to_vercel?, create_root_link? } */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "create_domain");
    const body = await readBody<{ hostname?: string; notes?: string; add_to_vercel?: boolean; create_root_link?: boolean }>(req);
    const hostname = normalizeHostname(body.hostname);

    const { data: created, error } = await db()
      .from("domains")
      .insert({ hostname, notes: (body.notes ?? "").trim(), created_by: user.id })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `${hostname} is already added`);
      throw new ApiError(500, error.message);
    }

    let vercel_status = null;
    if (body.add_to_vercel && vercelConfigured()) {
      vercel_status = await addDomainToProject(hostname);
      await db().from("domains").update({ vercel_status }).eq("id", created.id);
    }

    if (body.create_root_link !== false) {
      await db().from("links").insert({ domain_id: created.id, path: "", created_by: user.id });
    }

    await logActivity({
      user_id: user.id,
      action: "create_domain",
      domain: { id: created.id, hostname },
      details: { add_to_vercel: Boolean(body.add_to_vercel) },
    });

    return ok({ item: { ...created, vercel_status } }, { status: 201 });
  });
}
