import { ApiError } from "./errors";
import { dbError, isMissingTable } from "./appo";
import { documentAddress, matchTemplate } from "./appo-link";
import {
  cleanDesktop,
  cleanMobile,
  imageKeys,
  type DesktopContent,
  type MobileContent,
  type PageRecord,
  type PageView,
} from "./appo-page";
import { longDate } from "./appo-sticker";
import { presignDownload } from "./r2";
import { db } from "./supabase";
import { formatIssued } from "./utils";

/** Shown when the page table is not in the database yet. */
export const PAGE_TABLE_MISSING =
  "The page design table is not in the database yet. Run supabase/appo.sql in Supabase → SQL Editor, then reload.";

export interface StoredPage<T> {
  content: T;
  updated_at: string | null;
  /** False until appo.sql has created the table; the defaults are shown meanwhile. */
  table_ready: boolean;
}

async function readRow(view: PageView): Promise<{ content: unknown; updated_at: string | null; table_ready: boolean }> {
  const { data, error } = await db()
    .from("appo_page_settings")
    .select("content,updated_at")
    .eq("view", view)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { content: {}, updated_at: null, table_ready: false };
    throw dbError(error);
  }
  return { content: data?.content ?? {}, updated_at: (data?.updated_at as string | undefined) ?? null, table_ready: true };
}

export async function getDesktop(): Promise<StoredPage<DesktopContent>> {
  const row = await readRow("desktop");
  return { content: cleanDesktop(row.content), updated_at: row.updated_at, table_ready: row.table_ready };
}

export async function getMobile(): Promise<StoredPage<MobileContent>> {
  const row = await readRow("mobile");
  return { content: cleanMobile(row.content), updated_at: row.updated_at, table_ready: row.table_ready };
}

/**
 * Saves one view's content; returns when it was saved, as the database keeps it and as the next read
 * gives it ("…+00:00", not JavaScript's "…Z"), so the editor's next save is checked against the same value.
 */
export async function savePage(view: PageView, content: DesktopContent | MobileContent, userId: string): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("appo_page_settings")
    .upsert({ view, content, updated_by: userId, updated_at: now }, { onConflict: "view" })
    .select("updated_at")
    .single();
  if (error) {
    if (isMissingTable(error)) throw new ApiError(500, PAGE_TABLE_MISSING);
    throw dbError(error);
  }
  return ((data as { updated_at?: string } | null)?.updated_at as string | undefined) ?? now;
}

/**
 * The same save time, however it is written: the database gives "2026-11-06T13:20:00.123+00:00" where
 * JavaScript writes "2026-11-06T13:20:00.123Z". Compared as text, a save followed by another from the same
 * editor looked like someone else's save in between.
 */
export function sameSaveTime(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isNaN(ta) || Number.isNaN(tb) ? a === b : ta === tb;
}

/**
 * Every logo the saved page uses, for the storage report. Empty before appo.sql has run. A failed
 * read throws rather than answering "none", so storage cleanup never takes a logo in use for rubbish.
 */
export async function pageImageKeys(): Promise<string[]> {
  const [desktop, mobile] = await Promise.all([getDesktop(), getMobile()]);
  return [...new Set([...imageKeys(desktop.content), ...imageKeys(mobile.content)])];
}

/** A day is long enough for anyone reading the page, and the page is drawn fresh on every visit. */
const ASSET_TTL = 12 * 60 * 60;

/** Signed links to each logo and the favicon in R2, keyed by storage key, for one or both views. */
export async function assetUrls(...contents: Array<DesktopContent | MobileContent>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const images = contents.flatMap((c) => [
    c.header.logo,
    c.record.logo,
    c.footer.logo,
    ...("favicon" in c.meta ? [c.meta.favicon, c.meta.pdf_favicon] : []),
  ]);
  await Promise.all(
    images.map(async (im) => {
      if (!im.key || out[im.key]) return;
      out[im.key] = await presignDownload(
        im.key,
        im.filename || im.key.split("/").pop() || "logo",
        "inline",
        im.content_type || "image/png",
        ASSET_TTL,
      );
    }),
  );
  return out;
}

/* ---------------- The document behind a visited link ---------------- */

interface ViewRow {
  id: string;
  attestation_number: string;
  issue_date: string;
  document_type: string;
  signed_by: string;
  signed_capacity: string;
  seal_stamp: string;
  office_city: string;
  office_name: string;
  officer_name: string;
  officer_designation: string;
  officer_signature_r2_key: string | null;
  officer_signature_content_type: string | null;
  doc_filename: string;
  doc_r2_key: string;
  doc_size: number | null;
  doc_content_type: string;
  /** The PDF's own address and name; missing until the appo.sql that adds them has run. */
  doc_storage_number?: string | null;
  doc_hash_name?: string | null;
}

const ROW_COLUMNS =
  "id,attestation_number,issue_date,document_type,signed_by,signed_capacity,seal_stamp,office_city,office_name,officer_name,officer_designation,officer_signature_r2_key,officer_signature_content_type,doc_filename,doc_r2_key,doc_size,doc_content_type";
const ADDRESS_COLUMNS = "doc_storage_number,doc_hash_name";

type ViewRead = { data: unknown; error: { code?: string; message: string } | null };

/**
 * Reads appo_view with each document's address columns, or without them while the database has not
 * had the appo.sql that adds them (42703); its documents keep their earlier address until then.
 */
async function readView(query: (columns: string) => PromiseLike<ViewRead>): Promise<ViewRead> {
  const res = await query(`${ROW_COLUMNS},${ADDRESS_COLUMNS}`);
  return res.error?.code === "42703" ? query(ROW_COLUMNS) : res;
}

/** The same-site address of a document's PDF; the number and date are what unlock it. */
export function documentPath(number: string, isoDate: string, mode?: "open" | "download"): string {
  const sp = new URLSearchParams({ number, date: isoDate });
  if (mode) sp.set("mode", mode);
  return `/api/appo/document?${sp.toString()}`;
}

/**
 * What the PDF is called on the page and when it is saved: its 40-character name, never the name it
 * was uploaded with (which only the admin panel shows).
 */
export function publicFilename(row: Pick<ViewRow, "doc_hash_name" | "doc_filename">): string {
  return row.doc_hash_name ? `${row.doc_hash_name}.pdf` : row.doc_filename;
}

/** A document's values as the page shows them, with signed links to its signature. */
export async function pageRecord(row: ViewRow): Promise<PageRecord> {
  const signature =
    row.officer_signature_r2_key
      ? await presignDownload(
          row.officer_signature_r2_key,
          row.officer_signature_r2_key.split("/").pop() ?? "signature",
          "inline",
          row.officer_signature_content_type ?? "image/png",
          ASSET_TTL,
        ).catch(() => null)
      : null;
  // Desktop opens the address in a tab; phones save the PDF from it.
  const address =
    row.doc_storage_number && row.doc_hash_name ? documentAddress(row.doc_storage_number, row.doc_hash_name) : null;
  return {
    attestation_number: row.attestation_number,
    issue_date: formatIssued(row.issue_date),
    issue_date_long: longDate(row.issue_date),
    document_type: row.document_type,
    signed_by: row.signed_by ?? "",
    signed_capacity: row.signed_capacity ?? "",
    seal_stamp: row.seal_stamp ?? "",
    office_city: row.office_city ?? "",
    office_name: row.office_name ?? "",
    officer_name: row.officer_name,
    officer_designation: row.officer_designation,
    signature_url: signature,
    document: {
      src: documentPath(row.attestation_number, row.issue_date),
      open_url: address ?? documentPath(row.attestation_number, row.issue_date, "open"),
      download_url: address ? `${address}?download` : documentPath(row.attestation_number, row.issue_date, "download"),
      filename: publicFilename(row),
      size: Number(row.doc_size ?? 0),
    },
  };
}

/** One document by id, for the editor's preview. */
export async function pageRecordById(id: string): Promise<PageRecord> {
  const { data, error } = await readView((columns) => db().from("appo_view").select(columns).eq("id", id).maybeSingle());
  if (error) throw dbError(error);
  if (!data) throw new ApiError(404, "Document not found");
  return pageRecord(data as ViewRow);
}

/** The document whose number and date unlock its PDF. */
export async function rowByNumberAndDate(number: string, isoDate: string): Promise<ViewRow | null> {
  const { data, error } = await readView((columns) =>
    db()
      .from("appo_view")
      .select(columns)
      .eq("attestation_number", number)
      .eq("issue_date", isoDate)
      .limit(1)
      .maybeSingle(),
  );
  if (error) {
    if (isMissingTable(error)) return null;
    throw dbError(error);
  }
  return (data as ViewRow | null) ?? null;
}

/**
 * The document a /storage/applications/{number}/documents/{name}.pdf address names, only on the
 * document's own domain. Null before appo.sql has added the address columns.
 */
export async function rowByAddress(host: string, storageNumber: string, hashName: string): Promise<ViewRow | null> {
  const { data, error } = await db()
    .from("appo_view")
    .select(`${ROW_COLUMNS},${ADDRESS_COLUMNS}`)
    .eq("doc_storage_number", storageNumber)
    .eq("doc_hash_name", hashName)
    .in("domain_hostname", hostCandidates(host))
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error) || error.code === "42703") return null;
    throw dbError(error);
  }
  return (data as ViewRow | null) ?? null;
}

export interface VisitResult {
  /** The host is an Appo domain and the address is one of its links. */
  matched: boolean;
  record: PageRecord | null;
}

function hostCandidates(host: string): string[] {
  return host.startsWith("www.") ? [host, host.slice(4)] : [host, `www.${host}`];
}

/**
 * Reads a visited address on an Appo domain: which of the domain's links it is, which number and date
 * it carries, and the document they belong to. A document is only shown on its own domain.
 */
export async function findVisit(host: string, pathname: string, search: string): Promise<VisitResult> {
  if (!host) return { matched: false, record: null };
  const { data, error } = await db()
    .from("appo_domains")
    .select("id,hostname,appo_link_templates(id,template)")
    .in("hostname", hostCandidates(host));
  if (error) {
    if (isMissingTable(error)) return { matched: false, record: null };
    throw dbError(error);
  }
  const domains = (data ?? []) as unknown as Array<{
    id: string;
    hostname: string;
    appo_link_templates: Array<{ id: string; template: string }> | null;
  }>;
  const domain = domains.find((d) => d.hostname === host) ?? domains[0];
  if (!domain) return { matched: false, record: null };

  for (const link of domain.appo_link_templates ?? []) {
    const m = matchTemplate(link.template, pathname, search);
    if (!m) continue;
    if (!m.valid) return { matched: true, record: null };

    const { data: rows, error: rowError } = await readView((columns) => {
      let q = db().from("appo_view").select(columns).eq("domain_id", domain.id);
      if (m.number) q = q.eq("attestation_number", m.number);
      if (m.date) q = q.eq("issue_date", m.date);
      // Without a number in the link, only the link itself tells documents apart.
      if (!m.number) q = q.eq("link_id", link.id);
      return q.limit(2);
    });
    if (rowError) throw dbError(rowError);
    const list = (rows ?? []) as ViewRow[];
    // Two documents on one address would be a guess; neither is shown.
    if (list.length !== 1) return { matched: true, record: null };
    return { matched: true, record: await pageRecord(list[0]) };
  }
  return { matched: false, record: null };
}
