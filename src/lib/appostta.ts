import { ApiError } from "./errors";
import { can } from "./permissions";
import { db } from "./supabase";
import type {
  ApposttaField,
  ApposttaFieldDef,
  ApposttaRecord,
  ApposttaSettings,
  ApposttaSignature,
  User,
} from "./types";

/**
 * Uploading only puts bytes at a random key that nothing points at yet; the route that attaches the
 * key re-checks the exact permission. So any Appostta writer may upload, and a key that is never
 * attached is swept up by the storage cleanup.
 */
export function requireApposttaWrite(user: User): void {
  if (can(user, "appostta_create") || can(user, "appostta_edit") || can(user, "appostta_settings")) return;
  throw new ApiError(403, "You don't have permission to upload Appostta files");
}

/** Reading a stored document or signature back out. */
export function requireApposttaRead(user: User): void {
  if (can(user, "preview")) return;
  requireApposttaWrite(user);
}

/** Public path a verification link points at. The query carries the number and the issue date. */
export const VERIFY_PATH = "/verify-appostta";

export const MAX_FIELDS = 24;
const MAX_LABEL = 120;
const MAX_VALUE = 400;
/** How many preset values one row may offer in its dropdown. */
const MAX_OPTIONS = 60;
/** How many signatures the panel may keep to choose between. */
const MAX_SIGNATURES = 24;

/* ---------------- Numbers ---------------- */

const GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GROUPS = 3;
const GROUP_LENGTH = 4;
/** Accepts the generated shape and anything similar an admin types by hand afterwards. */
const NUMBER_RE = /^[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,12}){0,5}$/;

export function normalizePrefix(input: unknown): string {
  const p = String(input ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!p) throw new ApiError(400, "Number prefix is required, for example APT");
  if (p.length > 12) throw new ApiError(400, "Number prefix is too long (max 12 characters)");
  return p;
}

/**
 * Uniform random letters. Values at the top of the byte range are thrown away rather than
 * folded with %, which would quietly make the first six letters more likely than the rest.
 */
function randomLetters(count: number): string {
  const limit = 256 - (256 % GROUP_LETTERS.length);
  let out = "";
  while (out.length < count) {
    const bytes = new Uint8Array(count - out.length + 8);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (out.length >= count) break;
      if (b >= limit) continue;
      out += GROUP_LETTERS[b % GROUP_LETTERS.length];
    }
  }
  return out;
}

/** `APT-MUBN-NGDW-EGCW` — the prefix, then three four-letter groups. */
export function generateNumber(prefix: string): string {
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i++) groups.push(randomLetters(GROUP_LENGTH));
  return [normalizePrefix(prefix), ...groups].join("-");
}

export function normalizeNumber(input: unknown): string {
  if (typeof input !== "string") throw new ApiError(400, "Number is required");
  const n = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!n) throw new ApiError(400, "Number is required");
  if (n.length > 64) throw new ApiError(400, "Number is too long (max 64 characters)");
  if (!NUMBER_RE.test(n)) {
    throw new ApiError(400, "Number can only use letters, numbers and single hyphens, for example APT-MUBN-NGDW-EGCW");
  }
  return n;
}

/** Tries fresh numbers until one is free, so a collision costs a retry instead of an error. */
export async function uniqueNumber(prefix: string, attempts = 8): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const candidate = generateNumber(prefix);
    if (!(await numberTaken(candidate))) return candidate;
  }
  throw new ApiError(500, "Could not generate a free number. Please try again.");
}

export async function numberTaken(number: string, exceptId?: string): Promise<boolean> {
  let q = db().from("appostta_records").select("id").ilike("number", number.replace(/[%_]/g, "\\$&"));
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q.limit(1);
  if (error) throw new ApiError(500, error.message);
  return (data?.length ?? 0) > 0;
}

/* ---------------- Dates ---------------- */

export interface IssuedDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/**
 * Splits `YYYY-MM-DD` by hand. Going through Date would read the string as UTC midnight and can
 * land on the previous day once the server's zone is applied, which would break the link.
 */
export function parseIssuedOn(input: unknown): IssuedDate {
  if (typeof input !== "string") throw new ApiError(400, "Issue date is required");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) throw new ApiError(400, "Issue date must look like 2026-03-16");
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2999) throw new ApiError(400, "Issue date year looks wrong");
  if (month < 1 || month > 12) throw new ApiError(400, "Issue date month must be between 01 and 12");
  if (day < 1 || day > daysInMonth(year, month)) throw new ApiError(400, "That day does not exist in that month");
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function issuedToIso(d: IssuedDate): string {
  return `${String(d.year).padStart(4, "0")}-${pad2(d.month)}-${pad2(d.day)}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today in the server's own zone, as `YYYY-MM-DD`. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/* ---------------- Links ---------------- */

export function buildVerifyUrl(hostname: string, number: string, issuedOn: string): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(issuedOn ?? "");
  const params = new URLSearchParams({
    number,
    day: d?.[3] ?? "",
    month: d?.[2] ?? "",
    year: d?.[1] ?? "",
  });
  return `https://${hostname}${VERIFY_PATH}?${params.toString()}`;
}

/* ---------------- Field definitions ---------------- */

/**
 * The rows are defined once in settings, so a definition needs a stable id: it is what lets a record
 * say which row a value belongs to without the label having to match.
 */
function makeId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

function normalizeId(input: unknown, prefix: string): string {
  const id = String(input ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return id || makeId(prefix);
}

/**
 * Keeps only well-formed definitions and trims them. A definition with no label is dropped, because
 * the label is the whole point of the row; options are deduplicated and blanks removed.
 */
export function sanitizeFieldDefs(input: unknown): ApposttaFieldDef[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new ApiError(400, "Certificate rows must be a list");
  if (input.length > MAX_FIELDS) throw new ApiError(400, `There can be at most ${MAX_FIELDS} certificate rows`);

  const out: ApposttaFieldDef[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Partial<ApposttaFieldDef>;
    const label = String(r.label ?? "").trim().slice(0, MAX_LABEL);
    if (!label) continue;

    const options: string[] = [];
    if (Array.isArray(r.options)) {
      if (r.options.length > MAX_OPTIONS) {
        throw new ApiError(400, `"${label}" has too many values (max ${MAX_OPTIONS})`);
      }
      for (const o of r.options) {
        const value = String(o ?? "").trim().slice(0, MAX_VALUE);
        if (value && !options.includes(value)) options.push(value);
      }
    }

    // Two definitions sharing an id would make a record's values land on the wrong row.
    let id = normalizeId(r.id, "f");
    while (seen.has(id)) id = makeId("f");
    seen.add(id);

    const defaultValue = String(r.default_value ?? "").trim().slice(0, MAX_VALUE);
    out.push({
      id,
      label,
      options,
      // Without a list of values there is nothing to pick from, so free text is the only way to fill it.
      allow_custom: options.length === 0 ? true : r.allow_custom !== false,
      // A default that is no longer one of the offered values would be a pick nobody can make again.
      default_value: options.length && !options.includes(defaultValue) ? "" : defaultValue,
    });
  }
  return out;
}

/* ---------------- Signatures ---------------- */

/**
 * The signature list in settings. Each entry keeps its own stored image, and records copy the entry
 * rather than point at it, so removing one here never blanks a certificate that was already issued.
 */
export function sanitizeSignatures(input: unknown): ApposttaSignature[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new ApiError(400, "Signatures must be a list");
  if (input.length > MAX_SIGNATURES) throw new ApiError(400, `There can be at most ${MAX_SIGNATURES} signatures`);

  const out: ApposttaSignature[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Partial<ApposttaSignature>;
    const name = String(r.name ?? "").trim().slice(0, MAX_LABEL);
    const key = String(r.r2_key ?? "").trim();
    // An entry with neither a name nor an image is an empty row the admin never filled in.
    if (!name && !key) continue;
    if (!name) throw new ApiError(400, "Every signature needs the name printed under it");

    let id = normalizeId(r.id, "s");
    while (seen.has(id)) id = makeId("s");
    seen.add(id);

    out.push({ id, name, r2_key: key, content_type: String(r.content_type ?? "image/png") });
  }
  return out;
}

/** The signature a record should be issued under, or null when settings hold none. */
export function pickSignature(settings: ApposttaSettings, id: string | null | undefined): ApposttaSignature | null {
  const wanted = String(id ?? "").trim();
  if (wanted) return settings.signatures.find((s) => s.id === wanted) ?? null;
  return defaultSignature(settings);
}

export function defaultSignature(settings: ApposttaSettings): ApposttaSignature | null {
  const byId = settings.default_signature_id
    ? settings.signatures.find((s) => s.id === settings.default_signature_id)
    : undefined;
  return byId ?? settings.signatures[0] ?? null;
}

/* ---------------- Record rows ---------------- */

/** Keeps only well-formed rows and trims them; a blank label with a blank value is dropped. */
export function sanitizeFields(input: unknown): ApposttaField[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new ApiError(400, "Fields must be a list");
  if (input.length > MAX_FIELDS) throw new ApiError(400, `A record can have at most ${MAX_FIELDS} fields`);
  const out: ApposttaField[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as ApposttaField;
    const label = String(r.label ?? "").trim().slice(0, MAX_LABEL);
    const value = String(r.value ?? "").trim().slice(0, MAX_VALUE);
    if (!label && !value) continue;
    const id = r.id ? normalizeId(r.id, "f") : undefined;
    out.push(id ? { id, label, value } : { label, value });
  }
  return out;
}

/** What the client sends for the rows: a value per definition, and nothing else. */
export interface FieldValueInput {
  id?: string;
  value?: unknown;
}

function readValues(input: unknown): FieldValueInput[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new ApiError(400, "Field values must be a list");
  if (input.length > MAX_FIELDS) throw new ApiError(400, `A record can have at most ${MAX_FIELDS} fields`);
  return input.filter((v): v is FieldValueInput => Boolean(v) && typeof v === "object");
}

/**
 * Matches an incoming value to a row by id, falling back to its position. The id is what makes this
 * safe when the definitions were reordered between the form loading and the record being saved.
 */
function valueFor(values: FieldValueInput[], id: string | undefined, index: number): string | undefined {
  const byId = id ? values.find((v) => String(v.id ?? "") === id) : undefined;
  const hit = byId ?? values[index];
  if (!hit || hit.value === undefined || hit.value === null) return undefined;
  return String(hit.value).trim().slice(0, MAX_VALUE);
}

/**
 * Builds a new record's rows from the definitions in force right now. The labels come from settings
 * and never from the client, which is what freezes the record: later edits to the definitions
 * produce different rows for later records and leave this one untouched.
 */
export function buildRecordFields(defs: ApposttaFieldDef[], input: unknown): ApposttaField[] {
  const values = readValues(input);
  return defs.map((def, i) => {
    const raw = valueFor(values, def.id, i);
    const value = raw === undefined ? def.default_value : raw;
    if (value && def.options.length && !def.allow_custom && !def.options.includes(value)) {
      throw new ApiError(400, `"${value}" is not one of the values set up for ${def.label}`);
    }
    return { id: def.id, label: def.label, value };
  });
}

/**
 * Applies new values to a record that already exists. Only the values move: the rows themselves stay
 * exactly as they were frozen, so editing an old record never pulls in newer definitions.
 */
export function applyFieldValues(existing: ApposttaField[], input: unknown): ApposttaField[] {
  const values = readValues(input);
  return existing.map((field, i) => {
    const raw = valueFor(values, field.id, i);
    return { ...field, value: raw === undefined ? field.value : raw };
  });
}

/* ---------------- Settings ---------------- */

const SETTINGS_COLUMNS =
  "org_name,org_tagline,number_prefix,field_defs,signatures,default_signature_id,footer_note,updated_by,updated_at";

export async function getSettings(): Promise<ApposttaSettings> {
  const { data, error } = await db().from("appostta_settings").select(SETTINGS_COLUMNS).eq("id", true).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) {
    // The schema seeds this row; a missing one only means the migration has not been run yet.
    throw new ApiError(500, "Appostta settings row is missing. Run supabase/schema.sql again.");
  }
  const row = data as unknown as ApposttaSettings;
  return {
    ...row,
    field_defs: sanitizeFieldDefs(row.field_defs),
    signatures: sanitizeSignatures(row.signatures),
    default_signature_id: String(row.default_signature_id ?? ""),
  };
}

/* ---------------- Records ---------------- */

export const RECORD_COLUMNS = "*";

interface RawRecord extends Omit<ApposttaRecord, "verify_url" | "fields"> {
  fields: unknown;
}

export function mapRecord(row: RawRecord): ApposttaRecord {
  const fields = sanitizeFields(row.fields);
  return {
    ...row,
    fields,
    signature_id: String(row.signature_id ?? ""),
    signatory_name: String(row.signatory_name ?? ""),
    doc_size: Number(row.doc_size ?? 0),
    download_count: Number(row.download_count ?? 0),
    verify_url: buildVerifyUrl(row.domain_hostname, row.number, row.issued_on),
  };
}

export async function getRecord(id: string): Promise<ApposttaRecord> {
  const { data, error } = await db().from("appostta_view").select(RECORD_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "Appostta record not found");
  return mapRecord(data as unknown as RawRecord);
}

export async function getDomain(domainId: string): Promise<{ id: string; hostname: string }> {
  const { data, error } = await db().from("domains").select("id,hostname").eq("id", domainId).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "Domain not found");
  return data as { id: string; hostname: string };
}

/**
 * Whether any record still prints this signature image. Asked before a signature dropped from
 * settings has its stored object deleted, so an old certificate never loses its picture.
 */
export async function signatureKeyInUse(key: string): Promise<boolean> {
  const { data, error } = await db().from("appostta_records").select("id").eq("signature_r2_key", key).limit(1);
  if (error) throw new ApiError(500, error.message);
  return (data?.length ?? 0) > 0;
}
