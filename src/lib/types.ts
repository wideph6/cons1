export type Role = "superadmin" | "admin";

export type CountedAction = "upload" | "replace" | "rename" | "delete";
export const COUNTED_ACTIONS: CountedAction[] = ["upload", "replace", "rename", "delete"];

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

/* ---------------- Appostta ---------------- */

/**
 * One row printed on a record's certificate. The label is copied from the settings definition the
 * row came from, so changing that definition later never rewrites a record that already exists.
 */
export interface ApposttaField {
  /** The settings definition this row came from. Absent on rows created before definitions existed. */
  id?: string;
  label: string;
  value: string;
}

/**
 * A certificate row the admin defines once in settings. Every record created afterwards starts with
 * these rows, and whoever fills a record only picks a value.
 */
export interface ApposttaFieldDef {
  id: string;
  label: string;
  /** Values offered when a record is created. May be empty, which means free text. */
  options: string[];
  /** Lets a record use a value that is not in the list. Forced on when there are no options. */
  allow_custom: boolean;
  /** Preselected on a new record. */
  default_value: string;
}

/** One of the signatures set up in settings, chosen by name when a record is created. */
export interface ApposttaSignature {
  id: string;
  /** Printed under the signature line. */
  name: string;
  r2_key: string;
  content_type: string;
}

export interface ApposttaSettings {
  org_name: string;
  org_tagline: string;
  number_prefix: string;
  /** The certificate rows every new record starts with. */
  field_defs: ApposttaFieldDef[];
  /** Every signature a record can be issued under. */
  signatures: ApposttaSignature[];
  /** Preselected in the record form. Blank means the first signature. */
  default_signature_id: string;
  footer_note: string;
  updated_by: string | null;
  updated_at: string;
}

export interface ApposttaRecord {
  id: string;
  domain_id: string;
  number: string;
  /** ISO date (YYYY-MM-DD); the day/month/year in the verification link come from this. */
  issued_on: string;
  doc_filename: string | null;
  doc_r2_key: string | null;
  doc_size: number;
  doc_content_type: string | null;
  doc_uploaded_at: string | null;
  doc_replaced_at: string | null;
  /** Frozen at creation from the field definitions in force at that moment. */
  fields: ApposttaField[];
  /** The settings signature this record was issued under. Blank when none was chosen. */
  signature_id: string;
  /** Copied from that signature, so the certificate keeps reading the same when settings change. */
  signatory_name: string;
  signature_r2_key: string | null;
  signature_content_type: string | null;
  notes: string;
  download_count: number;
  last_downloaded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  domain_hostname: string;
  domain_is_active: boolean;
  /** Built by the server so every caller shows the same link. */
  verify_url: string;
}
