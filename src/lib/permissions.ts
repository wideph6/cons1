import type { Role } from "./types";

export const PERMISSIONS = [
  { key: "upload", label: "Upload files", group: "Old M files" },
  { key: "replace", label: "Replace files", group: "Old M files" },
  { key: "rename", label: "Rename files", group: "Old M files" },
  { key: "move", label: "Move files to another link", group: "Old M files" },
  { key: "delete", label: "Delete files", group: "Old M files" },
  { key: "preview", label: "Preview and download files", group: "Old M files" },
  { key: "create_link", label: "Create links", group: "Old M links" },
  { key: "edit_link", label: "Rename or edit links", group: "Old M links" },
  { key: "delete_link", label: "Delete links (and their files)", group: "Old M links" },
  { key: "new_m_create", label: "Upload New M documents", group: "New M" },
  { key: "new_m_edit", label: "Edit New M documents (number, date, details, PDF)", group: "New M" },
  { key: "new_m_delete", label: "Delete New M documents", group: "New M" },
  { key: "new_m_settings", label: "Remove saved New M values and officers", group: "New M" },
  { key: "new_m_domains", label: "Add and edit New M domains and their links", group: "New M" },
  { key: "appo_create", label: "Upload Appo documents", group: "Appo" },
  { key: "appo_edit", label: "Edit Appo documents (number, date, details, PDF)", group: "Appo" },
  { key: "appo_delete", label: "Delete Appo documents", group: "Appo" },
  { key: "appo_settings", label: "Remove saved Appo values and officers", group: "Appo" },
  { key: "appo_domains", label: "Add and edit Appo domains and their links", group: "Appo" },
  { key: "create_domain", label: "Add domains and subdomains", group: "Domains" },
  { key: "edit_domain", label: "Edit, enable or disable domains", group: "Domains" },
  { key: "delete_domain", label: "Delete domains (and everything under them)", group: "Domains" },
  { key: "search", label: "Search files by date", group: "Other" },
  { key: "view_activity", label: "View own activity history", group: "Other" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: Permission[] = PERMISSIONS.map((p) => p.key);

export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
  PERMISSIONS.map((p) => [p.key, p.label]),
) as Record<Permission, string>;

export function can(
  user: { role: Role; permissions: Record<string, boolean> | null | undefined } | null | undefined,
  perm: Permission,
): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  return Boolean(user.permissions?.[perm]);
}

/**
 * What a commission user may be given: making cases and changing their own, in each system. Everything else
 * (deleting, settings, domains and links, searching, other people's cases) stays the super admin's.
 */
export const COMMISSION_PERMISSIONS: Permission[] = [
  "upload",
  "replace",
  "rename",
  "move",
  "preview",
  "new_m_create",
  "new_m_edit",
  "appo_create",
  "appo_edit",
];

/** Keep only known permission keys with boolean values (for a commission user, only those it may have). */
export function sanitizePermissions(input: unknown, role?: Role): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const allowed = role === "commission" ? COMMISSION_PERMISSIONS : PERMISSION_KEYS;
  if (input && typeof input === "object") {
    for (const key of allowed) {
      const v = (input as Record<string, unknown>)[key];
      if (v === true) out[key] = true;
    }
  }
  return out;
}

export const ALL_PERMISSIONS: Record<string, boolean> = Object.fromEntries(
  PERMISSION_KEYS.map((k) => [k, true]),
);
