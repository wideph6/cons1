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
  { key: "new_m_upload", label: "Upload files to New M", group: "New M files" },
  { key: "new_m_replace", label: "Replace New M files", group: "New M files" },
  { key: "new_m_rename", label: "Rename New M files", group: "New M files" },
  { key: "new_m_move", label: "Move New M files to another link", group: "New M files" },
  { key: "new_m_delete", label: "Delete New M files", group: "New M files" },
  { key: "new_m_preview", label: "Preview and download New M files", group: "New M files" },
  { key: "new_m_create_link", label: "Create New M links", group: "New M links" },
  { key: "new_m_edit_link", label: "Rename or edit New M links", group: "New M links" },
  { key: "new_m_delete_link", label: "Delete New M links (and their files)", group: "New M links" },
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

/** Keep only known permission keys with boolean values. */
export function sanitizePermissions(input: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (input && typeof input === "object") {
    for (const key of PERMISSION_KEYS) {
      const v = (input as Record<string, unknown>)[key];
      if (v === true) out[key] = true;
    }
  }
  return out;
}

export const ALL_PERMISSIONS: Record<string, boolean> = Object.fromEntries(
  PERMISSION_KEYS.map((k) => [k, true]),
);
