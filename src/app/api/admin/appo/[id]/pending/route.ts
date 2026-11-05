import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requireSuperadmin, requireUser, run } from "@/lib/api";
import { USER_COLUMNS } from "@/lib/auth";
import { fileLinks } from "@/lib/file-history";
import { getRecord } from "@/lib/appo";
import { editAppoRecord, type PatchBody } from "@/lib/appo-edit";
import { dropPending, pendingRow } from "@/lib/pending-edits";
import { deleteObject, headObject } from "@/lib/r2";
import { db } from "@/lib/supabase";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const TABLE = "appo_pending_edits";

/**
 * GET /api/admin/appo/:id/pending — the change waiting for approval on this document: each field before
 * and after, and (when it replaces the PDF) the PDF as it is now and the one it would become, to compare
 * side by side. Super admin only.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;
    const [row, record] = await Promise.all([pendingRow(TABLE, id), getRecord(id)]);
    if (!row) throw new ApiError(404, "No change is waiting for this document");
    const body = row.request as PatchBody;
    const proposed =
      row.newDocKey && (await headObject(row.newDocKey))
        ? await fileLinks(row.newDocKey, String(body.doc_filename ?? "new.pdf"), "application/pdf", 0)
        : null;
    const current = await fileLinks(record.doc_r2_key, record.doc_filename, record.doc_content_type, record.doc_size);
    return ok({ pending: row.info, label: record.attestation_number, current, proposed });
  });
}

/**
 * POST /api/admin/appo/:id/pending { decision: "approve" | "reject" } — the super admin approves the
 * waiting change (it is saved now, as the user who asked for it, checked against the document as it is
 * now) or turns it down (nothing changes; a PDF sent with it is deleted).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const me = await requireUser();
    requireSuperadmin(me);
    const { id } = await params;
    const { decision } = await readBody<{ decision?: string }>(req);
    if (decision !== "approve" && decision !== "reject") throw new ApiError(400, "decision must be approve or reject");
    const row = await pendingRow(TABLE, id);
    if (!row) throw new ApiError(404, "No change is waiting for this document. It may already have been decided.");

    if (decision === "reject") {
      await dropPending(TABLE, row.info.id);
      const record = await getRecord(id);
      after(async () => {
        if (row.newDocKey && row.newDocKey !== record.doc_r2_key) await deleteObject(row.newDocKey);
        await logActivity({
          user_id: me.id,
          action: "reject_appo_edit",
          domain: { id: null, hostname: record.domain_hostname },
          file: { id: null, filename: record.doc_filename },
          details: { attestation_number: record.attestation_number, requested_by: row.info.requested_by_name },
        });
      });
      return ok({ item: record });
    }

    // Saved as the user who asked for it, so the history shows who changed what; the super admin's
    // approval is logged beside it.
    const requester = row.requestedBy
      ? ((await db().from("users").select(USER_COLUMNS).eq("id", row.requestedBy).maybeSingle()).data as User | null)
      : null;
    const result = await editAppoRecord(requester ?? me, id, row.request as PatchBody, { approved: true });
    await dropPending(TABLE, row.info.id);
    after(() =>
      logActivity({
        user_id: me.id,
        action: "approve_appo_edit",
        domain: { id: null, hostname: result.item.domain_hostname },
        file: { id: null, filename: result.item.doc_filename },
        details: { attestation_number: result.item.attestation_number, requested_by: row.info.requested_by_name },
      }),
    );
    return ok({ item: { ...result.item, pending_edit: null } });
  });
}
