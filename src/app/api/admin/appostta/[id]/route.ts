import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import {
  getDomain,
  getRecord,
  issuedToIso,
  normalizeNumber,
  numberTaken,
  parseIssuedOn,
  sanitizeFields,
} from "@/lib/appostta";
import { deleteObject, deleteObjects, headObject, isApposttaKey } from "@/lib/r2";
import { db } from "@/lib/supabase";
import { cleanFilename, guessContentType } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

interface PatchBody {
  domain_id?: string;
  number?: string;
  issued_on?: string;
  fields?: unknown;
  signatory_name?: string;
  /** A new key replaces the image; null clears it and falls back to the shared signature. */
  signature_key?: string | null;
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

    if (body.fields !== undefined) patch.fields = sanitizeFields(body.fields);
    if (body.signatory_name !== undefined) patch.signatory_name = String(body.signatory_name).trim();
    if (body.notes !== undefined) patch.notes = String(body.notes).trim();

    if (body.signature_key !== undefined) {
      if (body.signature_key === null) {
        if (existing.signature_r2_key) stale.push(existing.signature_r2_key);
        patch.signature_r2_key = null;
        patch.signature_content_type = null;
      } else {
        if (!isApposttaKey(body.signature_key, "signatures")) throw new ApiError(400, "Invalid signature storage key");
        const head = await headObject(body.signature_key);
        if (!head) throw new ApiError(400, "The uploaded signature was not found in storage. Please upload again.");
        if (existing.signature_r2_key && existing.signature_r2_key !== body.signature_key) stale.push(existing.signature_r2_key);
        patch.signature_r2_key = body.signature_key;
        patch.signature_content_type = head.contentType ?? "image/png";
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

    if (existing.doc_r2_key) await deleteObject(existing.doc_r2_key);
    if (existing.signature_r2_key) await deleteObject(existing.signature_r2_key);

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
