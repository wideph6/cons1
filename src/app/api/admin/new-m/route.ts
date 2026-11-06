import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, intParam, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import {
  cleanText,
  dbError,
  docColumns,
  linkFor,
  mapRecord,
  missingHashColumn,
  docNumberTaken,
  missingDocNumberColumn,
  normalizeDocNumber,
  normalizeNumber,
  numberTaken,
  officerColumns,
  parseIssueDate,
  qrColumns,
  recordFromRow,
  rememberOptions,
  requireNewMAccess,
  searchDate,
  SEARCH_COLUMNS,
  uniqueNumber,
  withCurrentQr,
} from "@/lib/new-m";
import { resolveLink } from "@/lib/new-m-link";
import { db } from "@/lib/supabase";
import { previousCounts, sweepReplaced } from "@/lib/file-history";
import { pendingFor } from "@/lib/pending-edits";
import type { NewMRecord, Paged } from "@/lib/types";

interface CreateBody {
  /** A New M domain. */
  domain_id?: string;
  /** One of that domain's links. */
  link_id?: string;
  /** Blank means generate one. */
  attestation_number?: string;
  /** 7 digits. Blank means the database draws one. */
  doc_number?: string;
  /** `YYYY-MM-DD`. Blank means today. */
  issue_date?: string;
  document_type?: string;
  issuing_office?: string;
  issuing_authority?: string;
  /** A saved officer, copied onto the document. Blank or null means none. */
  officer_id?: string | null;
  doc_key?: string;
  doc_filename?: string;
  doc_content_type?: string;
}

/** GET /api/admin/new-m?q=&domain_id=&limit=&offset= — newest first, searched across every domain. */
export async function GET(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireNewMAccess(user);
    const sp = req.nextUrl.searchParams;
    const limit = intParam(sp.get("limit"), 25, 1, 200);
    const offset = intParam(sp.get("offset"), 0, 0, 1_000_000);
    const domainId = sp.get("domain_id");
    const q = (sp.get("q") ?? "").trim();

    const list = (columns: readonly string[]) => {
      let query = db().from("new_m_view").select("*", { count: "exact" });
      if (domainId) query = query.eq("domain_id", domainId);
      if (q) {
        // , ( ) and quotes would break the or() filter; % _ * are wildcards there.
        const safe = q.replace(/[%_*,()"'\\]/g, " ").trim();
        const parts = safe ? columns.map((c) => `${c}.ilike.%${safe}%`) : [];
        const date = searchDate(q);
        if (date) parts.push(`issue_date.eq.${date}`);
        if (parts.length) query = query.or(parts.join(","));
      }
      return query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    };
    // The 7-digit document number is searched too; a database without it yet (supabase/doc-number.sql
    // not run) is searched without it.
    let res = await list(SEARCH_COLUMNS);
    if (res.error && missingDocNumberColumn(res.error)) res = await list(SEARCH_COLUMNS.filter((c) => c !== "doc_number"));
    const { data, error, count } = res;
    if (error) throw dbError(error);

    const listed = await withCurrentQr((data ?? []).map((r) => mapRecord(r as never)));
    // For the super admin: earlier PDFs still kept to compare, and changes waiting for approval.
    const ids = listed.map((r) => r.id);
    const [previous, pending] = await Promise.all([previousCounts("new_m", ids), pendingFor("new_m_pending_edits", ids)]);
    const items = listed.map((r) => ({ ...r, previous_files: previous.get(r.id) ?? 0, pending_edit: pending.get(r.id) ?? null }));
    // Kept files whose 15 days are up are deleted from R2 (at most once an hour).
    after(() => sweepReplaced());
    const paged: Paged<NewMRecord> = { items, total: count ?? items.length, limit, offset };
    return ok(paged);
  });
}

/**
 * Saves a new document. The database draws the PDF's 13-digit address number; should it ever match
 * another document's (next to impossible), it draws again.
 */
async function insertRecord(row: Record<string, unknown>) {
  for (let attempt = 1; ; attempt++) {
    const res = await db().from("new_m_records").insert(row).select("*").single();
    if (missingHashColumn(res.error) && "doc_hash_name" in row) {
      const { doc_hash_name: _, ...rest } = row;
      row = rest;
      continue;
    }
    // A database without document numbers yet saves the document without one.
    if (missingDocNumberColumn(res.error) && "doc_number" in row) {
      const { doc_number: _, ...rest } = row;
      row = rest;
      continue;
    }
    // The database draws the PDF's address number, and the 7-digit document number when none was typed;
    // a draw that matches another document's is made again.
    const where = `${res.error?.message ?? ""} ${res.error?.details ?? ""}`;
    const clash =
      res.error?.code === "23505" && (/storage_number/.test(where) || (/doc_number/.test(where) && !("doc_number" in row)));
    if (!clash || attempt >= 5) return res;
  }
}

/** POST /api/admin/new-m — upload one document. The number and date are filled in when left blank. */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_create");
    const body = await readBody<CreateBody>(req);
    if (!body.domain_id) throw new ApiError(400, "Pick the domain the link should be built on");
    if (!body.doc_key) throw new ApiError(400, "Upload the PDF first");

    // Everything that needs no database is checked first, so a typing mistake costs no round trip.
    const typed = (body.attestation_number ?? "").trim();
    const typedDocNumber = (body.doc_number ?? "").trim() ? normalizeDocNumber(body.doc_number) : null;
    const typedNumber = typed ? normalizeNumber(typed) : null;
    const issueDate = parseIssueDate(body.issue_date);
    const texts = {
      document_type: cleanText(body.document_type, "Document type"),
      issuing_office: cleanText(body.issuing_office, "Issuing office"),
      issuing_authority: cleanText(body.issuing_authority, "Issuing authority"),
    };

    // Then the lookups, side by side rather than one after another: the link with its domain, the
    // number, the officer, and the PDF in storage.
    const [link, number, officer, doc] = await Promise.all([
      linkFor(body.domain_id, body.link_id),
      typedNumber
        ? numberTaken(typedNumber).then((taken) => {
            if (taken) throw new ApiError(409, `${typedNumber} is already used by another document`);
            return typedNumber;
          })
        : uniqueNumber(),
      officerColumns(body.officer_id || null),
      docColumns(body.doc_key, body.doc_filename, body.doc_content_type),
      typedDocNumber
        ? docNumberTaken(typedDocNumber).then((taken) => {
            if (taken) throw new ApiError(409, `Document number ${typedDocNumber} is already used by another document`);
          })
        : null,
    ]);

    const row: Record<string, unknown> = {
      domain_id: body.domain_id,
      link_id: link.id,
      link_template: link.template,
      attestation_number: number,
      // Left out, the database draws a random one.
      ...(typedDocNumber ? { doc_number: typedDocNumber } : {}),
      issue_date: issueDate,
      ...texts,
      ...officer,
      ...doc,
      // The QR code of the complete link — domain, link, number and date — is saved with the document.
      ...qrColumns(resolveLink(link.hostname, link.template, number, issueDate)),
      created_by: user.id,
    };

    // The document and any new saved values are written together. A saved value that fails to save
    // must not fail a document that did, so that error is only logged.
    const [{ data, error }] = await Promise.all([
      insertRecord(row),
      rememberOptions(user, texts).catch((e) => console.error("[new-m] saving list values failed", e)),
    ]);
    if (error) {
      if (error.code === "23505") {
        throw new ApiError(
          409,
          /doc_r2_key/.test(`${error.message} ${error.details ?? ""}`)
            ? "This PDF is already attached to another document. Choose the file again."
            : /doc_number/.test(`${error.message} ${error.details ?? ""}`)
              ? `Document number ${typedDocNumber ?? ""} is already used by another document`.replace("  ", " ")
              : `${number} is already used by another document`,
        );
      }
      throw dbError(error);
    }

    const item = recordFromRow(data, {
      domain_hostname: link.hostname,
      link_name: link.name,
      link_current_template: link.template,
      uploader_name: user.name,
      uploader_email: user.email,
    });

    // Written once the reply is on its way, so the log never holds up the save.
    after(() =>
      logActivity({
        user_id: user.id,
        action: "create_new_m",
        // activity_log.domain_id points at the Domains page's table, so New M domains go by name only.
        domain: { id: null, hostname: link.hostname },
        file: { id: null, filename: item.doc_filename },
        details: { attestation_number: item.attestation_number, doc_number: item.doc_number ?? null, issue_date: item.issue_date, verify_url: item.verify_url },
      }),
    );
    return ok({ item }, { status: 201 });
  });
}
