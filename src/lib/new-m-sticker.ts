import { qrToPathData } from "./new-m-qr";
import { verifyQr } from "./new-m-link";

/**
 * The New M attestation sticker: the background artwork with each document's values written into
 * it. Every position, size and weight below was measured off the reference sticker (958 x 761 px),
 * where the values are set in Georgia, black: bold 19 px for the values and regular 16 px for the
 * designation under the signature. The background is stretched to this grid, so a replacement
 * background of any size lines up as long as it keeps the same layout and proportions.
 */
export const STICKER_W = 958;
export const STICKER_H = 761;

const FONT_FAMILY = "Georgia, Gelasio, 'Times New Roman', serif";
/** A value too long for its cell is set smaller rather than run into the next one, down to this size. */
const MIN_FONT = 10;

interface TextSlot {
  /** Where the text starts (or, centred, its middle) and its baseline. */
  x: number;
  y: number;
  size: number;
  weight: "bold" | "normal";
  anchor: "start" | "middle";
  /** Room before the cell's edge. */
  maxWidth: number;
}

export const SLOTS = {
  /** Under "This Public Document". */
  documentType: { x: 294, y: 145, size: 19, weight: "bold", anchor: "start", maxWidth: 278 },
  /** Under "2 at". */
  issuingOffice: { x: 594, y: 145, size: 19, weight: "bold", anchor: "start", maxWidth: 278 },
  /** After "3 the", as "15th of October 2026". */
  dateLong: { x: 143, y: 202, size: 19, weight: "bold", anchor: "start", maxWidth: 487 },
  /** After "4 by". */
  issuingAuthority: { x: 133, y: 273, size: 19, weight: "bold", anchor: "start", maxWidth: 497 },
  /** After "5 No.". */
  number: { x: 141, y: 345, size: 19, weight: "bold", anchor: "start", maxWidth: 731 },
  /** After "Date:", as "15 Oct 2026". */
  dateShort: { x: 139, y: 392, size: 19, weight: "bold", anchor: "start", maxWidth: 733 },
  /** Centred under the signature. */
  designation: { x: 678.5, y: 515, size: 16, weight: "normal", anchor: "middle", maxWidth: 380 },
} satisfies Record<string, TextSlot>;

/** The signature is fitted inside this box, centred, keeping its proportions. */
export const SIGNATURE_BOX = { x: 548.5, y: 421, width: 260, height: 62 };
/** The QR code's own square, edge to edge, as on the reference. */
export const QR_BOX = { x: 694, y: 176, width: 132, height: 131 };
/** White behind the code, a little past its edge, so a phone finds it on any background. */
const QR_BACKING = { x: 690, y: 172, width: 140, height: 139 };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateParts(iso: string): { day: number; month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

export function ordinal(n: number): string {
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** `2026-10-15` -> `15th of October 2026`. */
export function longDate(iso: string): string {
  const d = dateParts(iso);
  return d ? `${ordinal(d.day)} of ${MONTHS[d.month - 1]} ${d.year}` : "";
}

/** `2026-10-15` -> `15 Oct 2026`. */
export function shortDate(iso: string): string {
  const d = dateParts(iso);
  return d ? `${d.day} ${MONTHS_SHORT[d.month - 1]} ${d.year}` : "";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function fontFor(slot: TextSlot, size = slot.size): string {
  return `${slot.weight === "bold" ? "bold" : "normal"} ${size}px ${FONT_FAMILY}`;
}

/** Width of a line of text in the browser, used to shrink a value that would overflow its cell. */
export type Measure = (text: string, font: string) => number;

function textEl(slot: TextSlot, value: string, measure: Measure): string {
  const text = value.trim();
  if (!text) return "";
  const width = measure(text, fontFor(slot));
  const size = width > slot.maxWidth ? Math.max(MIN_FONT, (slot.size * slot.maxWidth) / width) : slot.size;
  return (
    `<text x="${slot.x}" y="${slot.y}" font-family="${esc(FONT_FAMILY)}" font-size="${size.toFixed(2)}" ` +
    `font-weight="${slot.weight}" fill="#000000" text-anchor="${slot.anchor}">${esc(text)}</text>`
  );
}

/**
 * The QR code drawn into its square. The saved code (an SVG with a four-module margin) is used when it
 * can be read; otherwise the same code is drawn again from the link.
 */
function qrEl(savedSvg: string | null, url: string): string {
  let size: number | null = null;
  let path: string | null = null;
  const vb = savedSvg ? /viewBox="0 0 (\d+) \1"/.exec(savedSvg) : null;
  const quiet = savedSvg ? /translate\((\d+) \1\)/.exec(savedSvg) : null;
  const d = savedSvg ? / d="([^"]*)"/.exec(savedSvg) : null;
  if (vb && quiet && d) {
    size = Number(vb[1]) - 2 * Number(quiet[1]);
    path = d[1];
  } else if (url) {
    const m = verifyQr(url);
    size = m.size;
    path = qrToPathData(m);
  }
  if (!size || !path) return "";
  return (
    `<rect x="${QR_BACKING.x}" y="${QR_BACKING.y}" width="${QR_BACKING.width}" height="${QR_BACKING.height}" fill="#ffffff"/>` +
    `<svg x="${QR_BOX.x}" y="${QR_BOX.y}" width="${QR_BOX.width}" height="${QR_BOX.height}" viewBox="0 0 ${size} ${size}" ` +
    `preserveAspectRatio="none" shape-rendering="crispEdges"><path fill="#000000" d="${path}"/></svg>`
  );
}

export interface StickerInput {
  /** The background artwork as a data: URI; anything else would block the PNG export. */
  background: string | null;
  documentType: string;
  issuingOffice: string;
  /** `YYYY-MM-DD`. */
  issueDate: string;
  issuingAuthority: string;
  attestationNumber: string;
  designation: string;
  /** The signature as a data: URI, or null for none. */
  signature: string | null;
  /** The saved QR code, and the complete link it holds. */
  qrSvg: string | null;
  qrUrl: string;
}

/** The sticker as one self-contained SVG, ready to show or to rasterise to PNG. */
export function buildStickerSvg(input: StickerInput, measure: Measure): string {
  const parts: string[] = [];
  if (input.background) {
    parts.push(
      `<image href="${input.background}" xlink:href="${input.background}" x="0" y="0" width="${STICKER_W}" ` +
        `height="${STICKER_H}" preserveAspectRatio="none"/>`,
    );
  } else {
    parts.push(`<rect width="${STICKER_W}" height="${STICKER_H}" fill="#ffffff"/>`);
  }

  parts.push(textEl(SLOTS.documentType, input.documentType, measure));
  parts.push(textEl(SLOTS.issuingOffice, input.issuingOffice, measure));
  parts.push(textEl(SLOTS.dateLong, longDate(input.issueDate), measure));
  parts.push(textEl(SLOTS.issuingAuthority, input.issuingAuthority, measure));
  parts.push(textEl(SLOTS.number, input.attestationNumber, measure));
  parts.push(textEl(SLOTS.dateShort, shortDate(input.issueDate), measure));

  if (input.signature) {
    const b = SIGNATURE_BOX;
    parts.push(
      `<image href="${input.signature}" xlink:href="${input.signature}" x="${b.x}" y="${b.y}" width="${b.width}" ` +
        `height="${b.height}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  parts.push(textEl(SLOTS.designation, input.designation, measure));
  parts.push(qrEl(input.qrSvg, input.qrUrl));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${STICKER_W}" ` +
    `height="${STICKER_H}" viewBox="0 0 ${STICKER_W} ${STICKER_H}">${parts.join("")}</svg>`
  );
}
