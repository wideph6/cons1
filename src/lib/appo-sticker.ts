import { qrToPathData } from "./appo-qr";
import { verifyQr } from "./appo-link";

/**
 * The Appo sticker, laid out on the same 958 x 761 grid as New M's. The background image the super
 * admin uploads carries the title bar, the table lines and any pattern; the app draws the rest so it
 * prints sharp at any size: the fixed words (numbers and labels), each document's values, the
 * officer's signature with their name under it, and the QR code (on white, with no line round it).
 * Text is Georgia, black: regular 19 px for the fixed words, bold 19 px for values, regular 16 px for
 * the name under the signature.
 *
 * Every part starts at the place below and can be moved by the super admin to fit the background:
 * a value with its words as a set, or each on its own once the set is ungrouped. The fixed words can
 * be reworded for the sticker; that is saved in the database with the background's position
 * (appo_settings.background_placement), never here. There is no sticker without a background image.
 */
export const STICKER_W = 958;
export const STICKER_H = 761;

/**
 * A sticker's own size, in sticker units. It follows the background image's shape: STICKER_W wide (so the
 * text keeps its size) and as tall as the image's proportions make it. Saved with the background's position;
 * a sticker saved before sizes existed is STICKER_W x STICKER_H.
 */
export interface StickerSize {
  width: number;
  height: number;
}
export const DEFAULT_SIZE: StickerSize = { width: STICKER_W, height: STICKER_H };
/** The narrowest/widest and shortest/tallest a sticker may be, in sticker units. */
export const MIN_SIDE = 150;
export const MAX_SIDE = 6000;

/** The sticker for an image of these pixels: STICKER_W wide and as tall as the image's proportions make it. */
export function sizeForImage(imageWidth: number, imageHeight: number): StickerSize {
  if (!imageWidth || !imageHeight) return { ...DEFAULT_SIZE };
  const height = Math.round((STICKER_W * imageHeight) / imageWidth);
  return { width: STICKER_W, height: Math.min(MAX_SIDE, Math.max(MIN_SIDE, height)) };
}

/** A placement's sticker size, or the size every sticker had before sizes could change. */
export function stickerSize(p: { size?: StickerSize } | null | undefined): StickerSize {
  return p?.size ?? DEFAULT_SIZE;
}

const FONT_FAMILY = "Georgia, Gelasio, 'Times New Roman', serif";
/** A value too long for its cell is set smaller rather than run into the next one, down to this size. */
const MIN_FONT = 10;
/** Room between a set's words and a value written on the same line after them. */
const AFTER_GAP = 9;

interface TextSlot {
  /** Where the text starts (or, centred, its middle) and its baseline. */
  x: number;
  y: number;
  size: number;
  weight: "bold" | "normal";
  anchor: "start" | "middle";
  /** Room before the cell's edge. */
  maxWidth: number;
  /**
   * A value on the same line as its words starts just after this piece of fixed words, wherever its
   * (reworded) words end; x is then only where it starts if those words are left empty. maxWidth
   * still runs from x, so the cell's right edge stays put.
   */
  after?: string;
}

/** Two lines: the words, then the value under them. One line: the value right after the words. */
export const SLOTS = {
  /** Under "Document Type". */
  documentType: { x: 330, y: 152, size: 19, weight: "bold", anchor: "start", maxWidth: 352 },
  /** Under "2 previously signed by". */
  signedBy: { x: 107, y: 225, size: 19, weight: "bold", anchor: "start", maxWidth: 575 },
  /** Under "3 previous Signed acting in capacity". */
  signedCapacity: { x: 107, y: 298, size: 19, weight: "bold", anchor: "start", maxWidth: 575 },
  /** Under "4 bears the seal or stamp". */
  sealStamp: { x: 107, y: 371, size: 19, weight: "bold", anchor: "start", maxWidth: 575 },
  /** After "5 office City". */
  officeCity: { x: 107, y: 422, size: 19, weight: "bold", anchor: "start", maxWidth: 575, after: "officeCity.label" },
  /** After "6 date", as "29th of October 2026". */
  dateLong: { x: 107, y: 464, size: 19, weight: "bold", anchor: "start", maxWidth: 575, after: "dateLong.label" },
  /** After "7 office Name". */
  officeName: { x: 107, y: 506, size: 19, weight: "bold", anchor: "start", maxWidth: 575, after: "officeName.label" },
  /** After "8 No", as APN-XXXX-XXXX-XXXX. */
  number: { x: 107, y: 548, size: 19, weight: "bold", anchor: "start", maxWidth: 575, after: "number.label" },
  /** After "Date:", as "29 Oct 2026". */
  dateShort: { x: 86, y: 604, size: 19, weight: "bold", anchor: "start", maxWidth: 470, after: "dateShort.label" },
  /** Centred under the signature: the approving officer's name. */
  officerName: { x: 730, y: 662, size: 16, weight: "normal", anchor: "middle", maxWidth: 380 },
} satisfies Record<string, TextSlot>;

/** The signature is fitted inside this box, centred, keeping its proportions. */
export const SIGNATURE_BOX = { x: 600, y: 578, width: 260, height: 62 };

/** The QR code's square: white, with no line round it. */
const QR_AREA = { x: 712, y: 178, width: 130, height: 130 };
/** White left round the code inside its square, so a phone camera finds its edges on any background. */
const QR_MARGIN = 5;
export const QR_BOX = {
  x: QR_AREA.x + QR_MARGIN,
  y: QR_AREA.y + QR_MARGIN,
  width: QR_AREA.width - 2 * QR_MARGIN,
  height: QR_AREA.height - 2 * QR_MARGIN,
};

/* ---------------- The fixed parts the app draws ---------------- */

/**
 * The parts of the sticker the super admin can move over the background: each value together with
 * its own words, the QR code, the signature and the officer's name. A set that has both words and a
 * value can be ungrouped, so the two move apart.
 */
export const STICKER_SETS = [
  { id: "country", name: "1 Country — Pakistan" },
  { id: "documentType", name: "Document Type" },
  { id: "signedBy", name: "2 previously signed by" },
  { id: "signedCapacity", name: "3 acting in capacity" },
  { id: "sealStamp", name: "4 bears the seal or stamp" },
  { id: "officeCity", name: "5 office City" },
  { id: "dateLong", name: "6 date" },
  { id: "officeName", name: "7 office Name" },
  { id: "number", name: "8 No" },
  { id: "dateShort", name: "Date:" },
  { id: "signature", name: "Signature" },
  { id: "officerName", name: "Officer's name" },
  { id: "qr", name: "QR code" },
] as const;

export type StickerSetId = (typeof STICKER_SETS)[number]["id"];

/** The two halves of an ungrouped set: its fixed words, and the value written after or under them. */
export type SetPart = "label" | "value";
export const SET_PARTS: SetPart[] = ["label", "value"];

/** How far a set (or one half of it) was moved from its first place, in sticker units. */
export interface SetOffset {
  dx: number;
  dy: number;
}

/** A half's own move, and its own size (1 = as made), set around its middle. */
export interface PartLayout extends SetOffset {
  scale?: number;
}

/**
 * How one set was moved and sized. dx/dy moves the whole set and scale sizes it around its middle
 * (1 = as made). Ungrouped (split), its words and its value are moved and sized each on its own, by
 * parts; grouped again, they keep where and how big they were made and move together.
 */
export interface SetLayout extends SetOffset {
  split?: boolean;
  scale?: number;
  parts?: Partial<Record<SetPart, PartLayout>>;
}

/** The smallest and largest a set or half may be made, against its size as made. */
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 3;

/** Only the sets that were moved or ungrouped. */
export type StickerLayout = Partial<Record<StickerSetId, SetLayout>>;

/** The fixed words the app writes, reworded by the super admin for the sticker only, by piece id. */
export type StickerTexts = Partial<Record<string, string>>;

/** One run of fixed words the app writes on the sticker. */
export interface StickerPiece {
  id: string;
  set: StickerSetId;
  part: SetPart;
  /** The words a new sticker starts with; the super admin can reword them (StickerTexts). */
  text: string;
  x: number;
  y: number;
  bold?: boolean;
}

/**
 * The numbers and words, regular 19 px; "Pakistan" is bold. The labels start with a small letter on
 * the sticker ("previously signed by"), as the super admin asked; the page spells them its own way.
 * "Pakistan" is fixed too, but it is Country's value, so it is the half that moves as the value.
 */
export const PIECES: StickerPiece[] = [
  { id: "country.number", text: "1", x: 86, y: 125, set: "country", part: "label" },
  { id: "country.label", text: "Country", x: 107, y: 125, set: "country", part: "label" },
  { id: "country.value", text: "Pakistan", x: 107, y: 152, bold: true, set: "country", part: "value" },
  { id: "documentType.label", text: "Document Type", x: 330, y: 125, set: "documentType", part: "label" },
  { id: "signedBy.number", text: "2", x: 86, y: 198, set: "signedBy", part: "label" },
  { id: "signedBy.label", text: "previously signed by", x: 107, y: 198, set: "signedBy", part: "label" },
  { id: "signedCapacity.number", text: "3", x: 86, y: 271, set: "signedCapacity", part: "label" },
  { id: "signedCapacity.label", text: "previous Signed acting in capacity", x: 107, y: 271, set: "signedCapacity", part: "label" },
  { id: "sealStamp.number", text: "4", x: 86, y: 344, set: "sealStamp", part: "label" },
  { id: "sealStamp.label", text: "bears the seal or stamp", x: 107, y: 344, set: "sealStamp", part: "label" },
  { id: "officeCity.number", text: "5", x: 86, y: 422, set: "officeCity", part: "label" },
  { id: "officeCity.label", text: "office City", x: 107, y: 422, set: "officeCity", part: "label" },
  { id: "dateLong.number", text: "6", x: 86, y: 464, set: "dateLong", part: "label" },
  { id: "dateLong.label", text: "date", x: 107, y: 464, set: "dateLong", part: "label" },
  { id: "officeName.number", text: "7", x: 86, y: 506, set: "officeName", part: "label" },
  { id: "officeName.label", text: "office Name", x: 107, y: 506, set: "officeName", part: "label" },
  { id: "number.number", text: "8", x: 86, y: 548, set: "number", part: "label" },
  { id: "number.label", text: "No", x: 107, y: 548, set: "number", part: "label" },
  { id: "dateShort.label", text: "Date:", x: 86, y: 604, set: "dateShort", part: "label" },
];

const PIECE_BY_ID: ReadonlyMap<string, StickerPiece> = new Map(PIECES.map((p) => [p.id, p]));

/** A piece's words as the sticker writes them: reworded, or as a new sticker starts. */
export function pieceText(piece: StickerPiece, texts: StickerTexts | undefined): string {
  const t = texts?.[piece.id];
  return typeof t === "string" ? t : piece.text;
}

/**
 * A thin outline on the regular words, so they read as firmly as the bold values beside them; values
 * and "Pakistan" are left as they are.
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

/** `2026-10-29` -> `29th of October 2026`. */
export function longDate(iso: string): string {
  const d = dateParts(iso);
  return d ? `${ordinal(d.day)} of ${MONTHS[d.month - 1]} ${d.year}` : "";
}

/** `2026-10-29` -> `29 Oct 2026`. */
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

const LABEL_FONT = `normal 19px ${FONT_FAMILY}`;

/** Width of a line of text in the browser, used to shrink a value that would overflow its cell. */
export type Measure = (text: string, font: string) => number;

/**
 * Where a value is written for this sticker: a value that follows its words starts where those
 * (reworded) words end, and loses that much room before the cell's edge.
 */
function placeSlot(slot: TextSlot, texts: StickerTexts | undefined, measure: Measure): TextSlot {
  const piece = slot.after ? PIECE_BY_ID.get(slot.after) : undefined;
  if (!piece) return slot;
  const words = pieceText(piece, texts).trim();
  if (!words) return slot;
  const x = piece.x + measure(words, LABEL_FONT) + AFTER_GAP;
  return { ...slot, x: n(x), maxWidth: Math.max(40, slot.maxWidth - (x - slot.x)) };
}

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

/** Wraps a set's drawing (or one half of it) in its move, when it was moved. */
type Mover = (set: StickerSetId, part: SetPart | null, svg: string) => string;

/** The fixed words. The title bar and table lines come with the background image; the app does not draw them. */
function frameEl(moved: Mover, texts: StickerTexts | undefined): string {
  const parts: string[] = [];
  for (const p of PIECES) {
    const words = pieceText(p, texts).trim();
    if (!words) continue;
    parts.push(
      moved(p.set, p.part, p.bold ? text(p.x, p.y, words, 19, "bold") : text(p.x, p.y, words, 19, "normal", { outline: LABEL_OUTLINE })),
    );
  }
  return parts.join("");
}

/**
 * The QR code on its white square, with no line round it. The saved code (an SVG with a four-module
 * margin) is used when it can be read; otherwise the same code is drawn again from the link.
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

  const a = QR_AREA;
  return (
    `<rect x="${n(a.x)}" y="${n(a.y)}" width="${n(a.width)}" height="${n(a.height)}" fill="#ffffff"/>` +
    `<svg x="${n(QR_BOX.x)}" y="${n(QR_BOX.y)}" width="${n(QR_BOX.width)}" height="${n(QR_BOX.height)}" viewBox="0 0 ${size} ${size}" ` +
    `preserveAspectRatio="none" shape-rendering="crispEdges"><path fill="#000000" d="${path}"/></svg>`
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
  /** The fixed words the super admin reworded, for the sticker only; left out when none were. */
  texts?: StickerTexts;
  /** The sticker's own size, following the image; left out for the size every sticker had at first (STICKER_W x STICKER_H). */
  size?: StickerSize;
}

/** No position saved: the image is stretched over the whole sticker. */
export const FULL_PLACEMENT: BackgroundPlacement = { x: 0, y: 0, width: STICKER_W, height: STICKER_H };

/** The image stretched over a whole sticker of this size. */
export function fullPlacement(size: StickerSize = DEFAULT_SIZE): BackgroundPlacement {
  return { x: 0, y: 0, width: size.width, height: size.height };
}

/** Cropping always leaves at least this share of the image across and down. */
export const MIN_KEEP = 0.02;
/** At least this much of the cropped image stays on the sticker, so it can always be grabbed again. */
const MIN_VISIBLE = 20;

/** The whole image as large as it fits on the sticker, centred, proportions kept. */
export function fitPlacement(imageWidth: number, imageHeight: number, size: StickerSize = DEFAULT_SIZE): BackgroundPlacement {
  const scale = Math.min(size.width / imageWidth, size.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height };
}

/** The placement with this sticker size, or with none when it is the size every sticker had at first. */
export function withSize(p: BackgroundPlacement, size: StickerSize): BackgroundPlacement {
  const rest = { ...p };
  delete rest.size;
  const same = Math.abs(size.width - STICKER_W) < 0.01 && Math.abs(size.height - STICKER_H) < 0.01;
  return same ? rest : { ...rest, size: { width: n(size.width), height: n(size.height) } };
}

/** The placement with this crop, or with none when nothing is cut off. Any layout, texts and size are left out. */
export function withCrop(p: BackgroundPlacement, crop: BackgroundCrop): BackgroundPlacement {
  const { x, y, width, height } = p;
  const cut = crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;
  return cut ? { x, y, width, height, crop: { ...crop } } : { x, y, width, height };
}

const moves = (o: SetOffset | undefined): boolean => Boolean(o && (o.dx !== 0 || o.dy !== 0));
const sized = (o: { scale?: number } | undefined): boolean => Boolean(o && o.scale !== undefined && o.scale !== 1);
/** Moved or sized: something that changes where or how big it is drawn. */
const changed = (o: PartLayout | undefined): boolean => moves(o) || sized(o);

/** A set's layout with nothing in it that does nothing, or null when it is left exactly as made. */
function tidySet(o: SetLayout | undefined): SetLayout | null {
  if (!o) return null;
  const parts = Object.fromEntries(
    SET_PARTS.filter((p) => changed(o.parts?.[p])).map((p) => {
      const pl = o.parts![p]!;
      return [p, sized(pl) ? { dx: pl.dx, dy: pl.dy, scale: pl.scale } : { dx: pl.dx, dy: pl.dy }];
    }),
  );
  const out: SetLayout = { dx: o.dx, dy: o.dy };
  if (o.split) out.split = true;
  if (sized(o)) out.scale = o.scale;
  if (Object.keys(parts).length) out.parts = parts;
  return out.split || out.parts || moves(out) || sized(out) ? out : null;
}

/** The placement with only the sets that were really moved or ungrouped, or with no layout when none were. */
export function withLayout(p: BackgroundPlacement, layout: StickerLayout): BackgroundPlacement {
  const rest = { ...p };
  delete rest.layout;
  const moved: StickerLayout = {};
  for (const [set, o] of Object.entries(layout) as Array<[StickerSetId, SetLayout | undefined]>) {
    const t = tidySet(o);
    if (t) moved[set] = t;
  }
  return Object.keys(moved).length ? { ...rest, layout: moved } : rest;
}

/** The placement with only the words that really differ from what a new sticker has, or with no texts when none do. */
export function withTexts(p: BackgroundPlacement, texts: StickerTexts): BackgroundPlacement {
  const rest = { ...p };
  delete rest.texts;
  const changed = Object.fromEntries(
    PIECES.filter((piece) => typeof texts[piece.id] === "string" && texts[piece.id] !== piece.text).map((piece) => [piece.id, texts[piece.id]]),
  ) as StickerTexts;
  return Object.keys(changed).length ? { ...rest, texts: changed } : rest;
}

const SET_IDS: ReadonlySet<string> = new Set(STICKER_SETS.map((s) => s.id));
const PIECE_IDS: ReadonlySet<string> = new Set(PIECES.map((p) => p.id));
/** The most a reworded piece may hold. */
export const MAX_PIECE_TEXT = 200;

/** A move by numbers no larger than the sticker itself, with a sane size if one is given, or null when it is not one. */
function cleanOffset(v: unknown): PartLayout | null {
  if (!v || typeof v !== "object") return null;
  const { dx, dy, scale } = v as Record<string, unknown>;
  if (typeof dx !== "number" || typeof dy !== "number" || !Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) > MAX_SIDE || Math.abs(dy) > MAX_SIDE) return null;
  const out: PartLayout = { dx: n(dx), dy: n(dy) };
  if (scale !== undefined) {
    if (typeof scale !== "number" || !Number.isFinite(scale) || scale < MIN_SCALE - 1e-9 || scale > MAX_SCALE + 1e-9) return null;
    const s = Math.round(scale * 1000) / 1000;
    if (s !== 1) out.scale = s;
  }
  return out;
}

/** Known sets, each moved (and its halves moved) by numbers no larger than the sticker itself, or null when it is not that. */
function cleanLayout(v: unknown): StickerLayout | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: StickerLayout = {};
  for (const [set, o] of Object.entries(v as Record<string, unknown>)) {
    if (!SET_IDS.has(set)) return null;
    const move = cleanOffset(o);
    if (!move) return null;
    const raw = o as Record<string, unknown>;
    const entry: SetLayout = { ...move };
    if (raw.split === true) entry.split = true;
    if (raw.parts !== undefined && raw.parts !== null) {
      if (typeof raw.parts !== "object" || Array.isArray(raw.parts)) return null;
      const parts: Partial<Record<SetPart, PartLayout>> = {};
      for (const [part, po] of Object.entries(raw.parts as Record<string, unknown>)) {
        const c = cleanOffset(po);
        if (!SET_PARTS.includes(part as SetPart) || !c) return null;
        parts[part as SetPart] = c;
      }
      if (Object.keys(parts).length) entry.parts = parts;
    }
    out[set as StickerSetId] = entry;
  }
  return out;
}

/** Known pieces, each with words of a sane length and no control characters, or null when it is not that. */
function cleanTexts(v: unknown): StickerTexts | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: StickerTexts = {};
  for (const [id, t] of Object.entries(v as Record<string, unknown>)) {
    if (!PIECE_IDS.has(id) || typeof t !== "string") return null;
    out[id] = t.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, MAX_PIECE_TEXT);
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
export function clampPlacement(p: BackgroundPlacement, size: StickerSize = stickerSize(p)): BackgroundPlacement {
  const v = visibleRect(p);
  const shift = (start: number, length: number, edge: number) =>
    start + length < MIN_VISIBLE ? MIN_VISIBLE - (start + length) : start > edge - MIN_VISIBLE ? edge - MIN_VISIBLE - start : 0;
  return { ...p, x: p.x + shift(v.x, v.width, size.width), y: p.y + shift(v.y, v.height, size.height) };
}

/** A sticker size sent or saved, or null when it is not a sane one. */
function cleanSize(v: unknown): StickerSize | null {
  if (!v || typeof v !== "object") return null;
  const { width, height } = v as Record<string, unknown>;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < MIN_SIDE || height < MIN_SIDE || width > MAX_SIDE || height > MAX_SIDE) return null;
  return { width: n(width), height: n(height) };
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
  let size = DEFAULT_SIZE;
  if (raw.size !== undefined && raw.size !== null) {
    const sz = cleanSize(raw.size);
    if (!sz) return null;
    size = sz;
  }
  if (p.width <= 0 || p.height <= 0 || p.width > 100 * size.width || p.height > 100 * size.height) return null;
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
  let texts: StickerTexts = {};
  if (raw.texts !== undefined && raw.texts !== null) {
    const t = cleanTexts(raw.texts);
    if (!t) return null;
    texts = t;
  }
  const placed = withSize(withTexts(withLayout(withCrop(p, crop), layout), texts), size);
  const s = visibleRect(placed);
  const onSticker = s.x < size.width && s.y < size.height && s.x + s.width > 0 && s.y + s.height > 0;
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
  signedBy: string;
  signedCapacity: string;
  sealStamp: string;
  officeCity: string;
  /** `YYYY-MM-DD`. */
  issueDate: string;
  officeName: string;
  attestationNumber: string;
  /** Written under the signature. */
  officerName: string;
  /** The signature as a data: URI, or null for none. */
  signature: string | null;
  /** The saved QR code, and the complete link it holds. */
  qrSvg: string | null;
  qrUrl: string;
}

export interface StickerContent extends StickerValues {
  /** Draw the fixed words. Off only for a background that already has them printed on it. */
  drawFrame: boolean;
  /** The sets the super admin moved; the rest stay where a new sticker puts them. */
  layout?: StickerLayout;
  /** The sticker's size; left out for STICKER_W x STICKER_H. */
  size?: StickerSize;
  /** The fixed words the super admin reworded; the rest read as a new sticker has them. */
  texts?: StickerTexts;
}

export interface StickerInput extends StickerContent {
  /** The background artwork as a data: URI; anything else would block the PNG export. */
  background: string;
  /** Where the background sits; null stretches it over the whole sticker. */
  placement: BackgroundPlacement | null;
}

function wrap(body: string, size: StickerSize): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.width}" ` +
    `height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">${body}</svg>`
  );
}

/** The sticker as one self-contained SVG, ready to show or to rasterise to PNG. */
export function buildStickerSvg(input: StickerInput, measure: Measure): string {
  const size = input.size ?? stickerSize(input.placement);
  return wrap(backgroundEl(input.background, input.placement ?? fullPlacement(size)) + contentEl(input, measure), size);
}

/** Everything but the background, for the editor that moves the background underneath it. */
export function buildStickerOverlaySvg(input: StickerContent, measure: Measure): string {
  return wrap(contentEl(input, measure), input.size ?? DEFAULT_SIZE);
}

/** How far a set's half is moved in all: the set's own move plus the half's. */
export function partShift(layout: StickerLayout | undefined, set: StickerSetId, part: SetPart | null): SetOffset {
  const o = layout?.[set];
  const p = part ? o?.parts?.[part] : undefined;
  return { dx: (o?.dx ?? 0) + (p?.dx ?? 0), dy: (o?.dy ?? 0) + (p?.dy ?? 0) };
}

/** The sets drawn in one piece: they have no words of their own to ungroup from. */
type WholeSet = "officerName";

/**
 * The SVG transform for a move and a size: the size is set around the middle of r (where the thing is
 * drawn before this move), then the move is made. Empty when neither changes anything.
 */
function transformOf(o: PartLayout | undefined, r: Rect | null): string {
  if (!o) return "";
  const steps: string[] = [];
  if (o.dx || o.dy) steps.push(`translate(${n(o.dx)} ${n(o.dy)})`);
  const s = o.scale ?? 1;
  if (s !== 1 && r) {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    steps.push(`translate(${n(cx)} ${n(cy)}) scale(${s}) translate(${n(-cx)} ${n(-cy)})`);
  }
  return steps.join(" ");
}

function wrapIn(svg: string, transform: string): string {
  return transform ? `<g transform="${transform}">${svg}</g>` : svg;
}

/** The fixed words, values, signature and QR code, drawn over the background, each set where it was moved to and as big as it was made. */
function contentEl(input: StickerContent, measure: Measure): string {
  // Where each set is drawn before any change: the middle that a size is set around.
  const boxes = input.layout && Object.keys(input.layout).length ? stickerSetBoxes(input, measure) : {};
  const moved: Mover = (set, part, svg) => {
    const l = input.layout?.[set];
    if (!svg || !l) return svg;
    const b = boxes[set];
    // A half's own move and size first, then the whole set's.
    const inner = part ? wrapIn(svg, transformOf(l.parts?.[part], b?.parts[part] ?? null)) : svg;
    return wrapIn(inner, transformOf(l, b ? groupRect(b, l) : null));
  };
  const parts: string[] = [];
  if (input.drawFrame) parts.push(frameEl(moved, input.texts));

  for (const [set, value] of valueTexts(input)) {
    if (set === "officerName") continue;
    parts.push(moved(set, "value", valueEl(placeSlot(SLOTS[set], input.texts, measure), value, measure)));
  }

  if (input.signature) {
    const b = SIGNATURE_BOX;
    parts.push(
      moved(
        "signature",
        null,
        `<image href="${input.signature}" xlink:href="${input.signature}" x="${b.x}" y="${b.y}" width="${b.width}" ` +
          `height="${b.height}" preserveAspectRatio="xMidYMid meet"/>`,
      ),
    );
  }
  parts.push(moved("officerName", null, valueEl(SLOTS.officerName, input.officerName, measure)));
  parts.push(moved("qr", null, qrEl(input.qrSvg, input.qrUrl)));
  return parts.join("");
}

/** Each value slot with the text it shows, in drawing order. */
function valueTexts(input: StickerValues): Array<[keyof typeof SLOTS, string]> {
  return [
    ["documentType", input.documentType],
    ["signedBy", input.signedBy],
    ["signedCapacity", input.signedCapacity],
    ["sealStamp", input.sealStamp],
    ["officeCity", input.officeCity],
    ["dateLong", longDate(input.issueDate)],
    ["officeName", input.officeName],
    ["number", input.attestationNumber],
    ["dateShort", shortDate(input.issueDate)],
    ["officerName", input.officerName],
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
 * Where a set is drawn before any move. parts holds its words and its value apart (whichever are drawn);
 * a set with both can be ungrouped. A set drawn in one piece (signature, officer's name, QR code) has none.
 */
export interface SetBoxes {
  /** The whole set: what a grouped set is grabbed by. */
  whole: Rect;
  parts: Partial<Record<SetPart, Rect>>;
}

function union(rects: Rect[]): Rect {
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.width));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function shiftRect(r: Rect, o: SetOffset): Rect {
  return { ...r, x: r.x + o.dx, y: r.y + o.dy };
}

/**
 * Each set's box where it is drawn before any move: the area the editor lets the super admin grab.
 * A set with nothing drawn (the words of a background that has them printed) has no box.
 */
export function stickerSetBoxes(input: StickerContent, measure: Measure): Partial<Record<StickerSetId, SetBoxes>> {
  const drawn: Partial<Record<StickerSetId, Partial<Record<SetPart | "whole", Rect[]>>>> = {};
  /** Values with nothing in them: grabbable on their own, but not widening a set that has words. */
  const blank: Partial<Record<StickerSetId, Rect>> = {};
  const add = (set: StickerSetId, part: SetPart | "whole", r: Rect) => ((drawn[set] ??= {})[part] ??= []).push(r);
  // From a little above the capitals to a little below the baseline.
  const textBox = (x: number, y: number, size: number, width: number, anchor: "start" | "middle"): Rect => ({
    x: anchor === "middle" ? x - width / 2 : x,
    y: y - size * 0.85,
    width,
    height: size * 1.1,
  });
  const whole: WholeSet[] = ["officerName"];

  if (input.drawFrame) {
    for (const p of PIECES) {
      const words = pieceText(p, input.texts).trim();
      if (words) add(p.set, p.part, textBox(p.x, p.y, 19, measure(words, `${p.bold ? "bold" : "normal"} 19px ${FONT_FAMILY}`), "start"));
    }
  }
  for (const [set, value] of valueTexts(input)) {
    const slot = placeSlot(SLOTS[set], input.texts, measure);
    const t = value.trim();
    // A value too wide for its cell is set smaller, so it never reaches past maxWidth.
    const width = t ? Math.min(measure(t, fontFor(slot)), slot.maxWidth) : 0;
    const part = (whole as string[]).includes(set) ? "whole" : "value";
    if (width) add(set, part, textBox(slot.x, slot.y, slot.size, width, slot.anchor));
    else blank[set] = textBox(slot.x, slot.y, slot.size, Math.min(EMPTY_VALUE_WIDTH, slot.maxWidth), slot.anchor);
  }
  add("signature", "whole", SIGNATURE_BOX);
  add("qr", "whole", QR_AREA);

  const boxes: Partial<Record<StickerSetId, SetBoxes>> = {};
  for (const { id: set } of STICKER_SETS) {
    const d = drawn[set] ?? {};
    const empty = blank[set];
    if (d.whole) {
      boxes[set] = { whole: union(d.whole), parts: {} };
      continue;
    }
    if ((whole as string[]).includes(set)) {
      if (empty) boxes[set] = { whole: empty, parts: {} };
      continue;
    }
    const label = d.label ? union(d.label) : null;
    const value = d.value ? union(d.value) : (empty ?? null);
    if (!label && !value) continue;
    // Each half that is drawn, so a half moved on its own is grabbed where it is; only a set with both
    // halves can be ungrouped.
    const parts: Partial<Record<SetPart, Rect>> = {};
    if (label) parts.label = label;
    if (value) parts.value = value;
    // A set with words keeps the box of its words and value; an empty value only fills in when it has none.
    const words = [label, d.value ? value : null].filter((r): r is Rect => Boolean(r));
    boxes[set] = { whole: union(words.length ? words : [value as Rect]), parts };
  }
  return boxes;
}

/**
 * The area a grouped set is grabbed by: each half where its own move put it, before the set's move.
 * Without moved halves this is the whole set.
 */
export function scaleRect(r: Rect, s: number | undefined): Rect {
  const k = s ?? 1;
  if (k === 1) return r;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return { x: cx - (r.width * k) / 2, y: cy - (r.height * k) / 2, width: r.width * k, height: r.height * k };
}

/** Where a half is drawn after its own move and size, before the whole set's. */
export function partLocalRect(b: SetBoxes, l: SetLayout | undefined, part: SetPart): Rect | null {
  const r = b.parts[part];
  if (!r) return null;
  const pl = l?.parts?.[part];
  return shiftRect(scaleRect(r, pl?.scale), pl ?? { dx: 0, dy: 0 });
}

/** The whole set's own move and size, applied to a rectangle of it (r), around the middle of the set (g). */
function setTransformRect(r: Rect, g: Rect, l: SetLayout | undefined): Rect {
  const k = l?.scale ?? 1;
  const cx = g.x + g.width / 2;
  const cy = g.y + g.height / 2;
  const scaled = k === 1 ? r : { x: cx + (r.x - cx) * k, y: cy + (r.y - cy) * k, width: r.width * k, height: r.height * k };
  return shiftRect(scaled, l ?? { dx: 0, dy: 0 });
}

/** Where a grouped set is drawn now, every move and size included: what it is grabbed by. */
export function shownGroupRect(b: SetBoxes, l: SetLayout | undefined): Rect {
  const g = groupRect(b, l);
  return setTransformRect(g, g, l);
}

/** Where one half of an ungrouped set is drawn now, every move and size included. */
export function shownPartRect(b: SetBoxes, l: SetLayout | undefined, part: SetPart): Rect | null {
  const r = partLocalRect(b, l, part);
  return r ? setTransformRect(r, groupRect(b, l), l) : null;
}

export function groupRect(b: SetBoxes, l: SetLayout | undefined): Rect {
  const moved = SET_PARTS.filter((p) => b.parts[p] && changed(l?.parts?.[p]));
  if (!moved.length) return b.whole;
  return union(SET_PARTS.map((p) => partLocalRect(b, l, p)).filter((r): r is Rect => Boolean(r)));
}

/** A move that keeps the set's box on the sticker. */
export function clampOffset(box: Rect, o: SetOffset, size: StickerSize = DEFAULT_SIZE): SetOffset {
  return {
    dx: Math.min(Math.max(o.dx, -box.x), size.width - box.x - box.width),
    dy: Math.min(Math.max(o.dy, -box.y), size.height - box.y - box.height),
  };
}
