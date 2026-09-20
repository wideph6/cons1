import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ApiError, intParam, ok, readBody, requirePermission, requireUser, run } from "@/lib/api";
import {
  buildRecordFields,
  getDomain,
  getRecord,
  mapRecord,
  normalizeNumber,
  numberTaken,
  parseIssuedOn,
  pickSignature,
  issuedToIso,
  getSettings,
  todayIso,
  uniqueNumber,
} from "@/lib/appostta";
import { headObject, isApposttaKey } from "@/lib/r2";
import { db } from "@/lib/supabase";
import type { ApposttaRecord, Paged } from "@/lib/types";
import { cleanFilename, guessContentType } from "@/lib/utils";

interface CreateBody {
  domain_id?: string;
  number?: string;
  issued_on?: string;
  /** One value per row defined in settings: `[{ id, value }]`. Labels are never sent by the client. */
  field_values?: unknown;
  /** Which of the signatures in settings to issue under. Omitted means the default one. */
  signature_id?: string;
  notes?: string;
  doc_key?: string;
  doc_filename?: string;
  doc_content_type?: string;
}

/** GET /api/admin/appostta?domain_id=&q=&limit=&offset= */
export async function GET(req: NextRequest) {
  return run(async () => {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const limit = intParam(sp.get("limit"), 50, 1, 200);
    const offset = intParam(sp.get("offset"), 0, 0, 1_000_000);
    const domainId = sp.get("domain_id");
    const q = (sp.get("q") ?? "").trim();

    let query = db().from("appostta_view").select("*", { count: "exact" });
    if (domainId) query = query.eq("domain_id", domainId);
    if (q) {
      const safe = q.replace(/[%_,()]/g, " ").trim();
      if (safe) query = query.or(`number.ilike.%${safe}%,doc_filename.ilike.%${safe}%,notes.ilike.%${safe}%`);
    }

    const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new ApiError(500, error.message);

    const items = (data ?? []).map((r) => mapRecord(r as never));
    const paged: Paged<ApposttaRecord> = { items, total: count ?? items.length, limit, offset };
    return ok(paged);
  });
}

/**
 * POST /api/admin/appostta — create a record and, when a document was already uploaded, attach it.
 * The number and date are generated when they are not supplied; both stay editable afterwards.
 */
export async function POST(req: NextRequest) {
  return run(async () => {
    const user = await requireUser();
    requirePermission(user, "appostta_create");
    const body = await readBody<CreateBody>(req);
    if (!body.domain_id) throw new ApiError(400, "Pick the domain the link should be built on");

    const domain = await getDomain(body.domain_id);
    const settings = await getSettings();

    const number = body.number ? normalizeNumber(body.number) : await uniqueNumber(settings.number_prefix);
    if (body.number && (await numberTaken(number))) throw new ApiError(409, `${number} is already used by another record`);

    const issuedOn = issuedToIso(parseIssuedOn(body.issued_on ?? todayIso()));

    // The rows come from the definitions in settings as they read right now, and are frozen onto the
    // record. Editing those definitions later changes what the next record starts with, never this one.
    const fields = buildRecordFields(settings.field_defs, body.field_values);

    // Same idea for the signature: the record keeps a copy, so it survives the settings entry being
    // renamed or removed.
    const signature = pickSignature(settings, body.signature_id);
    if (body.signature_id && !signature) throw new ApiError(400, "That signature is not in the Appostta settings");

    const row: Record<string, unknown> = {
      domain_id: domain.id,
      number,
      issued_on: issuedOn,
      fields,
      signature_id: signature?.id ?? "",
      signatory_name: signature?.name ?? "",
      signature_r2_key: signature?.r2_key ?? null,
      signature_content_type: signature?.content_type ?? null,
      notes: (body.notes ?? "").trim(),
      created_by: user.id,
    };

    if (body.doc_key) {
      if (!isApposttaKey(body.doc_key, "docs")) throw new ApiError(400, "Invalid document storage key");
      const head = await headObject(body.doc_key);
      if (!head) throw new ApiError(400, "The uploaded document was not found in storage. Please upload again.");
      const filename = cleanFilename(body.doc_filename ?? body.doc_key.split("/").pop());
      row.doc_r2_key = body.doc_key;
      row.doc_filename = filename;
      row.doc_size = head.size;
      row.doc_content_type = guessContentType(filename, body.doc_content_type ?? head.contentType);
      row.doc_uploaded_at = new Date().toISOString();
    }

    const { data, error } = await db().from("appostta_records").insert(row).select("id").single();
    if (error) {
      if (error.code === "23505") throw new ApiError(409, `${number} is already used by another record`);
      throw new ApiError(500, error.message);
    }

    const item = await getRecord(data.id as string);
    await logActivity({
      user_id: user.id,
      action: "create_appostta",
      domain: { id: domain.id, hostname: domain.hostname },
      file: { id: null, filename: item.doc_filename },
      details: { number: item.number, issued_on: item.issued_on, verify_url: item.verify_url },
    });
    return ok({ item }, { status: 201 });
  });
}
