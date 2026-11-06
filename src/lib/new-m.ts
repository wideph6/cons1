import { issuedToIso, pad2, parseIssuedOn, todayIso } from "./dates";
import { ApiError } from "./errors";
import {
  cleanTemplate,
  DOC_NUMBER_EXAMPLE,
  DOC_NUMBER_RE,
  tidyDocNumber,
  hashNameFromKey,
  NUMBER_EXAMPLE,
  NUMBER_RE,
  randomNumber,
  resolveLink,
  tidyNumber,
  verifyQrSvg,
} from "./new-m-link";
import { cleanPlacement, type BackgroundPlacement } from "./new-m-sticker";
import { can } from "./permissions";
import { deleteObject, getObjectBytes, headObject, isNewMKey, presignDownload } from "./r2";
import { db } from "./supabase";
import type { NewMLists, NewMOfficer, NewMOption, NewMOptionKind, NewMRecord, User } from "./types";
import { cleanFilename, fileExtension, guessContentType } from "./utils";

/* ---------------- Access ---------------- */

/** Any New M permission opens the tab: listing documents and reading their PDFs. */
export function requireNewMAccess(user: User): void {
  if (
    can(user, "new_m_create") ||
    can(user, "new_m_edit") ||
    can(user, "new_m_delete") ||
    can(user, "new_m_settings") ||
    can(user, "new_m_domains")
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

/** A query error as an ApiError, pointing at the setup step when New M's tables or columns are missing. */
export function dbError(error: { code?: string; message: string }): ApiError {
  if (isMissingTable(error)) return new ApiError(500, NEW_M_MISSING);
  if (missingDocNumberColumn(error)) return new ApiError(500, DOC_NUMBER_MISSING);
  // 42703: a column added by a newer new-m.sql than the database has seen.
  if (error.code === "42703") {
    return new ApiError(500, "The database needs the latest New M update. Run supabase/new-m.sql in Supabase → SQL Editor again, then retry.");
  }
  return new ApiError(500, error.message);
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

/* ---------------- Document numbers ---------------- */

const DOC_NUMBER_MISSING =
  "The database has no document numbers yet. Run supabase/doc-number.sql in Supabase → SQL Editor, then retry.";

/**
 * True when a query failed only because the database has no doc_number yet (supabase/doc-number.sql has
 * not run). A new document is then saved without one, and the list is searched without it.
 */
export function missingDocNumberColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && (error.code === "PGRST204" || error.code === "42703") && error.message?.includes("doc_number"));
}

/** A typed document number: spaces and dashes dropped, then exactly 7 digits. */
export function normalizeDocNumber(input: unknown): string {
  const n = tidyDocNumber(String(input ?? ""));
  if (!DOC_NUMBER_RE.test(n)) throw new ApiError(400, `Document number must be 7 digits, e.g. ${DOC_NUMBER_EXAMPLE}`);
  return n;
}

/** Document numbers are unique across every domain. */
export async function docNumberTaken(number: string, exceptId?: string): Promise<boolean> {
  let q = db().from("new_m_records").select("id").eq("doc_number", number);
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q.limit(1);
  if (error) throw dbError(error);
  return (data?.length ?? 0) > 0;
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

/**
 * Adds each value to its saved list, so every later upload can pick it. A value already saved is left
 * alone. The lists are written side by side rather than one after another.
 */
export async function rememberOptions(user: User, values: Partial<Record<NewMOptionKind, string>>): Promise<void> {
  const results = await Promise.all(
    OPTION_KINDS.filter((kind) => values[kind]).map((kind) =>
      db().from("new_m_options").insert({ kind, value: values[kind], created_by: user.id }),
    ),
  );
  for (const { error } of results) {
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

/**
 * An officer with a short-lived link to their signature, for showing it in the panel. Signing the link
 * happens locally, so listing officers never downloads their images; the sticker, which needs the
 * bytes, reads them through signatureDataUri instead.
 */
export async function withSignature(row: OfficerRow): Promise<NewMOfficer> {
  const url = row.signature_r2_key
    ? await presignDownload(
        row.signature_r2_key,
        row.signature_r2_key.split("/").pop() ?? "signature",
        "inline",
        row.signature_content_type ?? "image/png",
        3600,
      )
    : null;
  return { ...row, signature_url: url };
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

/* ---------------- Sticker background ---------------- */

export interface BackgroundSettings {
  background_r2_key: string | null;
  background_content_type: string | null;
  background_filename: string | null;
  /** The background already has the title bar, lines and labels printed on it. */
  background_has_frame: boolean;
  /** Where the super admin placed the image on the sticker; null stretches it over the whole sticker. */
  background_placement: BackgroundPlacement | null;
  updated_at: string | null;
}

const NO_BACKGROUND: BackgroundSettings = {
  background_r2_key: null,
  background_content_type: null,
  background_filename: null,
  background_has_frame: false,
  background_placement: null,
  updated_at: null,
};

const BACKGROUND_COLUMNS = "background_r2_key,background_content_type,background_filename,updated_at";
/** Columns later new-m.sql runs added, newest first. A database that lacks one is read without it. */
const LATER_BACKGROUND_COLUMNS = ["background_placement", "background_has_frame"];

/** The background the super admin uploaded, or nothing when none has been (also before new-m.sql has run). */
export async function getBackgroundSettings(): Promise<BackgroundSettings> {
  for (let skip = 0; ; skip++) {
    const columns = [BACKGROUND_COLUMNS, ...LATER_BACKGROUND_COLUMNS.slice(skip)].join(",");
    const res = await db().from("new_m_settings").select(columns).eq("id", true).maybeSingle();
    // 42703: a column arrives with a later new-m.sql; until then it reads as unset.
    if (res.error?.code === "42703" && skip < LATER_BACKGROUND_COLUMNS.length) continue;
    if (res.error) {
      if (isMissingTable(res.error)) return NO_BACKGROUND;
      throw dbError(res.error);
    }
    const row = res.data as Partial<Record<keyof BackgroundSettings, unknown>> | null;
    if (!row) return NO_BACKGROUND;
    return {
      ...NO_BACKGROUND,
      ...(row as Partial<BackgroundSettings>),
      background_has_frame: Boolean(row.background_has_frame),
      background_placement: cleanPlacement(row.background_placement),
    };
  }
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

/**
 * Checks an uploaded PDF really is in storage and returns the columns that point a document at it. A
 * PDF is stored under a fresh 40-character name, which becomes the document's doc_hash_name (its name
 * on the page and in its address); the uploaded name is kept as doc_filename for the admin panel.
 */
export async function docColumns(key: unknown, filenameHint: unknown, contentTypeHint: unknown): Promise<Record<string, unknown>> {
  if (!isNewMKey(key, "docs")) throw new ApiError(400, "Invalid document storage key");
  const head = await headObject(key);
  if (!head) throw new ApiError(400, "The uploaded PDF was not found in storage. Please upload again.");
  const filename = cleanFilename(filenameHint ?? key.split("/").pop());
  if (fileExtension(filename) !== "pdf") throw new ApiError(400, "Only PDF files can be uploaded to New M");
  const hashName = hashNameFromKey(key);
  return {
    doc_r2_key: key,
    doc_filename: filename,
    doc_size: head.size,
    doc_content_type: guessContentType(filename, typeof contentTypeHint === "string" ? contentTypeHint : head.contentType),
    ...(hashName ? { doc_hash_name: hashName } : {}),
  };
}

/**
 * True when a write failed only because the database has no doc_hash_name yet (the new-m.sql that
 * adds it has not run); the document is then saved without it.
 */
export function missingHashColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST204" || error.code === "42703") && error.message?.includes("doc_hash_name"));
}

type RawRecord = Omit<NewMRecord, "verify_url">;

/** The link a document is built on: its domain link as it reads now, or the saved copy once that link is gone. */
function templateOf(row: Pick<NewMRecord, "link_current_template" | "link_template">): string {
  return row.link_current_template ?? row.link_template;
}

export function mapRecord(row: RawRecord): NewMRecord {
  return {
    ...row,
    doc_size: Number(row.doc_size ?? 0),
    verify_url: resolveLink(row.domain_hostname, templateOf(row), row.attestation_number, row.issue_date),
  };
}

/* ---------------- Domains and links ---------------- */

export interface MDomainRow {
  id: string;
  hostname: string;
  notes: string;
  created_at: string;
}

export interface MLinkRow {
  id: string;
  domain_id: string;
  name: string;
  template: string;
  created_at: string;
  updated_at: string;
}

export async function getMDomain(id: string): Promise<MDomainRow> {
  const { data, error } = await db().from("new_m_domains").select("id,hostname,notes,created_at").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, "That New M domain was not found");
  return data as MDomainRow;
}

export async function getMLink(id: string): Promise<MLinkRow> {
  const { data, error } = await db()
    .from("new_m_link_templates")
    .select("id,domain_id,name,template,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, "That link was not found");
  return data as MLinkRow;
}

/** A link typed in settings, checked and tidied, with the reason as a 400 when it is not usable. */
export function checkTemplate(input: unknown, hostname: string): string {
  try {
    return cleanTemplate(String(input ?? ""), hostname);
  } catch (e) {
    throw new ApiError(400, e instanceof Error ? e.message : "That link is not valid");
  }
}

export interface LinkWithHost extends MLinkRow {
  hostname: string;
}

/** A link together with its domain's hostname, in one query. */
export async function getLinkWithHost(linkId: unknown): Promise<LinkWithHost> {
  if (typeof linkId !== "string" || !linkId) throw new ApiError(400, "Pick the link the document should use");
  const { data, error } = await db()
    .from("new_m_link_templates")
    .select("id,domain_id,name,template,created_at,updated_at,new_m_domains(hostname)")
    .eq("id", linkId)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, "That link was not found");
  const { new_m_domains: domain, ...link } = data as unknown as MLinkRow & {
    new_m_domains: { hostname: string } | null;
  };
  if (!domain) throw new ApiError(404, "That link's domain was not found");
  return { ...link, hostname: domain.hostname };
}

/** Throws unless the link is one of the domain's own. */
export function checkLinkDomain(link: LinkWithHost, domainId: string): LinkWithHost {
  if (link.domain_id !== domainId) throw new ApiError(400, "That link belongs to another domain");
  return link;
}

/** The link a document asks for, with its domain's hostname, checked to belong to the document's domain. */
export async function linkFor(domainId: string, linkId: unknown): Promise<LinkWithHost> {
  return checkLinkDomain(await getLinkWithHost(linkId), domainId);
}

export async function getRecord(id: string): Promise<NewMRecord> {
  const { data, error } = await db().from("new_m_view").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, "Document not found");
  return mapRecord(data as unknown as RawRecord);
}

/** The columns new_m_view adds to a document row. */
export type ViewFields = Pick<
  NewMRecord,
  "domain_hostname" | "link_name" | "link_current_template" | "uploader_name" | "uploader_email"
>;

/**
 * A document as the view returns it, built from the row a write hands back plus what the route
 * already knows, so a save needs no second read.
 */
export function recordFromRow(row: Record<string, unknown>, view: ViewFields): NewMRecord {
  return mapRecord({ ...(row as unknown as RawRecord), ...view });
}

/* ---------------- QR code ---------------- */

/** The QR columns for a link: the code itself, the link it encodes, and when it was drawn. */
export function qrColumns(url: string): { qr_url: string; qr_svg: string; qr_updated_at: string } {
  return { qr_url: url, qr_svg: verifyQrSvg(url), qr_updated_at: new Date().toISOString() };
}

interface QrItem {
  id: string;
  qr_url: string;
  qr_svg: string;
  link_template: string;
}

/**
 * Saves the QR codes of many documents in one database call per hundred (new_m_set_qr in
 * new-m.sql). Until that function exists, falls back to one update per document.
 */
async function saveQr(items: QrItem[]): Promise<void> {
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const { error } = await db().rpc("new_m_set_qr", { items: chunk });
    if (!error) continue;
    // PGRST202 / 42883: the function is not in the database yet.
    if (error.code !== "PGRST202" && error.code !== "42883") throw dbError(error);
    const results = await Promise.all(
      chunk.map(({ id, ...cols }) =>
        db()
          .from("new_m_records")
          .update({ ...cols, qr_updated_at: new Date().toISOString() })
          .eq("id", id),
      ),
    );
    for (const r of results) if (r.error) throw dbError(r.error);
  }
}

/**
 * Makes sure each document's saved QR code is the one for its complete link as it reads now, redrawing
 * any that is missing or stale, saving them all in one go, and keeping each copy of its link in step.
 */
export async function withCurrentQr(records: NewMRecord[]): Promise<NewMRecord[]> {
  const stale: QrItem[] = [];
  const out = records.map((r) => {
    const template = templateOf(r);
    if (r.qr_svg && r.qr_url === r.verify_url && r.link_template === template) return r;
    const qr = qrColumns(r.verify_url);
    stale.push({ id: r.id, qr_url: qr.qr_url, qr_svg: qr.qr_svg, link_template: template });
    return { ...r, ...qr, link_template: template };
  });
  if (stale.length) await saveQr(stale);
  return out;
}

/**
 * Redraws and saves the QR code of every document a settings change touched — a renamed domain or an
 * edited link — so the database holds the new codes straight away. Reads only what builds the link,
 * not the stored codes, and saves each page in batches. Returns how many were replaced.
 */
export async function refreshQrWhere(column: "domain_id" | "link_id", id: string): Promise<number> {
  const PAGE = 500;
  let replaced = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("new_m_view")
      .select("id,domain_hostname,link_template,link_current_template,attestation_number,issue_date,qr_url")
      .eq(column, id)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw dbError(error);
    const rows = (data ?? []) as Array<
      Pick<NewMRecord, "id" | "domain_hostname" | "link_template" | "link_current_template" | "attestation_number" | "issue_date" | "qr_url">
    >;
    const stale: QrItem[] = [];
    for (const r of rows) {
      const template = templateOf(r);
      const url = resolveLink(r.domain_hostname, template, r.attestation_number, r.issue_date);
      if (r.qr_url === url && r.link_template === template) continue;
      stale.push({ id: r.id, qr_url: url, qr_svg: verifyQrSvg(url), link_template: template });
    }
    await saveQr(stale);
    replaced += stale.length;
    if (rows.length < PAGE) return replaced;
  }
}

/** Columns the common search box looks through, on every domain at once. */
export const SEARCH_COLUMNS = [
  "attestation_number",
  "doc_number",
  "document_type",
  "issuing_office",
  "issuing_authority",
  "officer_name",
  "officer_designation",
  "doc_filename",
  "domain_hostname",
  "link_name",
];
