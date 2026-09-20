import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import {
  applyFieldValues,
  getDomain,
  getRecord,
  getSettings,
  issuedToIso,
  normalizeNumber,
  numberTaken,
  parseIssuedOn,
  pickSignature,
} from "@/lib/appostta";
import { deleteObject, deleteObjects, headObject, isApposttaKey } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { cleanFilename, guessContentType } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

interface PatchBody {
  domain_id?: string;
  number?: string;
  issued_on?: string;
  /** New values for the rows this record already has: `[{ id, value }]`. The rows themselves never change. */
  field_values?: unknown;
  /** Reissue under a different signature from settings. Empty string removes the signature. */
  signature_id?: string;
  notes?: string;
  doc_key?: string;
  doc_filename?: string;
  doc_content_type?: string;
}

/** GET /api/admin/appostta/:id */
export async function GET(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    await requireUser();
    const { id } = await params;
    return ok({ item: await getRecord(id) });
  });
}

/** PATCH /api/admin/appostta/:id — number, date, domain, fields, signature and the document itself. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appostta_edit");
    const { id } = await params;
    const body = await readBody<PatchBody>(req);
    const existing = await getRecord(id);

    const patch: Record<string, unknown> = {};
    /** Objects the record stops pointing at, removed only after the row update succeeds. */
    const stale: string[] = [];

    if (body.domain_id !== undefined && body.domain_id !== existing.domain_id) {
      patch.domain_id = (await getDomain(body.domain_id)).id;
    }

    if (body.number !== undefined) {
      const next = normalizeNumber(body.number);
      if (next !== existing.number) {
        if (await numberTaken(next, id)) throw new ApiError(409, `${next} is already used by another record`);
        patch.number = next;
      }
    }

    if (body.issued_on !== undefined) {
      const next = issuedToIso(parseIssuedOn(body.issued_on));
      if (next !== existing.issued_on) patch.issued_on = next;
    }

    // Only the values move. The labels stay exactly as they were frozen when the record was created,
    // so editing an old record never pulls in row definitions added to settings since.
    if (body.field_values !== undefined) patch.fields = applyFieldValues(existing.fields, body.field_values);
    if (body.notes !== undefined) patch.notes = String(body.notes).trim();

    if (body.signature_id !== undefined && String(body.signature_id).trim() !== existing.signature_id) {
      const wanted = String(body.signature_id).trim();
      // Anything else about the record can still be edited when its signature has since been dropped
      // from settings, because leaving the choice alone never has to look that signature up again.
      if (!wanted) {
        patch.signature_id = "";
        patch.signatory_name = "";
        patch.signature_r2_key = null;
        patch.signature_content_type = null;
      } else {
        const settings = await getSettings();
        const signature = pickSignature(settings, wanted);
        if (!signature) throw new ApiError(400, "That signature is not in the Appostta settings");
        // Copied rather than referenced, so this record keeps printing it even if settings change later.
        patch.signature_id = signature.id;
        patch.signatory_name = signature.name;
        patch.signature_r2_key = signature.r2_key;
        patch.signature_content_type = signature.content_type;
      }
    }

    let replacedDoc = false;
    if (body.doc_key !== undefined) {
      if (!isApposttaKey(body.doc_key, "docs")) throw new ApiError(400, "Invalid document storage key");
      const head = await headObject(body.doc_key);
      if (!head) throw new ApiError(400, "The uploaded document was not found in storage. Please upload again.");
      const filename = cleanFilename(body.doc_filename ?? existing.doc_filename ?? body.doc_key.split("/").pop());
      if (existing.doc_r2_key && existing.doc_r2_key !== body.doc_key) stale.push(existing.doc_r2_key);
      patch.doc_r2_key = body.doc_key;
      patch.doc_filename = filename;
      patch.doc_size = head.size;
      patch.doc_content_type = guessContentType(filename, body.doc_content_type ?? head.contentType);
      if (existing.doc_r2_key) patch.doc_replaced_at = new Date().toISOString();
      else patch.doc_uploaded_at = new Date().toISOString();
      replacedDoc = Boolean(existing.doc_r2_key);
    } else if (body.doc_filename !== undefined && existing.doc_r2_key) {
      const filename = cleanFilename(body.doc_filename);
      patch.doc_filename = filename;
      patch.doc_content_type = guessContentType(filename, existing.doc_content_type);
    }

    if (!Object.keys(patch).length) return ok({ item: existing });
    patch.updated_at = new Date().toISOString();

    const { error } = await db().from("appostta_records").update(patch).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new ApiError(409, "That number is already used by another record");
      throw new ApiError(500, error.message);
    }
    await deleteObjects(stale);

    const item = await getRecord(id);
    await logActivity({
      user_id: user.id,
      action: replacedDoc ? "replace_appostta_doc" : "update_appostta",
      domain: { id: item.domain_id, hostname: item.domain_hostname },
      file: { id: null, filename: item.doc_filename },
      details: {
        number: item.number,
        changed: Object.keys(patch).filter((k) => k !== "updated_at"),
        previous_number: existing.number,
        previous_issued_on: existing.issued_on,
      },
    });
    return ok({ item });
  });
}

/** DELETE /api/admin/appostta/:id — removes the document and signature from storage too. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appostta_delete");
    const { id } = await params;
    const existing = await getRecord(id);

    const { error } = await db().from("appostta_records").delete().eq("id", id);
    if (error) throw new ApiError(500, error.message);

    // Only the document. The signature image belongs to the settings list and is shared by every
    // record issued under it, so deleting it here would blank other certificates.
    if (existing.doc_r2_key) await deleteObject(existing.doc_r2_key);

    await logActivity({
      user_id: user.id,
      action: "delete_appostta",
      domain: { id: existing.domain_id, hostname: existing.domain_hostname },
      file: { id: null, filename: existing.doc_filename },
      details: { number: existing.number, issued_on: existing.issued_on, downloads: existing.download_count },
    });
    return ok({ ok: true });
  });
}
