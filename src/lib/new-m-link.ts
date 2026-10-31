/**
 * The New M verification link and attestation number. No server imports, so the upload form
 * previews exactly the link the server will build.
 */

/** Public path a verification link points at. The query carries the number and the issue date. */
export const VERIFY_PATH = "/verify-general-attestation-by-qr";

/** Every attestation number starts with this. */
export const NUMBER_PREFIX = "GEN";

/** `GEN-NMPD-SSTI-FBDS`: GEN, then three groups of four capital English letters. */
export const NUMBER_RE = /^GEN-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}$/;

export const NUMBER_EXAMPLE = "GEN-NMPD-SSTI-FBDS";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Uniform random letters. Values at the top of the byte range are thrown away rather than folded
 * with %, which would quietly make the first few letters more likely than the rest.
 */
function randomLetters(count: number): string {
  const limit = 256 - (256 % LETTERS.length);
  let out = "";
  while (out.length < count) {
    const bytes = new Uint8Array(count - out.length + 8);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (out.length >= count) break;
      if (b >= limit) continue;
      out += LETTERS[b % LETTERS.length];
    }
  }
  return out;
}

/** A fresh random number such as `GEN-NMPD-SSTI-FBDS`. Not checked against existing ones. */
export function randomNumber(): string {
  return [NUMBER_PREFIX, randomLetters(4), randomLetters(4), randomLetters(4)].join("-");
}

/** How a typed number is read: spaces dropped, letters capitalised. */
export function tidyNumber(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/** `2026-10-31` -> `31102026`, the form the link carries. */
export function issueDateParam(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? "");
  return m ? `${m[3]}${m[2]}${m[1]}` : "";
}

export function buildVerifyUrl(hostname: string, number: string, issueDate: string): string {
  const params = new URLSearchParams({ attestation_number: number, issue_date: issueDateParam(issueDate) });
  return `https://${hostname}${VERIFY_PATH}?${params.toString()}`;
}
