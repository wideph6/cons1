import { encodeQr, qrToSvg, type QrMatrix } from "./new-m-qr";

/**
 * The New M verification link, its QR code and the attestation number. No server imports, so the
 * settings and upload forms check and preview exactly what the server will build.
 */

/**
 * Formulas a domain's link can carry. Each document fills in its own values: the attestation number
 * as `GEN-NMPD-SSTI-FBDS` and the issue date as DDMMYYYY.
 */
export const LINK_TOKENS = {
  number: "{attestation_number}",
  date: "{issue_date}",
} as const;

/** The link New M used before links were set per domain; offered as a starting point. */
export const STANDARD_TEMPLATE =
  "/verify-general-attestation-by-qr?attestation_number={attestation_number}&issue_date={issue_date}";

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

/** A document's complete link: https, its domain, then the domain's link with the formulas filled in. */
export function resolveLink(hostname: string, template: string, number: string, issueDate: string): string {
  const rest = template.split(LINK_TOKENS.number).join(number).split(LINK_TOKENS.date).join(issueDateParam(issueDate));
  return `https://${hostname}${rest}`;
}

/**
 * Checks a link typed in settings and returns it tidied: everything after the domain, starting with
 * "/", "?" or "#". A complete address on the same domain is accepted and trimmed back to that. Throws
 * an Error whose message the settings form can show as it is.
 */
export function cleanTemplate(input: string, hostname: string): string {
  let t = input.trim();
  if (!t) throw new Error("Enter the link");

  const full = /^https?:\/\/([^/?#]*)(.*)$/i.exec(t);
  if (full) {
    if (full[1].toLowerCase() !== hostname.toLowerCase()) {
      throw new Error(`This link belongs to ${hostname}. Type only what comes after the domain, e.g. /verify?…`);
    }
    t = full[2] || "/";
  }
  if (!/^[/?#]/.test(t)) t = `/${t}`;

  if (t.length > 500) throw new Error("The link is too long (max 500 characters)");
  if (/\s/.test(t)) throw new Error("The link cannot contain spaces");
  if (/[<>"\\^`|]/.test(t)) throw new Error('The link cannot contain < > " \\ ^ ` or |');

  for (const token of t.match(/\{[^{}]*\}/g) ?? []) {
    if (token !== LINK_TOKENS.number && token !== LINK_TOKENS.date) {
      throw new Error(`Unknown formula ${token}. Use ${LINK_TOKENS.number} or ${LINK_TOKENS.date}.`);
    }
  }
  if (/[{}]/.test(t.replace(/\{[^{}]*\}/g, ""))) throw new Error("A formula is missing its { or }");

  try {
    new URL(resolveLink(hostname, t, NUMBER_EXAMPLE, "2026-10-31"));
  } catch {
    throw new Error("That does not make a valid address");
  }
  return t;
}

/** Whether a link carries the attestation number. Without it, every document on the link shares one address. */
export function hasNumberToken(template: string): boolean {
  return template.includes(LINK_TOKENS.number);
}

/* ---------------- QR code ---------------- */

/**
 * Matched to the reference sticker: a plain QR with square modules and square finder eyes, black on
 * white, version 6 (41 x 41 modules) at error-correction level L. Version 6 is a floor, so a longer
 * link still fits, and every document's code comes out at the same density.
 */
export const QR_ECC = "L";
export const QR_MIN_VERSION = 6;
/** Standard white margin around the code, in modules, so a phone camera finds its edges. */
export const QR_QUIET_ZONE = 4;

/** Pixels per module in the stored code: a version 6 code with its margin comes to 490 px. */
export const QR_MODULE_PX = 10;

/** The code for a verification link. */
export function verifyQr(url: string): QrMatrix {
  return encodeQr(url, QR_ECC, QR_MIN_VERSION);
}

/**
 * The code as a standalone SVG, margin included. Sized in whole pixels per module so every module
 * lands on the pixel grid and stays crisp when rasterised. This is what each document stores.
 */
export function verifyQrSvg(url: string, modulePx = QR_MODULE_PX, quietZone = QR_QUIET_ZONE): string {
  const m = verifyQr(url);
  return qrToSvg(m, { size: (m.size + quietZone * 2) * modulePx, quietZone, idPrefix: "new-m-qr" });
}
