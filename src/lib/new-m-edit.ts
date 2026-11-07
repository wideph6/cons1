import { after } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/errors";
import {
  cleanText,
  dbError,
  checkLinkDomain,
  docColumns,
  getLinkWithHost,
  getRecord,
  missingHashColumn,
  docNumberTaken,
  normalizeDocNumber,
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
} from "@/lib/new-m";
import { resolveLink } from "@/lib/new-m-link";
import { keepReplaced } from "@/lib/file-history";
import { db } from "@/lib/supabase";
import type { NewMOptionKind } from "@/lib/types";
import { addPending, shown, type PendingTable } from "@/lib/pending-edits";
import { needsApproval, type PendingChange, type PendingEditInfo } from "@/lib/pending-shared";
import { isCommission, requireOwnCase, RESUBMIT } from "@/lib/review";
import { reviewOf } from "@/lib/review-shared";
import type { User } from "@/lib/types";
import type { NewMRecord } from "@/lib/types";
import { formatIssued } from "@/lib/utils";

/**
 * Editing a New M document: what PATCH /api/admin/new-m/:id does, and what approving a waiting edit
 * runs again. Kept here so both go through the very same checks.
 */

const PENDING_TABLE: PendingTable = "new_m_pending_edits";

/** Every field is optional: whatever is left out stays as it is. */
export interface PatchBody {
  /** A New M domain. Moving to another domain needs one of its links in link_id too. */
  domain_id?: string;
  link_id?: string;
  attestation_number?: string;
  /** 7 digits; blank keeps the current one. */
  doc_number?: string;
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

export interface EditResult {
  item: NewMRecord;
  /** Set when the edit is waiting for the super admin's approval instead of being saved. */
  pending: PendingEditInfo | null;
}

/**
 * Applies an edit to a document, or, for an admin editing a document uploaded more than a month ago, keeps
 * it waiting for approval. opts.approved is set when the super admin approves a waiting edit: it is then
 * saved as the user who asked for it.
 */
export async function editNewMRecord(user: User, id: string, body: PatchBody, opts: { approved?: boolean } = {}): Promise<EditResult> {

  // Everything that needs no database is checked first, so a typing mistake costs no round trip.
  const nextNumber = body.attestation_number !== undefined ? normalizeNumber(body.attestation_number) : undefined;
  const nextDate = body.issue_date !== undefined ? parseIssueDate(body.issue_date) : undefined;
  const nextDocNumber = String(body.doc_number ?? "").trim() ? normalizeDocNumber(body.doc_number) : undefined;
  const typed: Partial<Record<NewMOptionKind, string>> = {};
  for (const kind of OPTION_KINDS) {
    if (body[kind] !== undefined) typed[kind] = cleanText(body[kind], OPTION_LABELS[kind]);
  }

  const officerId = body.officer_id === undefined ? undefined : body.officer_id || null;

  // The document and everything the edit might need are read side by side, in one round. A lookup
  // that fails only matters if the edit really changes that part, so failures are held until then.
  const held = <T,>(p: Promise<T>) => p.catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
  const [existing, linkRead, numberRead, officerRead, docRead, docNumberRead] = await Promise.all([
    getRecord(id),
    body.link_id !== undefined ? held(getLinkWithHost(body.link_id)) : null,
    nextNumber !== undefined ? held(numberTaken(nextNumber, id)) : null,
    officerId ? held(officerColumns(officerId)) : null,
    body.doc_key !== undefined ? held(docColumns(body.doc_key, body.doc_filename, body.doc_content_type)) : null,
    nextDocNumber !== undefined ? held(docNumberTaken(nextDocNumber, id)) : null,
  ]);
  const use = <T,>(read: T | Error | null): T | null => {
    if (read instanceof Error) throw read;
    return read;
  };
  // A commission user only ever changes their own documents.
  requireOwnCase(user, existing.created_by);
  const live = reviewOf(existing) === "approved";

  const domainChanged = body.domain_id !== undefined && body.domain_id !== existing.domain_id;
  const domainId = domainChanged ? (body.domain_id as string) : existing.domain_id;
  const linkChanged = body.link_id !== undefined && body.link_id !== existing.link_id;
  // A new domain always needs one of its own links.
  if (domainChanged && !linkChanged) throw new ApiError(400, "Pick one of the new domain's links");
  const numberChanged = nextNumber !== undefined && nextNumber !== existing.attestation_number;
  const docNumberChanged = nextDocNumber !== undefined && nextDocNumber !== existing.doc_number;
  // An officer removed from the saved list leaves officer_id empty but the copy in place, so taking
  // the officer off has to look at the copy as well as the id.
  const hasOfficer = Boolean(existing.officer_id || existing.officer_name || existing.officer_signature_r2_key);
  const officerChanged = officerId !== undefined && (officerId ? officerId !== existing.officer_id : hasOfficer);
  const docChanged = body.doc_key !== undefined && body.doc_key !== existing.doc_r2_key;

  const linkFound = linkChanged ? use(linkRead) : null;
  const link = linkFound ? checkLinkDomain(linkFound, domainId) : null;
  if (numberChanged && use(numberRead)) throw new ApiError(409, `${nextNumber} is already used by another document`);
  if (docNumberChanged && use(docNumberRead)) throw new ApiError(409, `Document number ${nextDocNumber} is already used by another document`);
  const officer = officerChanged ? (officerId ? use(officerRead) : await officerColumns(null)) : null;
  const doc = docChanged ? use(docRead) : null;

  const patch: Record<string, unknown> = {};
  if (domainChanged) patch.domain_id = domainId;
  if (link) {
    patch.link_id = link.id;
    patch.link_template = link.template;
  }
  if (numberChanged) patch.attestation_number = nextNumber;
  if (docNumberChanged) patch.doc_number = nextDocNumber;
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

  if (!Object.keys(patch).length) return { item: existing, pending: null };

  // An admin's change to a document uploaded more than a month ago waits for the super admin's approval;
  // until then visitors keep seeing the document as it was. The edit is kept as it was sent and is run
  // again when it is approved, checked against the document as it is then. A change that only redraws
  // the QR code (nothing the user changed) goes through as it always did.
  // A commission user's change to a live document always waits; one that is not live yet is changed now.
  const changes = summarize(existing, patch, link);
  if (!opts.approved && changes.length && live && needsApproval(user.role, existing.created_at)) {
    const pending = await addPending(PENDING_TABLE, {
      recordId: id,
      request: body,
      summary: changes,
      newDocKey: doc ? String(patch.doc_r2_key) : null,
      by: user.id,
    });
    after(() =>
      logActivity({
        user_id: user.id,
        action: "request_new_m_edit",
        domain: { id: null, hostname: existing.domain_hostname },
        file: { id: null, filename: existing.doc_filename },
        details: { attestation_number: existing.attestation_number, changed: changes.map((c) => c.field) },
      }),
    );
    return { item: { ...existing, pending_edit: pending }, pending };
  }
  patch.updated_at = new Date().toISOString();
  // A commission user's document that is not live yet, changed, waits for the super admin (again).
  if (isCommission(user) && !live && changes.length) Object.assign(patch, RESUBMIT);

  // Only values this edit changed join the saved lists, so one removed from a list on purpose is not
  // brought back by editing a document that still carries it. Written alongside the document.
  const changedTexts: Partial<Record<NewMOptionKind, string>> = {};
  for (const kind of OPTION_KINDS) if (kind in patch) changedTexts[kind] = patch[kind] as string;

  // A new PDF brings its own 40-character name (and with it a new address); a database that does
  // not have that column yet saves the rest.
  const save = async () => {
    const res = await db().from("new_m_records").update(patch).eq("id", id).select("*").single();
    if (!missingHashColumn(res.error) || !("doc_hash_name" in patch)) return res;
    delete patch.doc_hash_name;
    return db().from("new_m_records").update(patch).eq("id", id).select("*").single();
  };
  const [{ data, error }] = await Promise.all([
    save(),
    rememberOptions(user, changedTexts).catch((e) => console.error("[new-m] saving list values failed", e)),
  ]);
  if (error) {
    if (error.code === "23505") {
      throw new ApiError(
        409,
        /doc_number/.test(`${error.message} ${error.details ?? ""}`)
          ? "That document number is already used by another document"
          : "That attestation number is already used by another document",
      );
    }
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
    // Visitors get the new PDF from now on; the old one is kept for 15 days so the super admin can compare.
    if (doc) {
      await keepReplaced({
        system: "new_m",
        recordId: id,
        label: item.attestation_number,
        oldKey: existing.doc_r2_key,
        oldFilename: existing.doc_filename,
        oldSize: existing.doc_size,
        oldContentType: existing.doc_content_type,
        newKey: item.doc_r2_key,
        newFilename: item.doc_filename,
        by: user.id,
      });
    }
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
  return { item, pending: null };
}

/** What an edit changes, field by field, as the super admin reviews it. Technical columns (QR, link copy) are left out. */
function summarize(existing: NewMRecord, patch: Record<string, unknown>, link: { hostname: string; name: string } | null): PendingChange[] {
  const out: PendingChange[] = [];
  const was = existing as unknown as Record<string, unknown>;
  const add = (field: string, label: string, before: unknown, after: unknown) => {
    if (shown(before) !== shown(after)) out.push({ field, label, before: shown(before), after: shown(after) });
  };
  if ("domain_id" in patch) add("domain", "Domain", existing.domain_hostname, link?.hostname);
  if ("link_id" in patch) add("link", "Link", existing.link_name ?? "(removed link)", link ? link.name || "Untitled link" : "");
  if ("attestation_number" in patch) add("attestation_number", "Attestation number", existing.attestation_number, patch.attestation_number);
  if ("doc_number" in patch) add("doc_number", "Document number", existing.doc_number ?? "", patch.doc_number);
  if ("issue_date" in patch) add("issue_date", "Date", formatIssued(existing.issue_date), formatIssued(String(patch.issue_date)));
  for (const kind of OPTION_KINDS) if (kind in patch) add(kind, OPTION_LABELS[kind], was[kind], patch[kind]);
  if ("officer_name" in patch) add("officer", "Approving officer", existing.officer_name, patch.officer_name);
  if ("officer_designation" in patch) add("officer_designation", "Officer designation", existing.officer_designation, patch.officer_designation);
  if ("doc_r2_key" in patch) out.push({ field: "doc", label: "PDF", before: existing.doc_filename, after: shown(patch.doc_filename ?? "new PDF") });
  return out;
}
