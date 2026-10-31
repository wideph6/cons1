import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import {
  cleanText,
  dbError,
  docColumns,
  getMDomain,
  getRecord,
  linkFor,
  normalizeNumber,
  numberTaken,
  officerColumns,
  OPTION_KINDS,
  OPTION_LABELS,
  parseIssueDate,
  qrColumns,
  releaseSignature,
  rememberOptions,
  requireNewMAccess,
  withCurrentQr,
} from "@/lib/new-m";
import { resolveLink } from "@/lib/new-m-link";
import { deleteObject } from "@/lib/r2";
import { db } from "@/lib/supabase";
import type { NewMOptionKind } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Every field is optional: whatever is left out stays as it is. */
interface PatchBody {
  /** A New M domain. Moving to another domain needs one of its links in link_id too. */
  domain_id?: string;
  link_id?: string;
  attestation_number?: string;
  issue_date?: string;
  document_type?: string;
  issuing_office?: string;
  issuing_authority?: string;
  /** A saved officer to copy onto the document; blank or null takes the officer off. Omitted keeps the current one. */
  officer_id?: string | null;
  /** A newly uploaded PDF, replacing the current one. */
  doc_key?: string;
  doc_filename?: string;
  doc_content_type?: string;
}

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
    const existing = await getRecord(id);

    const patch: Record<string, unknown> = {};

    let hostname = existing.domain_hostname;
    let domainId = existing.domain_id;
    if (body.domain_id !== undefined && body.domain_id !== existing.domain_id) {
      const domain = await getMDomain(body.domain_id);
      patch.domain_id = domain.id;
      hostname = domain.hostname;
      domainId = domain.id;
    }

    // The document's link as it reads now, unless another of the domain's links is picked. A new
    // domain always needs one of its own links.
    let template = existing.link_current_template ?? existing.link_template;
    if (body.link_id !== undefined && body.link_id !== existing.link_id) {
      const link = await linkFor(domainId, body.link_id);
      patch.link_id = link.id;
      patch.link_template = link.template;
      template = link.template;
    } else if (patch.domain_id) {
      throw new ApiError(400, "Pick one of the new domain's links");
    }

    if (body.attestation_number !== undefined) {
      const next = normalizeNumber(body.attestation_number);
      if (next !== existing.attestation_number) {
        if (await numberTaken(next, id)) throw new ApiError(409, `${next} is already used by another document`);
        patch.attestation_number = next;
      }
    }

    if (body.issue_date !== undefined) {
      const next = parseIssueDate(body.issue_date);
      if (next !== existing.issue_date) patch.issue_date = next;
    }

    const typed: Partial<Record<NewMOptionKind, string>> = {};
    for (const kind of OPTION_KINDS) {
      if (body[kind] === undefined) continue;
      const next = cleanText(body[kind], OPTION_LABELS[kind]);
      typed[kind] = next;
      if (next !== existing[kind]) patch[kind] = next;
    }

    // An officer removed from the saved list leaves officer_id empty but the copy in place, so taking
    // the officer off has to look at the copy as well as the id.
    const officerId = body.officer_id === undefined ? undefined : body.officer_id || null;
    const hasOfficer = Boolean(existing.officer_id || existing.officer_name || existing.officer_signature_r2_key);
    if (officerId !== undefined && (officerId ? officerId !== existing.officer_id : hasOfficer)) {
      Object.assign(patch, await officerColumns(officerId));
    }

    let replacedDoc = false;
    if (body.doc_key !== undefined && body.doc_key !== existing.doc_r2_key) {
      Object.assign(patch, await docColumns(body.doc_key, body.doc_filename, body.doc_content_type));
      patch.doc_replaced_at = new Date().toISOString();
      replacedDoc = true;
    }

    // The complete link is made of the domain, its link, the number and the date. When an edit changes
    // any of them, a QR code is drawn for the new link and replaces the saved one.
    const nextUrl = resolveLink(
      hostname,
      template,
      (patch.attestation_number as string | undefined) ?? existing.attestation_number,
      (patch.issue_date as string | undefined) ?? existing.issue_date,
    );
    const qrReplaced = !existing.qr_svg || nextUrl !== existing.qr_url;
    if (qrReplaced) Object.assign(patch, qrColumns(nextUrl));

    await rememberOptions(user, typed);

    if (!Object.keys(patch).length) return ok({ item: existing });
    patch.updated_at = new Date().toISOString();

    const { error } = await db().from("new_m_records").update(patch).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new ApiError(409, "That attestation number is already used by another document");
      throw dbError(error);
    }

    // Only once the row points at the new ones: the old PDF goes, and the old signature too if nothing else shows it.
    if (replacedDoc) await deleteObject(existing.doc_r2_key);
    if ("officer_signature_r2_key" in patch && patch.officer_signature_r2_key !== existing.officer_signature_r2_key) {
      await releaseSignature(existing.officer_signature_r2_key);
    }

    const item = await getRecord(id);
    await logActivity({
      user_id: user.id,
      action: replacedDoc ? "replace_new_m_doc" : "update_new_m",
      domain: { id: null, hostname: item.domain_hostname },
      file: { id: null, filename: item.doc_filename },
      details: {
        attestation_number: item.attestation_number,
        changed: Object.keys(patch).filter((k) => k !== "updated_at" && !k.startsWith("qr_")),
        previous_number: existing.attestation_number,
        previous_issue_date: existing.issue_date,
        qr_replaced: qrReplaced,
      },
    });
    return ok({ item });
  });
}

/** DELETE /api/admin/new-m/:id — removes the PDF from storage too. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_delete");
    const { id } = await params;
    const existing = await getRecord(id);

    const { error } = await db().from("new_m_records").delete().eq("id", id);
    if (error) throw dbError(error);

    await deleteObject(existing.doc_r2_key);
    // The signature belongs to the saved officer and other documents may show it, so it only goes
    // when nothing does any more.
    await releaseSignature(existing.officer_signature_r2_key);

    await logActivity({
      user_id: user.id,
      action: "delete_new_m",
      domain: { id: null, hostname: existing.domain_hostname },
      file: { id: null, filename: existing.doc_filename },
      details: { attestation_number: existing.attestation_number, issue_date: existing.issue_date },
    });
    return ok({ ok: true });
  });
}
