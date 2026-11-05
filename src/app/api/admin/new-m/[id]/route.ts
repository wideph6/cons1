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
  requireNewMAccess,
  withCurrentQr,
} from "@/lib/new-m";
import { deleteObject } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { editNewMRecord, type PatchBody } from "@/lib/new-m-edit";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/new-m/:id */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requireNewMAccess(user);
    const { id } = await params;
    const [item] = await withCurrentQr([await getRecord(id)]);
    return ok({ item });
  });
}

/** PATCH /api/admin/new-m/:id — any field, the officer and the PDF itself. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_edit");
    const { id } = await params;
    const body = await readBody<PatchBody>(req);
    return ok(await editNewMRecord(user, id, body));
  });
}

/** DELETE /api/admin/new-m/:id — removes the PDF from storage too. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_delete");
    const { id } = await params;

    // One call removes the row and hands back what has to be tidied after it.
    const { data, error } = await db()
      .from("new_m_records")
      .delete()
      .eq("id", id)
      .select("attestation_number,issue_date,doc_filename,doc_r2_key,officer_signature_r2_key,new_m_domains(hostname)")
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new ApiError(404, "Document not found");
    const gone = data as unknown as {
      attestation_number: string;
      issue_date: string;
      doc_filename: string;
      doc_r2_key: string;
      officer_signature_r2_key: string | null;
      new_m_domains: { hostname: string } | null;
    };

    after(async () => {
      await deleteObject(gone.doc_r2_key);
      // The signature belongs to the saved officer and other documents may show it, so it only goes
      // when nothing does any more.
      await releaseSignature(gone.officer_signature_r2_key);
      await logActivity({
        user_id: user.id,
        action: "delete_new_m",
        domain: { id: null, hostname: gone.new_m_domains?.hostname ?? null },
        file: { id: null, filename: gone.doc_filename },
        details: { attestation_number: gone.attestation_number, issue_date: gone.issue_date },
      });
    });
    return ok({ ok: true });
  });
}
