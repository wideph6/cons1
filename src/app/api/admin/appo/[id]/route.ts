import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import {
  ApiError,
  ok,
  readBody,
  requirePermission,
  requireUser,
  run,
} from "@/lib/api";
import {
  dbError,
  getRecord,
  releaseSignature,
  requireAppoAccess,
  withCurrentQr,
} from "@/lib/appo";
import { deleteObject } from "@/lib/r2";
import { requireOwnCase } from "@/lib/review";
import { db } from "@/lib/supabase";
import { editAppoRecord, type PatchBody } from "@/lib/appo-edit";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/appo/:id */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requireAppoAccess(user);
    const { id } = await params;
    const record = await getRecord(id);
    requireOwnCase(user, record.created_by);
    const [item] = await withCurrentQr([record]);
    return ok({ item });
  });
}

/** PATCH /api/admin/appo/:id — any field, the officer and the PDF itself. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appo_edit");
    const { id } = await params;
    const body = await readBody<PatchBody>(req);
    return ok(await editAppoRecord(user, id, body));
  });
}

/** DELETE /api/admin/appo/:id — removes the PDF from storage too. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appo_delete");
    const { id } = await params;

    // One call removes the row and hands back what has to be tidied after it.
    const { data, error } = await db()
      .from("appo_records")
      .delete()
      .eq("id", id)
      .select("attestation_number,issue_date,doc_filename,doc_r2_key,officer_signature_r2_key,appo_domains(hostname)")
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new ApiError(404, "Document not found");
    const gone = data as unknown as {
      attestation_number: string;
      issue_date: string;
      doc_filename: string;
      doc_r2_key: string;
      officer_signature_r2_key: string | null;
      appo_domains: { hostname: string } | null;
    };

    after(async () => {
      await deleteObject(gone.doc_r2_key);
      // The signature belongs to the saved officer and other documents may show it, so it only goes
      // when nothing does any more.
      await releaseSignature(gone.officer_signature_r2_key);
      await logActivity({
        user_id: user.id,
        action: "delete_appo",
        domain: { id: null, hostname: gone.appo_domains?.hostname ?? null },
        file: { id: null, filename: gone.doc_filename },
        details: { attestation_number: gone.attestation_number, issue_date: gone.issue_date },
      });
    });
    return ok({ ok: true });
  });
}
