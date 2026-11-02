import { qrToPathData } from "./new-m-qr";
import { verifyQr } from "./new-m-link";

/**
 * The New M attestation sticker. Every position, size and weight below was measured off the
 * reference sticker (958 x 761 px). The background image carries the title bar, the table lines, the
 * faint pattern and the Seal/Stamp cell; the app draws the rest so it prints sharp at any size: the
 * labels, the QR code's border, and each document's values. Text is Georgia, black: regular 19 px for
 * labels, bold 19 px for values, regular 16 px for the designation. The background is laid on this
 * grid where the super admin placed and cropped it (see BackgroundPlacement); without a saved position
 * it is stretched over the whole grid. There is no sticker without a background image.
 */
export const STICKER_W = 958;
export const STICKER_H = 761;

const FONT_FAMILY = "Georgia, Gelasio, 'Times New Roman', serif";
/** A value too long for its cell is set smaller rather than run into the next one, down to this size. */
const MIN_FONT = 10;
/** The QR border, as on the reference. */
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
 * did (by ink and by stroke width), so they get a little more weight; values and "Pakistan" are left
 * as they are.
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

/** The labels. The title bar and table lines come with the background image; the app does not draw them. */
function frameEl(): string {
  const parts: string[] = [];
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

/** What is cut off each side of the background image, as a share of its width or height (0 to 1). */
export interface BackgroundCrop {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_CROP: BackgroundCrop = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Where the background image sits on the sticker, in sticker units, and what is cropped off it. It can
 * sit anywhere, at any size; the values and QR code stay at their slots, so moving, zooming and
 * cropping the image is what lines its cells up under them. Whatever reaches past the sticker's edges
 * is cut off as well.
 */
export interface BackgroundPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Left out when nothing is cropped. */
  crop?: BackgroundCrop;
}

/** No position saved: the image is stretched over the whole sticker. */
export const FULL_PLACEMENT: BackgroundPlacement = { x: 0, y: 0, width: STICKER_W, height: STICKER_H };

/** Cropping always leaves at least this share of the image across and down. */
export const MIN_KEEP = 0.02;
/** At least this much of the cropped image stays on the sticker, so it can always be grabbed again. */
const MIN_VISIBLE = 20;

/** The whole image as large as it fits on the sticker, centred, proportions kept. */
export function fitPlacement(imageWidth: number, imageHeight: number): BackgroundPlacement {
  const scale = Math.min(STICKER_W / imageWidth, STICKER_H / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: (STICKER_W - width) / 2, y: (STICKER_H - height) / 2, width, height };
}

/** The placement with this crop, or with none when nothing is cut off. */
export function withCrop(p: BackgroundPlacement, crop: BackgroundCrop): BackgroundPlacement {
  const { x, y, width, height } = p;
  const cut = crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;
  return cut ? { x, y, width, height, crop: { ...crop } } : { x, y, width, height };
}

/** The part of the sticker the cropped image covers (it may reach past the sticker's edges). */
export function visibleRect(p: BackgroundPlacement): { x: number; y: number; width: number; height: number } {
  const c = p.crop ?? NO_CROP;
  return {
    x: p.x + c.left * p.width,
    y: p.y + c.top * p.height,
    width: p.width * (1 - c.left - c.right),
    height: p.height * (1 - c.top - c.bottom),
  };
}

/** Moves a placement back when it was dragged so far that almost none of the cropped image is left on the sticker. */
export function clampPlacement(p: BackgroundPlacement): BackgroundPlacement {
  const v = visibleRect(p);
  const shift = (start: number, size: number, edge: number) =>
    start + size < MIN_VISIBLE ? MIN_VISIBLE - (start + size) : start > edge - MIN_VISIBLE ? edge - MIN_VISIBLE - start : 0;
  return { ...p, x: p.x + shift(v.x, v.width, STICKER_W), y: p.y + shift(v.y, v.height, STICKER_H) };
}

/** Four shares between 0 and 1 that leave something of the image, or null when they are not. */
function cleanCrop(v: unknown): BackgroundCrop | null {
  if (!v || typeof v !== "object") return null;
  const raw = v as Record<string, unknown>;
  const sides = ["top", "right", "bottom", "left"] as const;
  if (!sides.every((s) => typeof raw[s] === "number" && Number.isFinite(raw[s]) && raw[s] >= 0 && raw[s] < 1)) return null;
  const c = Object.fromEntries(sides.map((s) => [s, Math.round((raw[s] as number) * 10000) / 10000])) as unknown as BackgroundCrop;
  // A hair of slack, as the browser's sums of shares are not exact.
  if (c.left + c.right > 1 - MIN_KEEP + 1e-6 || c.top + c.bottom > 1 - MIN_KEEP + 1e-6) return null;
  return c;
}

/**
 * A saved or sent placement, or null when it is not one: numbers, a sane size, a crop that leaves
 * something, and some of the image on the sticker.
 */
export function cleanPlacement(v: unknown): BackgroundPlacement | null {
  if (!v || typeof v !== "object") return null;
  const raw = v as Record<string, unknown>;
  const { x, y, width, height } = raw;
  const nums = [x, y, width, height];
  if (!nums.every((k) => typeof k === "number" && Number.isFinite(k))) return null;
  const p = { x: n(x as number), y: n(y as number), width: n(width as number), height: n(height as number) };
  if (p.width <= 0 || p.height <= 0 || p.width > 100 * STICKER_W || p.height > 100 * STICKER_H) return null;
  let crop = NO_CROP;
  if (raw.crop !== undefined && raw.crop !== null) {
    const c = cleanCrop(raw.crop);
    if (!c) return null;
    crop = c;
  }
  const placed = withCrop(p, crop);
  const s = visibleRect(placed);
  const onSticker = s.x < STICKER_W && s.y < STICKER_H && s.x + s.width > 0 && s.y + s.height > 0;
  return onSticker ? placed : null;
}

function backgroundEl(href: string, p: BackgroundPlacement): string {
  const image =
    `<image href="${href}" xlink:href="${href}" x="${n(p.x)}" y="${n(p.y)}" width="${n(p.width)}" ` +
    `height="${n(p.height)}" preserveAspectRatio="none"/>`;
  if (!p.crop) return image;
  const v = visibleRect(p);
  return (
    `<defs><clipPath id="background-crop"><rect x="${n(v.x)}" y="${n(v.y)}" width="${n(v.width)}" height="${n(v.height)}"/>` +
    `</clipPath></defs><g clip-path="url(#background-crop)">${image}</g>`
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
  /** Draw the labels and the QR border. Off only for a background that already has them printed on it. */
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
