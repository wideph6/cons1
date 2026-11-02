import { qrToPathData } from "./new-m-qr";
import { verifyQr } from "./new-m-link";

/**
 * The New M attestation sticker. Every position, size and weight below was measured off the
 * reference sticker (958 x 761 px). The background image carries only the faint pattern and the
 * Seal/Stamp cell; the app draws the rest itself so it prints sharp at any size: the title bar, the
 * table lines, the labels, the QR code's border, and each document's values. Text is Georgia, black:
 * regular 19 px for labels, bold 19 px for values, regular 16 px for the designation, and bold 31.5 px
 * white for the title. The background is laid on this grid where the super admin placed it (see
 * BackgroundPlacement); without a saved position it is stretched over the whole grid. There is no
 * sticker without a background image.
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
 * No white between the border and the code, as on the reference. The code reaches under the line,
 * which covers its outermost unit (about a third of a module), so each corner square's outer ring
 * still reads one module wide. With the line beside the code instead, ring and line read as 1.4
 * modules and scanners lose the code; under the line it scans better than with a gap.
 */
const QR_OVERLAP = 1;
export const QR_BOX = {
  x: QR_BORDER.x + LINE - QR_OVERLAP,
  y: QR_BORDER.y + LINE - QR_OVERLAP,
  width: QR_BORDER.width - 2 * (LINE - QR_OVERLAP),
  height: QR_BORDER.height - 2 * (LINE - QR_OVERLAP),
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
/**
 * A thin outline on the regular labels. Against the reference they came out lighter than the values
 * did (by ink and by stroke width), so they get a little more weight; values, "Pakistan" and the
 * title are left as they are.
 */
const LABEL_OUTLINE = 0.2;

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

function text(
  x: number,
  y: number,
  value: string,
  size: number,
  weight: "bold" | "normal",
  opts: { anchor?: string; fill?: string; outline?: number } = {},
): string {
  const fill = opts.fill ?? "#000000";
  const outline = opts.outline ? ` stroke="${fill}" stroke-width="${opts.outline}" stroke-linejoin="round"` : "";
  return (
    `<text x="${x}" y="${y}" font-family="${esc(FONT_FAMILY)}" font-size="${size.toFixed(2)}" font-weight="${weight}" ` +
    `fill="${fill}"${outline} text-anchor="${opts.anchor ?? "start"}">${esc(value)}</text>`
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
  for (const l of LABELS) {
    parts.push(l.bold ? text(l.x, l.y, l.text, 19, "bold") : text(l.x, l.y, l.text, 19, "normal", { outline: LABEL_OUTLINE }));
  }
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
  // White inside the border, the code, then the border drawn over the code's outer edge. A background
  // with its own border shows that border under the code's edge the same way.
  const border = withBorder
    ? `<rect x="${n(b.x + half)}" y="${n(b.y + half)}" width="${n(b.width - LINE)}" height="${n(b.height - LINE)}" fill="none" stroke="#000000" stroke-width="${LINE}"/>`
    : "";
  return (
    `<rect x="${n(b.x + LINE)}" y="${n(b.y + LINE)}" width="${n(b.width - 2 * LINE)}" height="${n(b.height - 2 * LINE)}" fill="#ffffff"/>` +
    `<svg x="${n(QR_BOX.x)}" y="${n(QR_BOX.y)}" width="${n(QR_BOX.width)}" height="${n(QR_BOX.height)}" viewBox="0 0 ${size} ${size}" ` +
    `preserveAspectRatio="none" shape-rendering="crispEdges"><path fill="#000000" d="${path}"/></svg>` +
    border
  );
}

/* ---------------- The background's position ---------------- */

/**
 * Where the background image sits on the sticker, in sticker units. It always covers the whole
 * sticker; whatever reaches past the edges is cropped. The values and QR code stay at their slots, so
 * moving or zooming the image is what lines its pattern and cells up under them.
 */
export interface BackgroundPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** No position saved: the image is stretched over the whole sticker. */
export const FULL_PLACEMENT: BackgroundPlacement = { x: 0, y: 0, width: STICKER_W, height: STICKER_H };

/** Rounding slack, so a saved position that sits exactly on an edge still counts as covering it. */
const EDGE = 0.5;

/** The smallest placement of an image of this size that covers the sticker, centred, proportions kept. */
export function coverPlacement(imageWidth: number, imageHeight: number): BackgroundPlacement {
  const scale = Math.max(STICKER_W / imageWidth, STICKER_H / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: (STICKER_W - width) / 2, y: (STICKER_H - height) / 2, width, height };
}

/** Moves a placement back so it covers the sticker, never leaving an edge uncovered. */
export function clampPlacement(p: BackgroundPlacement): BackgroundPlacement {
  return {
    x: Math.min(0, Math.max(STICKER_W - p.width, p.x)),
    y: Math.min(0, Math.max(STICKER_H - p.height, p.y)),
    width: p.width,
    height: p.height,
  };
}

/** A saved or sent placement, or null when it is not one: numbers, a sane size, and covering the sticker. */
export function cleanPlacement(v: unknown): BackgroundPlacement | null {
  if (!v || typeof v !== "object") return null;
  const { x, y, width, height } = v as Record<string, unknown>;
  const nums = [x, y, width, height];
  if (!nums.every((k) => typeof k === "number" && Number.isFinite(k))) return null;
  const p = { x: n(x as number), y: n(y as number), width: n(width as number), height: n(height as number) };
  if (p.width <= 0 || p.height <= 0 || p.width > 100 * STICKER_W || p.height > 100 * STICKER_H) return null;
  const covers = p.x <= EDGE && p.y <= EDGE && p.x + p.width >= STICKER_W - EDGE && p.y + p.height >= STICKER_H - EDGE;
  return covers ? p : null;
}

function backgroundEl(href: string, p: BackgroundPlacement): string {
  return (
    `<image href="${href}" xlink:href="${href}" x="${n(p.x)}" y="${n(p.y)}" width="${n(p.width)}" ` +
    `height="${n(p.height)}" preserveAspectRatio="none"/>`
  );
}

/* ---------------- The whole sticker ---------------- */

/** What one document puts on its sticker. */
export interface StickerValues {
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

export interface StickerContent extends StickerValues {
  /**
   * Draw the title bar, table lines, labels and QR border. Off only for a background that already has
   * them printed on it.
   */
  drawFrame: boolean;
}

export interface StickerInput extends StickerContent {
  /** The background artwork as a data: URI; anything else would block the PNG export. */
  background: string;
  /** Where the background sits; null stretches it over the whole sticker. */
  placement: BackgroundPlacement | null;
}

function wrap(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${STICKER_W}" ` +
    `height="${STICKER_H}" viewBox="0 0 ${STICKER_W} ${STICKER_H}">${body}</svg>`
  );
}

/** The sticker as one self-contained SVG, ready to show or to rasterise to PNG. */
export function buildStickerSvg(input: StickerInput, measure: Measure): string {
  return wrap(backgroundEl(input.background, input.placement ?? FULL_PLACEMENT) + contentEl(input, measure));
}

/** Everything but the background, for the editor that moves the background underneath it. */
export function buildStickerOverlaySvg(input: StickerContent, measure: Measure): string {
  return wrap(contentEl(input, measure));
}

/** The frame, values, signature and QR code, drawn over the background. */
function contentEl(input: StickerContent, measure: Measure): string {
  const parts: string[] = [];
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
  return parts.join("");
}
