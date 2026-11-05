import { after, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, intParam, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import {
  cleanText,
  dbError,
  docColumns,
  getNumberPrefix,
  linkFor,
  mapRecord,
  missingHashColumn,
  normalizeNumber,
  numberTaken,
  officerColumns,
  OPTION_KINDS,
  OPTION_LABELS,
  parseIssueDate,
  qrColumns,
  recordFromRow,
  rememberOptions,
  requireAppoAccess,
  searchDate,
  SEARCH_COLUMNS,
  uniqueNumber,
  withCurrentQr,
} from "@/lib/appo";
import { resolveLink } from "@/lib/appo-link";
import { db } from "@/lib/supabase";
import type { Paged } from "@/lib/types";
import type { AppoOptionKind, AppoRecord } from "@/lib/appo-types";

interface CreateBody {
  /** An Appo domain. */
  domain_id?: string;
  /** One of that domain's links. */
  link_id?: string;
  /** Blank means generate one. */
  attestation_number?: string;
  /** `YYYY-MM-DD`. Blank means today. */
  issue_date?: string;
  document_type?: string;
  signed_by?: string;
  signed_capacity?: string;
  seal_stamp?: string;
  office_city?: string;
  office_name?: string;
  /** A saved officer, copied onto the document. Blank or null means none. */
  officer_id?: string | null;
  doc_key?: string;
  doc_filename?: string;
  doc_content_type?: string;
}

/** GET /api/admin/appo?q=&domain_id=&limit=&offset= — newest first, searched across every domain. */
export async function GET(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requireAppoAccess(user);
    const sp = req.nextUrl.searchParams;
    const limit = intParam(sp.get("limit"), 25, 1, 200);
    const offset = intParam(sp.get("offset"), 0, 0, 1_000_000);
    const domainId = sp.get("domain_id");
    const q = (sp.get("q") ?? "").trim();

    let query = db().from("appo_view").select("*", { count: "exact" });
    if (domainId) query = query.eq("domain_id", domainId);
    if (q) {
      // , ( ) and quotes would break the or() filter; % _ * are wildcards there.
      const safe = q.replace(/[%_*,()"'\\]/g, " ").trim();
      const parts = safe ? SEARCH_COLUMNS.map((c) => `${c}.ilike.%${safe}%`) : [];
      const date = searchDate(q);
      if (date) parts.push(`issue_date.eq.${date}`);
      if (parts.length) query = query.or(parts.join(","));
    }

    const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw dbError(error);

    const items = await withCurrentQr((data ?? []).map((r) => mapRecord(r as never)));
    const paged: Paged<AppoRecord> = { items, total: count ?? items.length, limit, offset };
    return ok(paged);
  });
}

/**
 * Saves a new document. The database draws the PDF's 13-digit address number; should it ever match
 * another document's (next to impossible), it draws again.
 */
async function insertRecord(row: Record<string, unknown>) {
  for (let attempt = 1; ; attempt++) {
    const res = await db().from("appo_records").insert(row).select("*").single();
    if (missingHashColumn(res.error) && "doc_hash_name" in row) {
      const { doc_hash_name: _, ...rest } = row;
      row = rest;
      continue;
    }
    const clash = res.error?.code === "23505" && /storage_number/.test(`${res.error.message} ${res.error.details ?? ""}`);
    if (!clash || attempt >= 3) return res;
  }
}

/** POST /api/admin/appo — upload one document. The number and date are filled in when left blank. */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appo_create");
    const body = await readBody<CreateBody>(req);
    if (!body.domain_id) throw new ApiError(400, "Pick the domain the link should be built on");
    if (!body.doc_key) throw new ApiError(400, "Upload the PDF first");

    // Everything that needs no database is checked first, so a typing mistake costs no round trip.
    const typed = (body.attestation_number ?? "").trim();
    const issueDate = parseIssueDate(body.issue_date);
    const texts = Object.fromEntries(OPTION_KINDS.map((k) => [k, cleanText(body[k], OPTION_LABELS[k])])) as Record<AppoOptionKind, string>;

    // Then the lookups, side by side rather than one after another: the link with its domain, the
    // number (a new one always starts with the prefix the super admin set), the officer, and the PDF.
    const prefix = await getNumberPrefix();
    const typedNumber = typed ? normalizeNumber(typed, prefix) : null;
    const [link, number, officer, doc] = await Promise.all([
      linkFor(body.domain_id, body.link_id),
      typedNumber
        ? numberTaken(typedNumber).then((taken) => {
            if (taken) throw new ApiError(409, `${typedNumber} is already used by another document`);
            return typedNumber;
          })
        : uniqueNumber(prefix),
      officerColumns(body.officer_id || null),
      docColumns(body.doc_key, body.doc_filename, body.doc_content_type),
    ]);

    const row: Record<string, unknown> = {
      domain_id: body.domain_id,
      link_id: link.id,
      link_template: link.template,
      attestation_number: number,
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
      rememberOptions(user, texts).catch((e) => console.error("[appo] saving list values failed", e)),
    ]);
    if (error) {
      if (error.code === "23505") {
        throw new ApiError(
          409,
          /doc_r2_key/.test(`${error.message} ${error.details ?? ""}`)
            ? "This PDF is already attached to another document. Choose the file again."
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
        action: "create_appo",
        // activity_log.domain_id points at the Domains page's table, so Appo domains go by name only.
        domain: { id: null, hostname: link.hostname },
        file: { id: null, filename: item.doc_filename },
        details: { attestation_number: item.attestation_number, issue_date: item.issue_date, verify_url: item.verify_url },
      }),
    );
    return ok({ item }, { status: 201 });
  });
}
