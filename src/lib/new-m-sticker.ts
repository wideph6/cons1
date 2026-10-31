import { qrToPathData } from "./new-m-qr";
import { verifyQr } from "./new-m-link";

/**
 * The New M attestation sticker. Every position, size and weight below was measured off the
 * reference sticker (958 x 761 px). The background image carries only the faint pattern and the
 * Seal/Stamp cell; the app draws the rest itself so it prints sharp at any size: the title bar, the
 * table lines, the labels, the QR code's border, and each document's values. Text is Georgia, black:
 * regular 19 px for labels, bold 19 px for values, regular 16 px for the designation, and bold 31.5 px
 * white for the title. The background is stretched to this grid, so a replacement of any size lines
 * up as long as it keeps the same proportions.
 */
export const STICKER_W = 958;
export const STICKER_H = 761;

const FONT_FAMILY = "Georgia, Gelasio, 'Times New Roman', serif";
/** A value too long for its cell is set smaller rather than run into the next one, down to this size. */
const MIN_FONT = 10;
/** Every table line and the QR border, as on the reference. */
const LINE = 1.4;

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

/** The QR code's border: a line round the code, as on the reference (outer edge 693.6–825.6 x 176.3–307.4). */
const QR_BORDER = { x: 693.6, y: 176.3, width: 132, height: 131.1 };
/**
 * The code sits inside the border with half a module of white between them. The reference has the
 * border touching the code, but then the corner squares merge with the line and scanners stop
 * recognising them; this gap keeps it readable and looks the same.
 */
const QR_GAP = 1.6;
export const QR_BOX = {
  x: QR_BORDER.x + LINE + QR_GAP,
  y: QR_BORDER.y + LINE + QR_GAP,
  width: QR_BORDER.width - 2 * (LINE + QR_GAP),
  height: QR_BORDER.height - 2 * (LINE + QR_GAP),
};

/* ---------------- The fixed parts the app draws ---------------- */

const TITLE_BAR = { x: 29.4, y: 19.2, width: 896.2, height: 54.5 };
const TITLE = { text: "GENERAL ATTESTATION", x: 477.5, y: 57.6, size: 31.5 };

/** Centres of the table lines. The outer frame runs 73.65–880.3 across and 90.7–528 down. */
const FRAME = { x1: 73.65, x2: 880.3, y1: 90.7, y2: 528 };
/** [x, from y, to y] */
const V_LINES: Array<[number, number, number]> = [
  [280.4, FRAME.y1, 169.5],
  [580.9, FRAME.y1, 169.5],
  [638.9, 169.5, 314.1],
  [477.6, 409.7, FRAME.y2],
];
/** [y, from x, to x] */
const H_LINES: Array<[number, number, number]> = [
  [169.5, FRAME.x1, FRAME.x2],
  [241.1, FRAME.x1, 638.9],
  [314.1, FRAME.x1, FRAME.x2],
  [361.9, FRAME.x1, FRAME.x2],
  [409.7, FRAME.x1, FRAME.x2],
];

/** Labels in Georgia regular 19 px, black; "Pakistan" is bold, as on the reference. Baselines as measured. */
const LABELS: Array<{ text: string; x: number; y: number; bold?: boolean }> = [
  { text: "1", x: 88, y: 121 },
  { text: "Country", x: 105, y: 121 },
  { text: "Pakistan", x: 179, y: 121, bold: true },
  { text: "This Public Document", x: 293, y: 121 },
  { text: "2", x: 594, y: 121 },
  { text: "at", x: 609, y: 121 },
  { text: "3", x: 87, y: 202 },
  { text: "the", x: 109, y: 202 },
  { text: "4", x: 86, y: 273 },
  { text: "by", x: 108, y: 273 },
  { text: "5", x: 86, y: 345 },
  { text: "No.", x: 107, y: 345 },
  { text: "Date:", x: 88, y: 392 },
];

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

/** A computed coordinate, without the floating-point tail (694.3000000000001 -> 694.3). */
function n(v: number): number {
  return Math.round(v * 100) / 100;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function fontFor(slot: TextSlot, size = slot.size): string {
  return `${slot.weight === "bold" ? "bold" : "normal"} ${size}px ${FONT_FAMILY}`;
}

/** Width of a line of text in the browser, used to shrink a value that would overflow its cell. */
export type Measure = (text: string, font: string) => number;

function text(x: number, y: number, value: string, size: number, weight: "bold" | "normal", opts: { anchor?: string; fill?: string } = {}): string {
  return (
    `<text x="${x}" y="${y}" font-family="${esc(FONT_FAMILY)}" font-size="${size.toFixed(2)}" font-weight="${weight}" ` +
    `fill="${opts.fill ?? "#000000"}" text-anchor="${opts.anchor ?? "start"}">${esc(value)}</text>`
  );
}

function valueEl(slot: TextSlot, value: string, measure: Measure): string {
  const t = value.trim();
  if (!t) return "";
  const width = measure(t, fontFor(slot));
  const size = width > slot.maxWidth ? Math.max(MIN_FONT, (slot.size * slot.maxWidth) / width) : slot.size;
  return text(slot.x, slot.y, t, size, slot.weight, { anchor: slot.anchor });
}

/** Title bar, table lines and labels — what the background no longer carries. */
function frameEl(): string {
  const parts: string[] = [];
  parts.push(`<rect x="${TITLE_BAR.x}" y="${TITLE_BAR.y}" width="${TITLE_BAR.width}" height="${TITLE_BAR.height}" fill="#000000"/>`);
  parts.push(text(TITLE.x, TITLE.y, TITLE.text, TITLE.size, "bold", { anchor: "middle", fill: "#ffffff" }));
  parts.push(
    `<rect x="${FRAME.x1}" y="${FRAME.y1}" width="${(FRAME.x2 - FRAME.x1).toFixed(2)}" height="${(FRAME.y2 - FRAME.y1).toFixed(2)}" ` +
      `fill="none" stroke="#000000" stroke-width="${LINE}"/>`,
  );
  for (const [x, y1, y2] of V_LINES) parts.push(`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#000000" stroke-width="${LINE}"/>`);
  for (const [y, x1, x2] of H_LINES) parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#000000" stroke-width="${LINE}"/>`);
  for (const l of LABELS) parts.push(text(l.x, l.y, l.text, 19, l.bold ? "bold" : "normal"));
  return parts.join("");
}

/**
 * The QR code in its square, on white, with its border when the app draws the frame. The saved code
 * (an SVG with a four-module margin) is used when it can be read; otherwise the same code is drawn
 * again from the link.
 */
function qrEl(savedSvg: string | null, url: string, withBorder: boolean): string {
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

  const b = QR_BORDER;
  const half = LINE / 2;
  // The border's own rectangle doubles as the code's white backing.
  const backing = withBorder
    ? `<rect x="${n(b.x + half)}" y="${n(b.y + half)}" width="${n(b.width - LINE)}" height="${n(b.height - LINE)}" fill="#ffffff" stroke="#000000" stroke-width="${LINE}"/>`
    : `<rect x="${n(b.x + LINE)}" y="${n(b.y + LINE)}" width="${n(b.width - 2 * LINE)}" height="${n(b.height - 2 * LINE)}" fill="#ffffff"/>`;
  return (
    backing +
    `<svg x="${n(QR_BOX.x)}" y="${n(QR_BOX.y)}" width="${n(QR_BOX.width)}" height="${n(QR_BOX.height)}" viewBox="0 0 ${size} ${size}" ` +
    `preserveAspectRatio="none" shape-rendering="crispEdges"><path fill="#000000" d="${path}"/></svg>`
  );
}

export interface StickerInput {
  /** The background artwork as a data: URI; anything else would block the PNG export. */
  background: string | null;
  /**
   * Draw the title bar, table lines, labels and QR border. Off only for a background that already has
   * them printed on it.
   */
  drawFrame: boolean;
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
  if (input.drawFrame) parts.push(frameEl());

  parts.push(valueEl(SLOTS.documentType, input.documentType, measure));
  parts.push(valueEl(SLOTS.issuingOffice, input.issuingOffice, measure));
  parts.push(valueEl(SLOTS.dateLong, longDate(input.issueDate), measure));
  parts.push(valueEl(SLOTS.issuingAuthority, input.issuingAuthority, measure));
  parts.push(valueEl(SLOTS.number, input.attestationNumber, measure));
  parts.push(valueEl(SLOTS.dateShort, shortDate(input.issueDate), measure));

  if (input.signature) {
    const b = SIGNATURE_BOX;
    parts.push(
      `<image href="${input.signature}" xlink:href="${input.signature}" x="${b.x}" y="${b.y}" width="${b.width}" ` +
        `height="${b.height}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  parts.push(valueEl(SLOTS.designation, input.designation, measure));
  parts.push(qrEl(input.qrSvg, input.qrUrl, input.drawFrame));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${STICKER_W}" ` +
    `height="${STICKER_H}" viewBox="0 0 ${STICKER_W} ${STICKER_H}">${parts.join("")}</svg>`
  );
}
