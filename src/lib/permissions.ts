import type { Role } from "./types";

export const PERMISSIONS = [
  { key: "upload", label: "Upload files", group: "Files" },
  { key: "replace", label: "Replace files", group: "Files" },
  { key: "rename", label: "Rename files", group: "Files" },
  { key: "delete", label: "Delete files", group: "Files" },
  { key: "preview", label: "Preview and download files", group: "Files" },
  { key: "create_link", label: "Create links", group: "Links" },
  { key: "edit_link", label: "Rename or edit links", group: "Links" },
  { key: "delete_link", label: "Delete links (and their files)", group: "Links" },
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
