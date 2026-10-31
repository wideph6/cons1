import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import {
  cleanText,
  dbError,
  checkLinkDomain,
  docColumns,
  getLinkWithHost,
  getRecord,
  normalizeNumber,
  numberTaken,
  officerColumns,
  OPTION_KINDS,
  OPTION_LABELS,
  parseIssueDate,
  qrColumns,
  recordFromRow,
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

    // Everything that needs no database is checked first, so a typing mistake costs no round trip.
    const nextNumber = body.attestation_number !== undefined ? normalizeNumber(body.attestation_number) : undefined;
    const nextDate = body.issue_date !== undefined ? parseIssueDate(body.issue_date) : undefined;
    const typed: Partial<Record<NewMOptionKind, string>> = {};
    for (const kind of OPTION_KINDS) {
      if (body[kind] !== undefined) typed[kind] = cleanText(body[kind], OPTION_LABELS[kind]);
    }

    const officerId = body.officer_id === undefined ? undefined : body.officer_id || null;

    // The document and everything the edit might need are read side by side, in one round. A lookup
    // that fails only matters if the edit really changes that part, so failures are held until then.
    const held = <T,>(p: Promise<T>) => p.catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
    const [existing, linkRead, numberRead, officerRead, docRead] = await Promise.all([
      getRecord(id),
      body.link_id !== undefined ? held(getLinkWithHost(body.link_id)) : null,
      nextNumber !== undefined ? held(numberTaken(nextNumber, id)) : null,
      officerId ? held(officerColumns(officerId)) : null,
      body.doc_key !== undefined ? held(docColumns(body.doc_key, body.doc_filename, body.doc_content_type)) : null,
    ]);
    const use = <T,>(read: T | Error | null): T | null => {
      if (read instanceof Error) throw read;
      return read;
    };

    const domainChanged = body.domain_id !== undefined && body.domain_id !== existing.domain_id;
    const domainId = domainChanged ? (body.domain_id as string) : existing.domain_id;
    const linkChanged = body.link_id !== undefined && body.link_id !== existing.link_id;
    // A new domain always needs one of its own links.
    if (domainChanged && !linkChanged) throw new ApiError(400, "Pick one of the new domain's links");
    const numberChanged = nextNumber !== undefined && nextNumber !== existing.attestation_number;
    // An officer removed from the saved list leaves officer_id empty but the copy in place, so taking
    // the officer off has to look at the copy as well as the id.
    const hasOfficer = Boolean(existing.officer_id || existing.officer_name || existing.officer_signature_r2_key);
    const officerChanged = officerId !== undefined && (officerId ? officerId !== existing.officer_id : hasOfficer);
    const docChanged = body.doc_key !== undefined && body.doc_key !== existing.doc_r2_key;

    const linkFound = linkChanged ? use(linkRead) : null;
    const link = linkFound ? checkLinkDomain(linkFound, domainId) : null;
    if (numberChanged && use(numberRead)) throw new ApiError(409, `${nextNumber} is already used by another document`);
    const officer = officerChanged ? (officerId ? use(officerRead) : await officerColumns(null)) : null;
    const doc = docChanged ? use(docRead) : null;

    const patch: Record<string, unknown> = {};
    if (domainChanged) patch.domain_id = domainId;
    if (link) {
      patch.link_id = link.id;
      patch.link_template = link.template;
    }
    if (numberChanged) patch.attestation_number = nextNumber;
    if (nextDate !== undefined && nextDate !== existing.issue_date) patch.issue_date = nextDate;
    for (const kind of OPTION_KINDS) {
      if (typed[kind] !== undefined && typed[kind] !== existing[kind]) patch[kind] = typed[kind];
    }
    if (officer) Object.assign(patch, officer);
    if (doc) {
      Object.assign(patch, doc);
      patch.doc_replaced_at = new Date().toISOString();
    }

    // The complete link is made of the domain, its link, the number and the date. When an edit changes
    // any of them, a QR code is drawn for the new link and replaces the saved one.
    const hostname = link?.hostname ?? existing.domain_hostname;
    const template = link?.template ?? existing.link_current_template ?? existing.link_template;
    const nextUrl = resolveLink(
      hostname,
      template,
      (patch.attestation_number as string | undefined) ?? existing.attestation_number,
      (patch.issue_date as string | undefined) ?? existing.issue_date,
    );
    const qrReplaced = !existing.qr_svg || nextUrl !== existing.qr_url;
    if (qrReplaced) Object.assign(patch, qrColumns(nextUrl), { link_template: template });

    if (!Object.keys(patch).length) return ok({ item: existing });
    patch.updated_at = new Date().toISOString();

    // Only values this edit changed join the saved lists, so one removed from a list on purpose is not
    // brought back by editing a document that still carries it. Written alongside the document.
    const changedTexts: Partial<Record<NewMOptionKind, string>> = {};
    for (const kind of OPTION_KINDS) if (kind in patch) changedTexts[kind] = patch[kind] as string;

    const [{ data, error }] = await Promise.all([
      db().from("new_m_records").update(patch).eq("id", id).select("*").single(),
      rememberOptions(user, changedTexts).catch((e) => console.error("[new-m] saving list values failed", e)),
    ]);
    if (error) {
      if (error.code === "23505") throw new ApiError(409, "That attestation number is already used by another document");
      // No row came back: the document was deleted while this edit was open.
      if (error.code === "PGRST116") throw new ApiError(404, "Document not found");
      throw dbError(error);
    }

    const item = recordFromRow(data, {
      domain_hostname: hostname,
      link_name: link ? link.name : existing.link_name,
      link_current_template: link ? link.template : existing.link_current_template,
      uploader_name: existing.uploader_name,
      uploader_email: existing.uploader_email,
    });

    // Tidying up and the log wait until the reply is on its way. The row already points at the new
    // PDF and signature, so the old ones can go: the PDF always, the signature only once nothing else
    // shows it.
    after(async () => {
      if (doc) await deleteObject(existing.doc_r2_key);
      if (officer && officer.officer_signature_r2_key !== existing.officer_signature_r2_key) {
        await releaseSignature(existing.officer_signature_r2_key);
      }
      await logActivity({
        user_id: user.id,
        action: doc ? "replace_new_m_doc" : "update_new_m",
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
