import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import { cleanText, dbError, getMDomain, refreshQrWhere, releaseSignature } from "@/lib/new-m";
import { deleteObjects } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { normalizeHostname } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/new-m/domains/:id  { hostname?, notes? }
 * A new hostname changes the complete link of every document on the domain, so their QR codes are
 * redrawn and saved in the same request.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_domains");
    const { id } = await params;
    const body = await readBody<{ hostname?: string; notes?: string }>(req);
    const existing = await getMDomain(id);

    const patch: Record<string, unknown> = {};
    if (body.hostname !== undefined) {
      const hostname = normalizeHostname(body.hostname);
      if (hostname !== existing.hostname) patch.hostname = hostname;
    }
    if (body.notes !== undefined) patch.notes = cleanText(body.notes, "Notes");
    if (!Object.keys(patch).length) return ok({ item: existing, qr_replaced: 0 });

    const { error } = await db().from("new_m_domains").update(patch).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `${patch.hostname} is already a New M domain`);
      throw dbError(error);
    }

    const qrReplaced = patch.hostname ? await refreshQrWhere("domain_id", id) : 0;

    await logActivity({
      user_id: user.id,
      action: "update_new_m_domain",
      domain: { id: null, hostname: (patch.hostname as string | undefined) ?? existing.hostname },
      details: { previous_hostname: existing.hostname, changes: patch, qr_replaced: qrReplaced },
    });
    return ok({ item: await getMDomain(id), qr_replaced: qrReplaced });
  });
}

/** DELETE /api/admin/new-m/domains/:id — the domain, its links, and every document on it with its PDF. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_domains");
    const { id } = await params;
    const existing = await getMDomain(id);

    const { data: docs, error: dErr } = await db()
      .from("new_m_records")
      .select("doc_r2_key,officer_signature_r2_key")
      .eq("domain_id", id);
    if (dErr) throw dbError(dErr);

    // Links and documents cascade with the domain.
    const { error } = await db().from("new_m_domains").delete().eq("id", id);
    if (error) throw dbError(error);

    await deleteObjects((docs ?? []).map((d) => d.doc_r2_key as string));
    // A signature goes only once no saved officer and no other document still shows it.
    const signatures = new Set((docs ?? []).map((d) => d.officer_signature_r2_key as string | null).filter(Boolean));
    for (const key of signatures) await releaseSignature(key);

    await logActivity({
      user_id: user.id,
      action: "delete_new_m_domain",
      domain: { id: null, hostname: existing.hostname },
      details: { documents: docs?.length ?? 0 },
    });
    return ok({ ok: true, documents_deleted: docs?.length ?? 0 });
  });
}
