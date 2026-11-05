import type { PendingEditInfo } from "./pending-shared";

export type Role = "superadmin" | "admin";

/**
 * What each user's counts are made of: Old M uploads, replaces, renames and deletes, and the New M and Appo
 * documents they upload.
 */
export type CountedAction = "upload" | "replace" | "rename" | "delete" | "create_new_m" | "create_appo";
export const COUNTED_ACTIONS: CountedAction[] = ["upload", "replace", "rename", "delete", "create_new_m", "create_appo"];

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  permissions: Record<string, boolean>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface DbUser extends User {
  password_hash: string;
}

export interface VercelVerification {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

export interface VercelStatus {
  configured: boolean;
  added: boolean;
  verified: boolean;
  misconfigured: boolean | null;
  verification?: VercelVerification[];
  error?: string;
  checked_at: string;
}

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME" | string;
  value: string;
}

/** One public resolver's answer for the hostname. */
export interface DnsLookup {
  resolver: string;
  records: DnsRecord[];
  /** Reverse-DNS name of the first non-Vercel address, when one exists — names the host that actually owns it. */
  owner?: string;
  error?: string;
}

export interface DnsCheck {
  lookups: DnsLookup[];
  /** vercel = every record points at Vercel; mixed = Vercel plus something else; none = no records at all. */
  verdict: "vercel" | "not_vercel" | "mixed" | "none" | "unknown";
  summary: string;
}

/** Result of asking a hostname, over the public internet, whether this deployment is what answers it. */
export interface ReachResult {
  hostname: string;
  probe_url: string;
  dns?: DnsCheck;
  /** true = this deployment answered; false = something else did; null = nothing answered. */
  serves: boolean | null;
  status: number;
  answered_by: string;
  level: "ok" | "warn" | "fail";
  message: string;
  hint?: string;
  reason?: string;
  server?: string;
  location?: string;
  checked_at: string;
}

export interface LinkRow {
  id: string;
  domain_id: string;
  path: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  file_count: number;
  total_size: number;
  last_upload_at: string | null;
}

export interface Domain {
  id: string;
  hostname: string;
  is_active: boolean;
  notes: string;
  vercel_status: VercelStatus | null;
  created_by: string | null;
  created_at: string;
  links?: LinkRow[];
  file_count?: number;
  total_size?: number;
}

export interface FileRow {
  id: string;
  /** Earlier versions still kept after a replace, for the super admin to compare (15 days each). */
  previous_files?: number;
  link_id: string;
  filename: string;
  r2_key: string;
  size: number;
  content_type: string;
  uploaded_by: string | null;
  uploaded_at: string;
  updated_at: string;
  replaced_at: string | null;
  renamed_at: string | null;
  download_count: number;
  last_downloaded_at: string | null;
  uploader?: { name: string; email: string } | null;
  link?: { id: string; path: string; domain: { id: string; hostname: string } } | null;
}

export interface Activity {
  id: number;
  user_id: string | null;
  action: string;
  domain_id: string | null;
  link_id: string | null;
  file_id: string | null;
  domain_hostname: string | null;
  link_path: string | null;
  filename: string | null;
  details: Record<string, unknown>;
  created_at: string;
  user?: { name: string; email: string } | null;
}

export interface CounterRow {
  user_id: string;
  action: CountedAction;
  base: number;
  counted_from: string;
  activity_count: number;
  total: number;
}

/** One count change made to a user by the super admin, with its remarks. */
export interface CountChange {
  id: number;
  created_at: string;
  by: string | null;
  mode: string;
  actions: string[];
  changes: Array<{ action: CountedAction; before: number; after: number }>;
  amount_change: number;
  remarks: string;
}

export interface BreakdownRow {
  action: CountedAction;
  domain_id: string | null;
  domain_hostname: string | null;
  link_id: string | null;
  link_path: string | null;
  cnt: number;
}

export type Counts = Record<CountedAction, number> & { total: number };

export interface UserWithCounts extends User {
  counts: Counts;
  /** What the user owes now (0 before supabase/finance.sql). */
  pending?: number;
}

export interface DashboardStats {
  domains: number;
  active_domains: number;
  links: number;
  files: number;
  total_size: number;
  downloads: number;
  users: number;
  uploads_today: number;
  uploads_7d: number;
}

/** One stored object with no file row pointing at it. */
export interface StorageOrphan {
  key: string;
  size: number;
  last_modified: string | null;
  age_hours: number | null;
  /** False while the object is younger than the grace window, i.e. an upload may still be finishing. */
  deletable: boolean;
}

/** A file row whose object is not in the bucket — the public link is broken. */
export interface StorageMissing {
  id: string;
  filename: string;
  r2_key: string;
  size: number;
  uploaded_at: string;
  hostname: string | null;
  path: string | null;
  /** Set on a New M file, so the fix opens New M instead of Old M. */
  new_m?: boolean;
  /** Set on an Appo file, so the fix opens Appo. */
  appo?: boolean;
}

/** A file row whose recorded size does not match the stored object. */
export interface StorageMismatch extends StorageMissing {
  real_size: number;
}

export interface StorageReport {
  bucket_objects: number;
  bucket_bytes: number;
  db_files: number;
  db_bytes: number;
  orphans: StorageOrphan[];
  orphan_bytes: number;
  deletable_orphans: number;
  deletable_bytes: number;
  missing: StorageMissing[];
  mismatched: StorageMismatch[];
  /** Hours an orphan must survive before cleanup will touch it. */
  grace_hours: number;
  /** True when the bucket holds more objects than one report can list; comparisons are then incomplete. */
  truncated: boolean;
  checked_at: string;
}

export interface MoveResult {
  moved: number;
  skipped: Array<{ filename: string; reason: string }>;
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/* ---------------- New M ---------------- */

/**
 * One of a New M domain's links: everything after the domain, with {attestation_number} and
 * {issue_date} where each document's own values go.
 */
export interface NewMLink {
  id: string;
  domain_id: string;
  name: string;
  template: string;
  created_at: string;
  updated_at: string;
  /** Documents built on this link; their links and QR codes follow it. */
  document_count: number;
}

/** A domain or subdomain set up for New M alone, apart from the Domains page. */
export interface NewMDomain {
  id: string;
  hostname: string;
  notes: string;
  created_at: string;
  links: NewMLink[];
  document_count: number;
}

/** The lists an upload can pick from, each growing with every new value typed in. */
export type NewMOptionKind = "document_type" | "issuing_office" | "issuing_authority";

export interface NewMOption {
  id: string;
  kind: NewMOptionKind;
  value: string;
}

/** A saved approving officer: picking one fills in the name, designation and signature together. */
export interface NewMOfficer {
  id: string;
  name: string;
  designation: string;
  signature_r2_key: string | null;
  signature_content_type: string | null;
  /** Short-lived link to the signature image, for showing it in the panel. */
  signature_url: string | null;
}

export interface NewMLists {
  options: Record<NewMOptionKind, NewMOption[]>;
  officers: NewMOfficer[];
}

/**
 * One uploaded attestation document. Everything a sticker will print is on the record itself, so a
 * sticker drawn at download time always matches the record as it reads now, edits included.
 */
export interface NewMRecord {
  id: string;
  /** A New M domain, not one from the Domains page. */
  domain_id: string;
  /** The domain link the document is built on, or null once that link was removed. */
  link_id: string | null;
  /** Copy of the link last used to build the document's address, for when the link is removed. */
  link_template: string;
  attestation_number: string;
  /** ISO date (YYYY-MM-DD); the link carries it as DDMMYYYY. */
  issue_date: string;
  document_type: string;
  issuing_office: string;
  issuing_authority: string;
  /** The saved officer this document was given, or null when none was picked or it was removed from the list. */
  officer_id: string | null;
  /** Copied from that officer, so removing them from the list leaves this document unchanged. */
  officer_name: string;
  officer_designation: string;
  officer_signature_r2_key: string | null;
  officer_signature_content_type: string | null;
  doc_filename: string;
  doc_r2_key: string;
  doc_size: number;
  doc_content_type: string;
  doc_uploaded_at: string;
  doc_replaced_at: string | null;
  /** The link the saved QR code was drawn from. */
  qr_url: string | null;
  /** The saved QR code, a standalone SVG. Replaced whenever an edit changes the link. */
  qr_svg: string | null;
  qr_updated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  domain_hostname: string;
  /** Name and current wording of the domain link; null once that link was removed. */
  link_name: string | null;
  link_current_template: string | null;
  uploader_name: string | null;
  uploader_email: string | null;
  /** The complete link, built by the server from the domain, its link and the document's values. */
  verify_url: string;
  /** Earlier PDFs still kept after a replace, for the super admin to compare (15 days each). */
  previous_files?: number;
  /** An edit waiting for the super admin's approval (documents uploaded more than a month ago). */
  pending_edit?: PendingEditInfo | null;
}
