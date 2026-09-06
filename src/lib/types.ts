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

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
