import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { checkTemplate, cleanText, dbError, getMDomain, getMLink, refreshQrWhere } from "@/lib/appo";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/appo/links/:id  { name?, template? }
 * Documents follow their link, so a new template changes each of their complete links; their QR codes
 * are redrawn and saved in the same request.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appo_domains");
    const { id } = await params;
    const body = await readBody<{ name?: string; template?: string }>(req);
    const existing = await getMLink(id);
    const domain = await getMDomain(existing.domain_id);

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = cleanText(body.name, "Link name");
      if (name !== existing.name) patch.name = name;
    }
    if (body.template !== undefined) {
      const template = checkTemplate(body.template, domain.hostname);
      if (template !== existing.template) patch.template = template;
    }
    if (!Object.keys(patch).length) return ok({ item: existing, qr_replaced: 0 });
    patch.updated_at = new Date().toISOString();

    const { error } = await db().from("appo_link_templates").update(patch).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `${domain.hostname} already has this link`);
      throw dbError(error);
    }

    const qrReplaced = patch.template ? await refreshQrWhere("link_id", id) : 0;

    await logActivity({
      user_id: user.id,
      action: "update_appo_link",
      domain: { id: null, hostname: domain.hostname },
      details: { previous_template: existing.template, changes: patch, qr_replaced: qrReplaced },
    });
    return ok({ item: await getMLink(id), qr_replaced: qrReplaced });
  });
}

/**
 * DELETE /api/admin/appo/links/:id
 * Documents built on the link keep their complete link and QR code: each holds a copy of the link,
 * brought up to date here before the link goes.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appo_domains");
    const { id } = await params;
    const existing = await getMLink(id);
    const domain = await getMDomain(existing.domain_id);

    const { error: cErr } = await db().from("appo_records").update({ link_template: existing.template }).eq("link_id", id);
    if (cErr) throw dbError(cErr);

    const { error } = await db().from("appo_link_templates").delete().eq("id", id);
    if (error) throw dbError(error);

    await logActivity({
      user_id: user.id,
      action: "delete_appo_link",
      domain: { id: null, hostname: domain.hostname },
      details: { name: existing.name, template: existing.template },
    });
    return ok({ ok: true });
  });
}
