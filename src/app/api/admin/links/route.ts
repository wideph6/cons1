import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, must, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { db } from "@/lib/supabase";
import { normalizePath } from "@/lib/utils";

/** GET /api/admin/links?domain_id=  — links (with file counts) for a domain, or all. */
export async function GET(req: NextRequest) {
  return run(async () => {
    await requireUser();
    const domainId = req.nextUrl.searchParams.get("domain_id");
    let q = db().from("links_view").select("*").order("path");
    if (domainId) q = q.eq("domain_id", domainId);
    const { data, error } = await q;
    if (error) throw new ApiError(500, error.message);
    return ok({ items: data ?? [] });
  });
}

/** POST /api/admin/links  { domain_id, path, notes? } */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "create_link");
    const body = await readBody<{ domain_id?: string; path?: string; notes?: string }>(req);
    if (!body.domain_id) throw new ApiError(400, "domain_id is required");
    const path = normalizePath(body.path);

    const domain = must(
      await db().from("domains").select("id,hostname").eq("id", body.domain_id).maybeSingle(),
      "Domain not found",
    ) as { id: string; hostname: string };

    const { data, error } = await db()
      .from("links")
      .insert({ domain_id: domain.id, path, notes: (body.notes ?? "").trim(), created_by: user.id })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `The link /${path} already exists on ${domain.hostname}`);
      throw new ApiError(500, error.message);
    }

    await logActivity({
      user_id: user.id,
      action: "create_link",
      domain,
      link: { id: data.id, path },
    });

    const { data: view } = await db().from("links_view").select("*").eq("id", data.id).single();
    return ok({ item: view ?? { ...data, file_count: 0, total_size: 0, last_upload_at: null } }, { status: 201 });
  });
}
