import type { Permission } from "./permissions";

/** Everything a file manager tab lets a user do, each needing its own permission there. */
export type MAction =
  | "upload"
  | "replace"
  | "rename"
  | "move"
  | "delete"
  | "preview"
  | "create_link"
  | "edit_link"
  | "delete_link";

/**
 * One file manager tab. Old M is the original, whose files download from their public address.
 * New M offers the same domains, links and uploads, kept in tables and storage of its own; how its
 * files reach the front end is not decided yet, so it shows no public address.
 */
export interface MTab {
  /** Admin page; the selected link rides in its ?link= query. */
  page: string;
  /** Every domain, with this tab's links under it. */
  treeApi: string;
  filesApi: string;
  linksApi: string;
  perms: Record<MAction, Permission>;
  /** Files here have a public address that downloads them. */
  isPublic: boolean;
}

export const OLD_M_TAB: MTab = {
  page: "/admin/old-m",
  treeApi: "/api/admin/domains?include=links",
  filesApi: "/api/admin/files",
  linksApi: "/api/admin/links",
  perms: {
    upload: "upload",
    replace: "replace",
    rename: "rename",
    move: "move",
    delete: "delete",
    preview: "preview",
    create_link: "create_link",
    edit_link: "edit_link",
    delete_link: "delete_link",
  },
  isPublic: true,
};

export const NEW_M_TAB: MTab = {
  page: "/admin/new-m",
  treeApi: "/api/admin/new-m/domains",
  filesApi: "/api/admin/new-m/files",
  linksApi: "/api/admin/new-m/links",
  perms: {
    upload: "new_m_upload",
    replace: "new_m_replace",
    rename: "new_m_rename",
    move: "new_m_move",
    delete: "new_m_delete",
    preview: "new_m_preview",
    create_link: "new_m_create_link",
    edit_link: "new_m_edit_link",
    delete_link: "new_m_delete_link",
  },
  isPublic: false,
};
