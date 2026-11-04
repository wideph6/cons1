import { randomHashName } from "./appo-link";
import { cleanFilename } from "./utils";

/**
 * Appo's documents, officer signatures, sticker backgrounds and the verification page's logos live
 * under their own prefix, apart from Old M and New M.
 */
export type AppoKind = "docs" | "signatures" | "backgrounds" | "page";

/** Prefix everything Appo stores lives under. */
export const APPO_PREFIX = "appo/";

export function makeAppoKey(kind: AppoKind, filename: string): string {
  // A document's PDF is stored under a fresh 40-character name, the one the verification page shows
  // and links to, so the storage link it opens from never carries the name it was uploaded with.
  const safe = kind === "docs" ? `${randomHashName()}.pdf` : cleanFilename(filename).replace(/[^A-Za-z0-9._-]/g, "_");
  return `${APPO_PREFIX}${kind}/${crypto.randomUUID()}/${safe}`;
}

export function isAppoKey(key: unknown, kind?: AppoKind): key is string {
  const part = kind ?? "(?:docs|signatures|backgrounds|page)";
  return typeof key === "string" && new RegExp(`^appo/${part}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$`).test(key);
}
