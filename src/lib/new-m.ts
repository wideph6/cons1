import { issuedToIso, pad2, parseIssuedOn, todayIso } from "./dates";
import { ApiError } from "./errors";
import { buildVerifyUrl, NUMBER_EXAMPLE, NUMBER_RE, randomNumber, tidyNumber, verifyQrSvg } from "./new-m-link";
import { can } from "./permissions";
import { deleteObject, getObjectBytes, headObject, isNewMKey } from "./r2";
import { db } from "./supabase";
import type { NewMLists, NewMOfficer, NewMOption, NewMOptionKind, NewMRecord, User } from "./types";
import { cleanFilename, fileExtension, guessContentType } from "./utils";

export async function getDomain(domainId: string): Promise<{ id: string; hostname: string }> {
  const { data, error } = await db().from("domains").select("id,hostname").eq("id", domainId).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "Domain not found");
  return data as { id: string; hostname: string };
}

/* ---------------- Access ---------------- */

/** Any New M permission opens the tab: listing documents and reading their PDFs. */
export function requireNewMAccess(user: User): void {
  if (
    can(user, "new_m_create") ||
    can(user, "new_m_edit") ||
    can(user, "new_m_delete") ||
    can(user, "new_m_settings")
  ) {
    return;
  }
  throw new ApiError(403, "You don't have access to New M");
}

/**
 * Uploading only puts bytes at a random key that nothing points at yet; the route that attaches the
 * key re-checks the exact permission. So anyone who may add or edit a document may upload, and a key
 * that is never attached is swept up by the storage cleanup.
 */
export function requireNewMWrite(user: User): void {
  if (can(user, "new_m_create") || can(user, "new_m_edit")) return;
  throw new ApiError(403, "You don't have permission to upload New M files");
}

/* ---------------- Setup ---------------- */

/** Shown when New M's tables are not in the database yet. */
export const NEW_M_MISSING =
  "New M's tables are not in the database yet. Run supabase/new-m.sql in Supabase → SQL Editor, then reload this page.";

/** True when a query failed because its table does not exist, i.e. a setup SQL file has not been run yet. */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/** A query error as an ApiError, pointing at the setup step when New M's tables are missing. */
export function dbError(error: { code?: string; message: string }): ApiError {
  return new ApiError(500, isMissingTable(error) ? NEW_M_MISSING : error.message);
}

/* ---------------- Numbers ---------------- */

export function normalizeNumber(input: unknown): string {
  const n = tidyNumber(String(input ?? ""));
  if (!NUMBER_RE.test(n)) {
    throw new ApiError(
      400,
      `Attestation number must look like ${NUMBER_EXAMPLE}: GEN, then three groups of four capital English letters`,
    );
  }
  return n;
}

/** Numbers are unique across every domain. */
export async function numberTaken(number: string, exceptId?: string): Promise<boolean> {
  let q = db().from("new_m_records").select("id").eq("attestation_number", number);
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q.limit(1);
  if (error) throw dbError(error);
  return (data?.length ?? 0) > 0;
}

/** Tries fresh numbers until one is free, so a collision costs a retry instead of an error. */
export async function uniqueNumber(attempts = 8): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const candidate = randomNumber();
    if (!(await numberTaken(candidate))) return candidate;
  }
  throw new ApiError(500, "Could not generate a free attestation number. Please try again.");
}

/* ---------------- Dates ---------------- */

/** The issue date as the form sends it, `YYYY-MM-DD`. Blank means today. */
export function parseIssueDate(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  return issuedToIso(parseIssuedOn(raw || todayIso()));
}

/**
 * A date typed into the search box, in any of the ways people write one: 31102026 (as in the link),
 * 31-10-2026, 31/10/26, 2026-10-31. Null when the text is not a real date.
 */
export function searchDate(q: string): string | null {
  const t = q.trim();
  let day: number;
  let month: number;
  let year: number;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t))) {
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[3].length === 2) year += 2000;
  } else if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(t))) {
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    return null;
  }
  try {
    return issuedToIso(parseIssuedOn(`${year}-${pad2(month)}-${pad2(day)}`));
  } catch {
    return null;
  }
}

/* ---------------- Text fields and saved values ---------------- */

export const OPTION_KINDS: NewMOptionKind[] = ["document_type", "issuing_office", "issuing_authority"];

export const OPTION_LABELS: Record<NewMOptionKind, string> = {
  document_type: "Document type",
  issuing_office: "Issuing office",
  issuing_authority: "Issuing authority",
};

const MAX_TEXT = 200;

export function cleanText(input: unknown, label: string): string {
  const s = String(input ?? "").replace(/\s+/g, " ").trim();
  if (s.length > MAX_TEXT) throw new ApiError(400, `${label} is too long (max ${MAX_TEXT} characters)`);
  return s;
}

/** Adds each value to its saved list, so every later upload can pick it. A value already saved is left alone. */
export async function rememberOptions(user: User, values: Partial<Record<NewMOptionKind, string>>): Promise<void> {
  for (const kind of OPTION_KINDS) {
    const value = values[kind];
    if (!value) continue;
    const { error } = await db().from("new_m_options").insert({ kind, value, created_by: user.id });
    // 23505: already saved, in whatever letter case.
    if (error && error.code !== "23505") throw dbError(error);
  }
}

/* ---------------- Officers ---------------- */

interface OfficerRow {
  id: string;
  name: string;
  designation: string;
  signature_r2_key: string | null;
  signature_content_type: string | null;
}

const OFFICER_COLUMNS = "id,name,designation,signature_r2_key,signature_content_type";

/** The signature inline as a data: URI. An <img> pointing at storage would taint a canvas the sticker is drawn on. */
export async function signatureDataUri(key: string | null): Promise<string | null> {
  if (!key) return null;
  const obj = await getObjectBytes(key);
  return obj ? `data:${obj.contentType};base64,${Buffer.from(obj.bytes).toString("base64")}` : null;
}

export async function withSignature(row: OfficerRow): Promise<NewMOfficer> {
  return { ...row, signature_data_uri: await signatureDataUri(row.signature_r2_key) };
}

export async function getOfficer(id: string): Promise<OfficerRow> {
  const { data, error } = await db().from("new_m_officers").select(OFFICER_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, "That approving officer is no longer in the saved list");
  return data as OfficerRow;
}

/** What a document copies from the officer it is given. Null takes the officer off the document. */
export async function officerColumns(officerId: string | null): Promise<Record<string, unknown>> {
  if (!officerId) {
    return {
      officer_id: null,
      officer_name: "",
      officer_designation: "",
      officer_signature_r2_key: null,
      officer_signature_content_type: null,
    };
  }
  const o = await getOfficer(officerId);
  return {
    officer_id: o.id,
    officer_name: o.name,
    officer_designation: o.designation,
    officer_signature_r2_key: o.signature_r2_key,
    officer_signature_content_type: o.signature_content_type,
  };
}

/**
 * Deletes a signature image once nothing shows it any more: no saved officer and no document. When
 * either lookup fails the image is kept, and the storage cleanup can take it later.
 */
export async function releaseSignature(key: string | null | undefined): Promise<void> {
  if (!key) return;
  const [officers, records] = await Promise.all([
    db().from("new_m_officers").select("id").eq("signature_r2_key", key).limit(1),
    db().from("new_m_records").select("id").eq("officer_signature_r2_key", key).limit(1),
  ]);
  if (officers.error || records.error) return;
  if ((officers.data?.length ?? 0) > 0 || (records.data?.length ?? 0) > 0) return;
  await deleteObject(key);
}

/* ---------------- Saved lists ---------------- */

export async function getLists(): Promise<NewMLists> {
  const [opts, offs] = await Promise.all([
    db().from("new_m_options").select("id,kind,value").order("value"),
    db().from("new_m_officers").select(OFFICER_COLUMNS).order("name"),
  ]);
  if (opts.error) throw dbError(opts.error);
  if (offs.error) throw dbError(offs.error);

  const options: NewMLists["options"] = { document_type: [], issuing_office: [], issuing_authority: [] };
  for (const o of (opts.data ?? []) as NewMOption[]) options[o.kind]?.push(o);
  const officers = await Promise.all(((offs.data ?? []) as OfficerRow[]).map(withSignature));
  return { options, officers };
}

/* ---------------- Documents ---------------- */

/** Checks an uploaded PDF really is in storage and returns the columns that point a document at it. */
export async function docColumns(key: unknown, filenameHint: unknown, contentTypeHint: unknown): Promise<Record<string, unknown>> {
  if (!isNewMKey(key, "docs")) throw new ApiError(400, "Invalid document storage key");
  const head = await headObject(key);
  if (!head) throw new ApiError(400, "The uploaded PDF was not found in storage. Please upload again.");
  const filename = cleanFilename(filenameHint ?? key.split("/").pop());
  if (fileExtension(filename) !== "pdf") throw new ApiError(400, "Only PDF files can be uploaded to New M");
  return {
    doc_r2_key: key,
    doc_filename: filename,
    doc_size: head.size,
    doc_content_type: guessContentType(filename, typeof contentTypeHint === "string" ? contentTypeHint : head.contentType),
  };
}

type RawRecord = Omit<NewMRecord, "verify_url">;

export function mapRecord(row: RawRecord): NewMRecord {
  return {
    ...row,
    doc_size: Number(row.doc_size ?? 0),
    verify_url: buildVerifyUrl(row.domain_hostname, row.attestation_number, row.issue_date),
  };
}

export async function getRecord(id: string): Promise<NewMRecord> {
  const { data, error } = await db().from("new_m_view").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, "Document not found");
  return mapRecord(data as unknown as RawRecord);
}

/* ---------------- QR code ---------------- */

/** The QR columns for a link: the code itself, the link it encodes, and when it was drawn. */
export function qrColumns(url: string): { qr_url: string; qr_svg: string; qr_updated_at: string } {
  return { qr_url: url, qr_svg: verifyQrSvg(url), qr_updated_at: new Date().toISOString() };
}

/**
 * Makes sure each document's saved QR code is the one for its link as it reads now, redrawing and
 * saving any that is missing or stale. Saves and edits store the code themselves; this catches the
 * rest, such as a domain renamed under Domains, which changes the link of every document on it.
 */
export async function withCurrentQr(records: NewMRecord[]): Promise<NewMRecord[]> {
  return Promise.all(
    records.map(async (r) => {
      if (r.qr_svg && r.qr_url === r.verify_url) return r;
      const qr = qrColumns(r.verify_url);
      const { error } = await db().from("new_m_records").update(qr).eq("id", r.id);
      if (error) throw dbError(error);
      return { ...r, ...qr };
    }),
  );
}

/** Columns the common search box looks through, on every domain at once. */
export const SEARCH_COLUMNS = [
  "attestation_number",
  "document_type",
  "issuing_office",
  "issuing_authority",
  "officer_name",
  "officer_designation",
  "doc_filename",
  "domain_hostname",
];
