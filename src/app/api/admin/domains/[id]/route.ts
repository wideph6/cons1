import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, must, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { listLinkKeys } from "@/lib/files";
import { deleteObjects } from "@/lib/r2";
import { db } from "@/lib/supabase";
import type { Domain } from "@/lib/types";
import { normalizeHostname } from "@/lib/utils";
import { removeDomainFromProject, vercelConfigured } from "@/lib/vercel";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/domains/:id  { hostname?, notes?, is_active? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "edit_domain");
    const { id } = await params;
    const body = await readBody<{ hostname?: string; notes?: string; is_active?: boolean }>(req);

    const existing = must(await db().from("domains").select("*").eq("id", id).maybeSingle(), "Domain not found") as Domain;

    const patch: Record<string, unknown> = {};
    if (body.hostname !== undefined) patch.hostname = normalizeHostname(body.hostname);
    if (body.notes !== undefined) patch.notes = String(body.notes).trim();
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
    if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");

    const { data, error } = await db().from("domains").update(patch).eq("id", id).select("*").single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, "That domain is already added");
      throw new ApiError(500, error.message);
    }

    await logActivity({
      user_id: user.id,
      action: "update_domain",
      domain: { id, hostname: data.hostname },
      details: { changes: patch, previous_hostname: existing.hostname },
    });
    return ok({ item: data });
  });
}

/** DELETE /api/admin/domains/:id?vercel=1  — removes files from storage, then the domain (links cascade). */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "delete_domain");
    const { id } = await params;
    const alsoVercel = req.nextUrl.searchParams.get("vercel") === "1";

    const domain = must(await db().from("domains").select("*").eq("id", id).maybeSingle(), "Domain not found") as Domain;

    const { data: links, error: lErr } = await db().from("links").select("id").eq("domain_id", id);
    if (lErr) throw new ApiError(500, lErr.message);
    const linkIds = (links ?? []).map((l) => l.id as string);
    const keys = await listLinkKeys(linkIds);
    await deleteObjects(keys);

    const { error } = await db().from("domains").delete().eq("id", id);
    if (error) throw new ApiError(500, error.message);

    let vercel: { ok: boolean; error?: string } | null = null;
    if (alsoVercel && vercelConfigured()) vercel = await removeDomainFromProject(domain.hostname);

    await logActivity({
      user_id: user.id,
      action: "delete_domain",
      domain: { id: null, hostname: domain.hostname },
      details: { links: linkIds.length, files: keys.length, removed_from_vercel: vercel?.ok ?? false },
    });
    return ok({ ok: true, files_deleted: keys.length, links_deleted: linkIds.length, vercel });
  });
}
