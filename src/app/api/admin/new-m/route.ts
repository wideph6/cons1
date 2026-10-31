import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, intParam, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import {
  cleanText,
  dbError,
  docColumns,
  getMDomain,
  getRecord,
  linkFor,
  mapRecord,
  normalizeNumber,
  numberTaken,
  officerColumns,
  parseIssueDate,
  qrColumns,
  rememberOptions,
  requireNewMAccess,
  searchDate,
  SEARCH_COLUMNS,
  uniqueNumber,
  withCurrentQr,
} from "@/lib/new-m";
import { resolveLink } from "@/lib/new-m-link";
import { db } from "@/lib/supabase";
import type { NewMRecord, Paged } from "@/lib/types";

interface CreateBody {
  /** A New M domain. */
  domain_id?: string;
  /** One of that domain's links. */
  link_id?: string;
  /** Blank means generate one. */
  attestation_number?: string;
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

    let query = db().from("new_m_view").select("*", { count: "exact" });
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
    const paged: Paged<NewMRecord> = { items, total: count ?? items.length, limit, offset };
    return ok(paged);
  });
}

/** POST /api/admin/new-m — upload one document. The number and date are filled in when left blank. */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "new_m_create");
    const body = await readBody<CreateBody>(req);
    if (!body.domain_id) throw new ApiError(400, "Pick the domain the link should be built on");
    if (!body.doc_key) throw new ApiError(400, "Upload the PDF first");

    const domain = await getMDomain(body.domain_id);
    const link = await linkFor(domain.id, body.link_id);

    const typed = (body.attestation_number ?? "").trim();
    const number = typed ? normalizeNumber(typed) : await uniqueNumber();
    if (typed && (await numberTaken(number))) throw new ApiError(409, `${number} is already used by another document`);

    const texts = {
      document_type: cleanText(body.document_type, "Document type"),
      issuing_office: cleanText(body.issuing_office, "Issuing office"),
      issuing_authority: cleanText(body.issuing_authority, "Issuing authority"),
    };

    const issueDate = parseIssueDate(body.issue_date);
    const row: Record<string, unknown> = {
      domain_id: domain.id,
      link_id: link.id,
      link_template: link.template,
      attestation_number: number,
      issue_date: issueDate,
      ...texts,
      ...(await officerColumns(body.officer_id || null)),
      ...(await docColumns(body.doc_key, body.doc_filename, body.doc_content_type)),
      // The QR code of the complete link — domain, link, number and date — is saved with the document.
      ...qrColumns(resolveLink(domain.hostname, link.template, number, issueDate)),
      created_by: user.id,
    };

    await rememberOptions(user, texts);

    const { data, error } = await db().from("new_m_records").insert(row).select("id").single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `${number} is already used by another document`);
      throw dbError(error);
    }

    const item = await getRecord(data.id as string);
    await logActivity({
      user_id: user.id,
      action: "create_new_m",
      // activity_log.domain_id points at the Domains page's table, so New M domains go by name only.
      domain: { id: null, hostname: domain.hostname },
      file: { id: null, filename: item.doc_filename },
      details: { attestation_number: item.attestation_number, issue_date: item.issue_date, verify_url: item.verify_url },
    });
    return ok({ item }, { status: 201 });
  });
}
