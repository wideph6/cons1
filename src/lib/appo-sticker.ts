import { qrToPathData } from "./appo-qr";
import { verifyQr } from "./appo-link";

/**
 * The Appo attestation sticker. Every position, size and weight below was measured off the
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

/**
 * The parts of the sticker the super admin can move over the background: each value together with
 * its own label, the QR code together with its border, and the signature and the designation each on
 * their own.
 */
export const STICKER_SETS = [
  { id: "country", name: "1 Country Pakistan" },
  { id: "documentType", name: "Document type" },
  { id: "issuingOffice", name: "Issuing office (2 at)" },
  { id: "dateLong", name: "Date (3 the)" },
  { id: "issuingAuthority", name: "Issuing authority (4 by)" },
  { id: "number", name: "Number (5 No.)" },
  { id: "dateShort", name: "Date (Date:)" },
  { id: "signature", name: "Signature" },
  { id: "designation", name: "Designation" },
  { id: "qr", name: "QR code" },
] as const;

export type StickerSetId = (typeof STICKER_SETS)[number]["id"];

/** How far a set was moved from its measured place, in sticker units. */
export interface SetOffset {
  dx: number;
  dy: number;
}

/** Only the sets that were moved. */
export type StickerLayout = Partial<Record<StickerSetId, SetOffset>>;

/** Labels in Georgia regular 19 px, black; "Pakistan" is bold, as on the reference. Baselines as measured. */
const LABELS: Array<{ text: string; x: number; y: number; bold?: boolean; set: StickerSetId }> = [
  { text: "1", x: 88, y: 121, set: "country" },
  { text: "Country", x: 105, y: 121, set: "country" },
  { text: "Pakistan", x: 179, y: 121, bold: true, set: "country" },
  { text: "This Public Document", x: 293, y: 121, set: "documentType" },
  { text: "2", x: 594, y: 121, set: "issuingOffice" },
  { text: "at", x: 609, y: 121, set: "issuingOffice" },
  { text: "3", x: 87, y: 202, set: "dateLong" },
  { text: "the", x: 109, y: 202, set: "dateLong" },
  { text: "4", x: 86, y: 273, set: "issuingAuthority" },
  { text: "by", x: 108, y: 273, set: "issuingAuthority" },
  { text: "5", x: 86, y: 345, set: "number" },
  { text: "No.", x: 107, y: 345, set: "number" },
  { text: "Date:", x: 88, y: 392, set: "dateShort" },
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

/** Wraps a set's drawing in its move, when it was moved. */
type Mover = (set: StickerSetId, svg: string) => string;

/** The labels. The title bar and table lines come with the background image; the app does not draw them. */
function frameEl(moved: Mover): string {
  const parts: string[] = [];
  for (const l of LABELS) {
    parts.push(
      moved(l.set, l.bold ? text(l.x, l.y, l.text, 19, "bold") : text(l.x, l.y, l.text, 19, "normal", { outline: LABEL_OUTLINE })),
    );
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
  /** The values, labels and QR code the super admin moved to line up with this image; left out when none were. */
  layout?: StickerLayout;
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

/** The placement with this crop, or with none when nothing is cut off. Any layout is left out. */
export function withCrop(p: BackgroundPlacement, crop: BackgroundCrop): BackgroundPlacement {
  const { x, y, width, height } = p;
  const cut = crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;
  return cut ? { x, y, width, height, crop: { ...crop } } : { x, y, width, height };
}

/** The placement with only the sets that were really moved, or with no layout when none were. */
export function withLayout(p: BackgroundPlacement, layout: StickerLayout): BackgroundPlacement {
  const rest = { ...p };
  delete rest.layout;
  const moved = Object.fromEntries(Object.entries(layout).filter(([, o]) => o && (o.dx !== 0 || o.dy !== 0)));
  return Object.keys(moved).length ? { ...rest, layout: moved } : rest;
}

const SET_IDS: ReadonlySet<string> = new Set(STICKER_SETS.map((s) => s.id));

/** Known sets, each moved by numbers no larger than the sticker itself, or null when it is not that. */
function cleanLayout(v: unknown): StickerLayout | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: StickerLayout = {};
  for (const [set, o] of Object.entries(v as Record<string, unknown>)) {
    if (!SET_IDS.has(set) || !o || typeof o !== "object") return null;
    const { dx, dy } = o as Record<string, unknown>;
    if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    if (Math.abs(dx) > STICKER_W || Math.abs(dy) > STICKER_H) return null;
    out[set as StickerSetId] = { dx: n(dx), dy: n(dy) };
  }
  return out;
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
 * something, some of the image on the sticker, and moves only of known sets.
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
  let layout: StickerLayout = {};
  if (raw.layout !== undefined && raw.layout !== null) {
    const l = cleanLayout(raw.layout);
    if (!l) return null;
    layout = l;
  }
  const placed = withLayout(withCrop(p, crop), layout);
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
  /** The sets the super admin moved; the rest stay at their measured places. */
  layout?: StickerLayout;
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

/** The frame, values, signature and QR code, drawn over the background, each set where it was moved to. */
function contentEl(input: StickerContent, measure: Measure): string {
  const moved: Mover = (set, svg) => {
    const o = input.layout?.[set];
    return svg && o && (o.dx || o.dy) ? `<g transform="translate(${n(o.dx)} ${n(o.dy)})">${svg}</g>` : svg;
  };
  const parts: string[] = [];
  if (input.drawFrame) parts.push(frameEl(moved));

  for (const [set, value] of valueTexts(input)) {
    if (set !== "designation") parts.push(moved(set, valueEl(SLOTS[set], value, measure)));
  }

  if (input.signature) {
    const b = SIGNATURE_BOX;
    parts.push(
      moved(
        "signature",
        `<image href="${input.signature}" xlink:href="${input.signature}" x="${b.x}" y="${b.y}" width="${b.width}" ` +
          `height="${b.height}" preserveAspectRatio="xMidYMid meet"/>`,
      ),
    );
  }
  parts.push(moved("designation", valueEl(SLOTS.designation, input.designation, measure)));
  parts.push(moved("qr", qrEl(input.qrSvg, input.qrUrl, input.drawFrame)));
  return parts.join("");
}

/** Each value slot with the text it shows, in drawing order. */
function valueTexts(input: StickerValues): Array<[keyof typeof SLOTS, string]> {
  return [
    ["documentType", input.documentType],
    ["issuingOffice", input.issuingOffice],
    ["dateLong", longDate(input.issueDate)],
    ["issuingAuthority", input.issuingAuthority],
    ["number", input.attestationNumber],
    ["dateShort", shortDate(input.issueDate)],
    ["designation", input.designation],
  ];
}

/* ---------------- The movable sets ---------------- */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Room given to a value with nothing written in it, so its set can still be grabbed. */
const EMPTY_VALUE_WIDTH = 120;

/**
 * Each set's box where it is drawn before any move: the area the editor lets the super admin grab.
 * A set with nothing drawn (the labels of a background that has them printed) has no box.
 */
export function stickerSetBoxes(input: StickerContent, measure: Measure): Partial<Record<StickerSetId, Rect>> {
  const parts: Partial<Record<StickerSetId, Rect[]>> = {};
  const add = (set: StickerSetId, r: Rect) => (parts[set] ??= []).push(r);
  // From a little above the capitals to a little below the baseline.
  const textBox = (x: number, y: number, size: number, width: number, anchor: "start" | "middle"): Rect => ({
    x: anchor === "middle" ? x - width / 2 : x,
    y: y - size * 0.85,
    width,
    height: size * 1.1,
  });

  if (input.drawFrame) {
    for (const l of LABELS) add(l.set, textBox(l.x, l.y, 19, measure(l.text, `${l.bold ? "bold" : "normal"} 19px ${FONT_FAMILY}`), "start"));
  }
  for (const [set, value] of valueTexts(input)) {
    const slot: TextSlot = SLOTS[set];
    const t = value.trim();
    // A value too wide for its cell is set smaller, so it never reaches past maxWidth.
    const width = t ? Math.min(measure(t, fontFor(slot)), slot.maxWidth) : 0;
    if (width) add(set, textBox(slot.x, slot.y, slot.size, width, slot.anchor));
    else if (!parts[set]) add(set, textBox(slot.x, slot.y, slot.size, Math.min(EMPTY_VALUE_WIDTH, slot.maxWidth), slot.anchor));
  }
  add("signature", SIGNATURE_BOX);
  add("qr", QR_BORDER);

  const boxes: Partial<Record<StickerSetId, Rect>> = {};
  for (const [set, rects] of Object.entries(parts) as Array<[StickerSetId, Rect[]]>) {
    const x1 = Math.min(...rects.map((r) => r.x));
    const y1 = Math.min(...rects.map((r) => r.y));
    const x2 = Math.max(...rects.map((r) => r.x + r.width));
    const y2 = Math.max(...rects.map((r) => r.y + r.height));
    boxes[set] = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  return boxes;
}

/** A move that keeps the set's box on the sticker. */
export function clampOffset(box: Rect, o: SetOffset): SetOffset {
  return {
    dx: Math.min(Math.max(o.dx, -box.x), STICKER_W - box.x - box.width),
    dy: Math.min(Math.max(o.dy, -box.y), STICKER_H - box.y - box.height),
  };
}
