import { qrToPathData } from "./new-m-qr";
import { verifyQr } from "./new-m-link";
import {
  cleanFill,
  cleanTextStyle,
  INK,
  inkAttrs,
  inkOf,
  NO_FILL,
  QR_PAPER,
  SERIF_STEPS,
  STYLE_KEYS,
  type StyleKey,
  type TextStyle,
} from "./sticker-style";

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
export const MIN_SIDE = 60;
export const MAX_SIDE = 12000;

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
  /** A font of its own; the rest are Georgia. */
  family?: string;
}

/** The 7-digit document number's font: bold, upright figures of even height, as on the super admin's sample. */
const NUMBER_FAMILY = "'Times New Roman', Times, 'Liberation Serif', Tinos, serif";

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
  /** The approving officer's name, under the designation; off until the super admin turns it on. */
  officerName: { x: 678.5, y: 538, size: 16, weight: "bold", anchor: "middle", maxWidth: 380 },
  /** The 7-digit document number on its own, with no words. Starts centred under the QR code; the super admin moves it. */
  docNumber: { x: 759.6, y: 334, size: 19, weight: "bold", anchor: "middle", maxWidth: 220, family: NUMBER_FAMILY },
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
 * their own. A set that has both a label and a value can be ungrouped, so the two move apart.
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
  { id: "officerName", name: "Approving officer's name" },
  { id: "docNumber", name: "Document number (7 digits)" },
  { id: "qr", name: "QR code" },
] as const;

export type StickerSetId = (typeof STICKER_SETS)[number]["id"];

/** The sets drawn in one piece, with no words of their own to ungroup from. */
export const WHOLE_SETS: ReadonlyArray<StickerSetId> = ["designation", "officerName", "docNumber"];
/** The sets that are pictures, not text: no boldness or colour. */
export const PICTURE_SETS: ReadonlyArray<StickerSetId> = ["signature", "qr"];
/** The sets a sticker leaves off until the super admin turns them on. */
export const OFF_UNTIL_ON: ReadonlyArray<StickerSetId> = ["officerName"];

/** Whether a set is on the sticker: as the super admin set it, or its own default. */
export function setShown(layout: StickerLayout | undefined, set: StickerSetId): boolean {
  return layout?.[set]?.show ?? !OFF_UNTIL_ON.includes(set);
}

/** The text halves of a set a style can be set for: its words and its value, or the whole of a one-piece set. */
export function styleKeys(set: StickerSetId): StyleKey[] {
  if (PICTURE_SETS.includes(set)) return [];
  return WHOLE_SETS.includes(set) ? ["whole"] : ["label", "value"];
}

/** The two halves of an ungrouped set: its fixed words, and the value written after or under them. */
export type SetPart = "label" | "value";
export const SET_PARTS: SetPart[] = ["label", "value"];

/** How far a set (or one half of it) was moved from its measured place, in sticker units. */
export interface SetOffset {
  dx: number;
  dy: number;
}

/** A half's own move, and its own size (1 = as made), set around its middle. */
export interface PartLayout extends SetOffset {
  scale?: number;
}

/**
 * How one set was moved, sized and written. dx/dy moves the whole set and scale sizes it around its
 * middle (1 = as made). Ungrouped (split), its label and its value are moved and sized each on its own,
 * by parts; grouped again, they keep where and how big they were made and move together. styles sets the
 * boldness and colour of its words and its value (or of a one-piece set); show turns it off or on; fill is
 * the colour behind the QR code ("none" for no colour).
 */
export interface SetLayout extends SetOffset {
  split?: boolean;
  scale?: number;
  parts?: Partial<Record<SetPart, PartLayout>>;
  styles?: Partial<Record<StyleKey, TextStyle>>;
  show?: boolean;
  fill?: string;
}

/** The smallest and largest a set or half may be made, against its size as made. */
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 3;

/** Only the sets that were moved, sized, restyled, ungrouped or turned off or on. */
export type StickerLayout = Partial<Record<StickerSetId, SetLayout>>;

/** The fixed words the app writes, reworded by the super admin for the sticker only, by piece id. */
export type StickerTexts = Partial<Record<string, string>>;

/** One run of fixed words the app writes on the sticker. */
export interface StickerPiece {
  id: string;
  set: StickerSetId;
  part: SetPart;
  /** The words as on the reference; the super admin can reword them (StickerTexts). */
  text: string;
  x: number;
  y: number;
  bold?: boolean;
}

/**
 * Labels in Georgia regular 19 px, black; "Pakistan" is bold, as on the reference. Baselines as measured.
 * "Pakistan" is fixed too, but it is Country's value, so it is the half that moves as the value.
 */
export const PIECES: StickerPiece[] = [
  { id: "country.number", text: "1", x: 88, y: 121, set: "country", part: "label" },
  { id: "country.label", text: "Country", x: 105, y: 121, set: "country", part: "label" },
  { id: "country.value", text: "Pakistan", x: 179, y: 121, bold: true, set: "country", part: "value" },
  { id: "documentType.label", text: "This Public Document", x: 293, y: 121, set: "documentType", part: "label" },
  { id: "issuingOffice.number", text: "2", x: 594, y: 121, set: "issuingOffice", part: "label" },
  { id: "issuingOffice.label", text: "at", x: 609, y: 121, set: "issuingOffice", part: "label" },
  { id: "dateLong.number", text: "3", x: 87, y: 202, set: "dateLong", part: "label" },
  { id: "dateLong.label", text: "the", x: 109, y: 202, set: "dateLong", part: "label" },
  { id: "issuingAuthority.number", text: "4", x: 86, y: 273, set: "issuingAuthority", part: "label" },
  { id: "issuingAuthority.label", text: "by", x: 108, y: 273, set: "issuingAuthority", part: "label" },
  { id: "number.number", text: "5", x: 86, y: 345, set: "number", part: "label" },
  { id: "number.label", text: "No.", x: 107, y: 345, set: "number", part: "label" },
  { id: "dateShort.label", text: "Date:", x: 88, y: 392, set: "dateShort", part: "label" },
];

/** A piece's words as the sticker writes them: reworded, or as on the reference. */
export function pieceText(piece: StickerPiece, texts: StickerTexts | undefined): string {
  const t = texts?.[piece.id];
  return typeof t === "string" ? t : piece.text;
}

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

export function fontFor(slot: TextSlot, size = slot.size, weight: string = slot.weight): string {
  return `${weight} ${size}px ${slot.family ?? FONT_FAMILY}`;
}

/** How a set's text is written as made: Georgia regular with a thin outline for the labels, values plain. */
function madeBold(slot: TextSlot): number {
  return slot.weight === "bold" ? 5 : 1;
}

/** The weight and outline a text is written with: as made, or at the boldness the super admin chose. */
function inkFor(made: { weight: "bold" | "normal"; outline: number }, level: number | undefined) {
  return level === undefined ? made : inkOf(SERIF_STEPS, level);
}

/** Width of a line of text in the browser, used to shrink a value that would overflow its cell. */
export type Measure = (text: string, font: string) => number;

function text(
  x: number,
  y: number,
  value: string,
  size: number,
  weight: string,
  opts: { anchor?: string; fill?: string; outline?: number; family?: string } = {},
): string {
  return (
    `<text x="${x}" y="${y}" font-family="${esc(opts.family ?? FONT_FAMILY)}" font-size="${size.toFixed(2)}" font-weight="${weight}"` +
    `${inkAttrs(opts.fill ?? INK, opts.outline ?? 0)} text-anchor="${opts.anchor ?? "start"}">${esc(value)}</text>`
  );
}

function valueEl(slot: TextSlot, value: string, measure: Measure, style?: TextStyle): string {
  const t = value.trim();
  if (!t) return "";
  const ink = inkFor({ weight: slot.weight, outline: 0 }, style?.bold);
  const width = measure(t, fontFor(slot, slot.size, ink.weight));
  const size = width > slot.maxWidth ? Math.max(MIN_FONT, (slot.size * slot.maxWidth) / width) : slot.size;
  return text(slot.x, slot.y, t, size, ink.weight, { anchor: slot.anchor, family: slot.family, fill: style?.color, outline: ink.outline });
}

/** Wraps a set's drawing (or one half of it) in its move, when it was moved. */
type Mover = (set: StickerSetId, part: SetPart | null, svg: string) => string;

/**
 * The labels, each as bold and in the colour the super admin set for its half of the set. The title bar
 * and table lines come with the background image; the app does not draw them.
 */
function frameEl(moved: Mover, texts: StickerTexts | undefined, layout: StickerLayout | undefined): string {
  const parts: string[] = [];
  for (const p of PIECES) {
    const words = pieceText(p, texts).trim();
    if (!words || !setShown(layout, p.set)) continue;
    const style = layout?.[p.set]?.styles?.[p.part];
    const ink = inkFor(p.bold ? { weight: "bold", outline: 0 } : { weight: "normal", outline: LABEL_OUTLINE }, style?.bold);
    parts.push(moved(p.set, p.part, text(p.x, p.y, words, 19, ink.weight, { fill: style?.color, outline: ink.outline })));
  }
  return parts.join("");
}

/** The boldness a piece of fixed words is written with as made: "Pakistan" bold, the labels regular with an outline. */
export function madeLabelBold(piece: StickerPiece): number {
  return piece.bold ? 5 : 2;
}

/** The boldness a set's half is written with as made, for the editor to start from. */
export function madeStyleBold(set: StickerSetId, key: StyleKey): number {
  if (key === "label") {
    const piece = PIECES.find((p) => p.set === set && p.part === "label");
    return piece ? madeLabelBold(piece) : 2;
  }
  if (set === "country") return 5;
  const slot = (SLOTS as Record<string, TextSlot>)[set];
  return slot ? madeBold(slot) : 5;
}

/**
 * The QR code in its square, on white, with its border when the app draws the frame. The saved code
 * (an SVG with a four-module margin) is used when it can be read; otherwise the same code is drawn
 * again from the link.
 */
function qrEl(savedSvg: string | null, url: string, withBorder: boolean, fill: string = QR_PAPER): string {
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
  // The colour behind the code, inside its border (white unless the super admin chose another, or none).
  const paper =
    fill === NO_FILL
      ? ""
      : `<rect x="${n(b.x + LINE)}" y="${n(b.y + LINE)}" width="${n(b.width - 2 * LINE)}" height="${n(b.height - 2 * LINE)}" fill="${fill}"/>`;
  return (
    paper +
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
  /** The fixed words the super admin reworded, for the sticker only; left out when none were. */
  texts?: StickerTexts;
  /** The sticker's own size, following the image; left out for the size every sticker had at first (STICKER_W x STICKER_H). */
  size?: StickerSize;
  /**
   * The page size, in points (1/72 inch), of the PDF the background was made from; left out for an image.
   * It gives the downloaded PDF sticker its real size: the background prints as large as its PDF page was.
   */
  pdfPage?: PdfPage;
}

/** A PDF page's width and height in points (1/72 inch). */
export interface PdfPage {
  width: number;
  height: number;
}

/** The largest page a PDF reader accepts (200 inches), in points. */
export const MAX_PDF_SIDE = 14400;
/** Points per sticker unit for a background that says nothing of its size: 96 units to the inch, as on screen. */
export const DEFAULT_POINTS_PER_UNIT = 0.75;

/** The placement with the PDF page its background came from, or with none for an image. */
export function withPdfPage(p: BackgroundPlacement, page: PdfPage | null | undefined): BackgroundPlacement {
  const rest = { ...p };
  delete rest.pdfPage;
  return page ? { ...rest, pdfPage: { width: n(page.width), height: n(page.height) } } : rest;
}

/**
 * How many points one sticker unit prints as. A background made from a PDF keeps that PDF's size (its page
 * spans the background's width on the sticker); an image prints at 96 units to the inch. Kept within what
 * a PDF page may measure.
 */
export function pointsPerUnit(p: BackgroundPlacement | null | undefined): number {
  const size = stickerSize(p);
  const raw = p?.pdfPage && p.width > 0 ? p.pdfPage.width / p.width : DEFAULT_POINTS_PER_UNIT;
  const most = MAX_PDF_SIDE / Math.max(size.width, size.height);
  return Math.min(Math.max(raw, 0.01), most);
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
function tidySet(set: StickerSetId, o: SetLayout | undefined): SetLayout | null {
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
  const styles: Partial<Record<StyleKey, TextStyle>> = {};
  for (const key of styleKeys(set)) {
    const st = cleanTextStyle(o.styles?.[key], madeStyleBold(set, key));
    if (st) styles[key] = st;
  }
  if (Object.keys(styles).length) out.styles = styles;
  const shown = o.show ?? !OFF_UNTIL_ON.includes(set);
  if (shown !== !OFF_UNTIL_ON.includes(set)) out.show = shown;
  if (set === "qr") {
    const fill = cleanFill(o.fill);
    if (fill) out.fill = fill;
  }
  return out.split || out.parts || moves(out) || sized(out) || out.styles || out.show !== undefined || out.fill ? out : null;
}

/** The placement with only the sets that were really moved or ungrouped, or with no layout when none were. */
export function withLayout(p: BackgroundPlacement, layout: StickerLayout): BackgroundPlacement {
  const rest = { ...p };
  delete rest.layout;
  const moved: StickerLayout = {};
  for (const [set, o] of Object.entries(layout) as Array<[StickerSetId, SetLayout | undefined]>) {
    const t = tidySet(set, o);
    if (t) moved[set] = t;
  }
  return Object.keys(moved).length ? { ...rest, layout: moved } : rest;
}

/** The placement with only the words that really differ from the reference, or with no texts when none do. */
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
    const sc = Math.round(scale * 1000) / 1000;
    if (sc !== 1) out.scale = sc;
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
    if (typeof raw.show === "boolean") entry.show = raw.show;
    if (raw.fill !== undefined && raw.fill !== null) {
      const fill = cleanFill(raw.fill);
      if (fill) entry.fill = fill;
    }
    if (raw.styles !== undefined && raw.styles !== null) {
      if (typeof raw.styles !== "object" || Array.isArray(raw.styles)) return null;
      const styles: Partial<Record<StyleKey, TextStyle>> = {};
      for (const [key, st] of Object.entries(raw.styles as Record<string, unknown>)) {
        if (!STYLE_KEYS.includes(key as StyleKey)) return null;
        const c = cleanTextStyle(st, madeStyleBold(set as StickerSetId, key as StyleKey));
        if (c) styles[key as StyleKey] = c;
      }
      if (Object.keys(styles).length) entry.styles = styles;
    }
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

/** A PDF page size sent or saved, or null when it is not a sane one. */
function cleanPdfPage(v: unknown): PdfPage | null {
  if (!v || typeof v !== "object") return null;
  const { width, height } = v as Record<string, unknown>;
  const ok = (k: unknown) => typeof k === "number" && Number.isFinite(k) && k >= 1 && k <= MAX_PDF_SIDE;
  return ok(width) && ok(height) ? { width: n(width as number), height: n(height as number) } : null;
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
  let pdfPage: PdfPage | null = null;
  if (raw.pdfPage !== undefined && raw.pdfPage !== null) {
    pdfPage = cleanPdfPage(raw.pdfPage);
    if (!pdfPage) return null;
  }
  const placed = withPdfPage(withSize(withTexts(withLayout(withCrop(p, crop), layout), texts), size), pdfPage);
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
  issuingOffice: string;
  /** `YYYY-MM-DD`. */
  issueDate: string;
  issuingAuthority: string;
  attestationNumber: string;
  designation: string;
  /** The approving officer's name, written only when the super admin turns it on. */
  officerName: string;
  /** The 7-digit document number, written on its own; empty for a document saved before it existed. */
  docNumber: string;
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
  /** The sticker's size; left out for STICKER_W x STICKER_H. */
  size?: StickerSize;
  /** The fixed words the super admin reworded; the rest read as on the reference. */
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

/**
 * The SVG transform for a move and a size: the size is set around the middle of r (where the thing is
 * drawn before this move), then the move is made. Empty when neither changes anything.
 */
function transformOf(o: PartLayout | undefined, r: Rect | null): string {
  if (!o) return "";
  const steps: string[] = [];
  if (o.dx || o.dy) steps.push(`translate(${n(o.dx)} ${n(o.dy)})`);
  const k = o.scale ?? 1;
  if (k !== 1 && r) {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    steps.push(`translate(${n(cx)} ${n(cy)}) scale(${k}) translate(${n(-cx)} ${n(-cy)})`);
  }
  return steps.join(" ");
}

function wrapIn(svg: string, transform: string): string {
  return transform ? `<g transform="${transform}">${svg}</g>` : svg;
}

/**
 * The frame, values, signature and QR code, drawn over the background: each set that is on, where it was
 * moved to, as big as it was made, and as bold and in the colour the super admin set.
 */
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
  const on = (set: StickerSetId) => setShown(input.layout, set);
  const styleOf = (set: StickerSetId, key: StyleKey) => input.layout?.[set]?.styles?.[key];
  const parts: string[] = [];
  if (input.drawFrame) parts.push(frameEl(moved, input.texts, input.layout));

  for (const [set, value] of valueTexts(input)) {
    if (!WHOLE_SETS.includes(set) && on(set)) parts.push(moved(set, "value", valueEl(SLOTS[set], value, measure, styleOf(set, "value"))));
  }

  if (input.signature && on("signature")) {
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
  for (const set of WHOLE_SETS) {
    const slot = SLOTS[set as keyof typeof SLOTS];
    if (on(set)) parts.push(moved(set, null, valueEl(slot, wholeText(input, set), measure, styleOf(set, "whole"))));
  }
  if (on("qr")) parts.push(moved("qr", null, qrEl(input.qrSvg, input.qrUrl, input.drawFrame, input.layout?.qr?.fill ?? QR_PAPER)));
  return parts.join("");
}

/** What a one-piece set writes. */
function wholeText(input: StickerValues, set: StickerSetId): string {
  return set === "designation" ? input.designation : set === "officerName" ? input.officerName : set === "docNumber" ? input.docNumber : "";
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
    ["officerName", input.officerName],
    ["docNumber", input.docNumber],
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
 * Where a set is drawn before any move. parts holds its label and its value apart (whichever are drawn);
 * a set with both can be ungrouped. A set drawn in one piece (signature, designation, QR code) has none.
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
 * A set with nothing drawn (the labels of a background that has them printed) has no box.
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

  if (input.drawFrame) {
    for (const p of PIECES) {
      const words = pieceText(p, input.texts).trim();
      if (words) add(p.set, p.part, textBox(p.x, p.y, 19, measure(words, `${p.bold ? "bold" : "normal"} 19px ${FONT_FAMILY}`), "start"));
    }
  }
  for (const [set, value] of valueTexts(input)) {
    const slot: TextSlot = SLOTS[set];
    const t = value.trim();
    // A value too wide for its cell is set smaller, so it never reaches past maxWidth.
    const width = t ? Math.min(measure(t, fontFor(slot)), slot.maxWidth) : 0;
    const part = WHOLE_SETS.includes(set) ? "whole" : "value";
    if (width) add(set, part, textBox(slot.x, slot.y, slot.size, width, slot.anchor));
    else blank[set] = textBox(slot.x, slot.y, slot.size, Math.min(EMPTY_VALUE_WIDTH, slot.maxWidth), slot.anchor);
  }
  add("signature", "whole", SIGNATURE_BOX);
  add("qr", "whole", QR_BORDER);

  const boxes: Partial<Record<StickerSetId, SetBoxes>> = {};
  for (const { id: set } of STICKER_SETS) {
    const d = drawn[set] ?? {};
    const empty = blank[set];
    if (d.whole) {
      boxes[set] = { whole: union(d.whole), parts: {} };
      continue;
    }
    if (WHOLE_SETS.includes(set)) {
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
    // A set with words keeps the box it always had; an empty value only fills in when it has none.
    const words = [label, d.value ? value : null].filter((r): r is Rect => Boolean(r));
    boxes[set] = { whole: union(words.length ? words : [value as Rect]), parts };
  }
  return boxes;
}

/** A rectangle made bigger or smaller round its middle. */
export function scaleRect(r: Rect, sc: number | undefined): Rect {
  const k = sc ?? 1;
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

/**
 * The area a grouped set is grabbed by: each half where its own move and size put it, before the set's
 * move. Without moved or sized halves this is the whole set.
 */
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

/** A sticker made the shape of its background: the background's place, the sticker's size, and the moved sets. */
export interface FittedSticker {
  /** Where the background sits, and what is cropped off it (unchanged). */
  placement: BackgroundPlacement;
  size: StickerSize;
  layout: StickerLayout;
}

/**
 * The sticker made the shape of its background image, with everything on it kept where it sits on the
 * background: a background stretched out of its proportions is put back in them (each set moves down or up
 * with the cell it sits in), and then the sticker becomes the part of the background shown on it, STICKER_W
 * wide (sets move and size with it). For a sticker made before stickers followed their background, and for
 * Match the image. boxes are the sets' boxes as drawn before any move (stickerSetBoxes).
 */
export function fitToBackground(
  p: BackgroundPlacement,
  image: { width: number; height: number },
  layout: StickerLayout,
  boxes: Partial<Record<StickerSetId, SetBoxes>>,
): FittedSticker {
  const size0 = stickerSize(p);
  const crop = p.crop;
  // 1. Back in proportion: only the height changes, everything on the sticker moving with it.
  const ky = image.width > 0 && image.height > 0 && p.height > 0 ? (p.width * image.height) / image.width / p.height : 1;
  let box = { x: p.x, y: p.y * ky, width: p.width, height: p.height * ky };
  const tall = { width: size0.width, height: size0.height * ky };
  const moved: StickerLayout = {};
  const centre = (set: StickerSetId) => {
    const b = boxes[set];
    if (!b) return null;
    const g = groupRect(b, layout[set]);
    return { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  };
  for (const { id } of STICKER_SETS) {
    const l = layout[id];
    const c = centre(id);
    if (!c) {
      if (l) moved[id] = { ...l };
      continue;
    }
    const dy = (c.y + (l?.dy ?? 0)) * ky - c.y;
    moved[id] = { ...(l ?? { dx: 0 }), dx: l?.dx ?? 0, dy };
  }
  // 2. The sticker becomes the part of the background shown on it, STICKER_W wide.
  const shown = visibleRect({ ...box, crop });
  const left = Math.max(0, shown.x);
  const top = Math.max(0, shown.y);
  const right = Math.min(tall.width, shown.x + shown.width);
  const bottom = Math.min(tall.height, shown.y + shown.height);
  if (right - left < 1 || bottom - top < 1) {
    return { placement: fitPlacement(image.width, image.height, sizeForImage(image.width, image.height)), size: sizeForImage(image.width, image.height), layout };
  }
  const k = STICKER_W / (right - left);
  const height = Math.min(MAX_SIDE, Math.max(MIN_SIDE, (bottom - top) * k));
  box = { x: (box.x - left) * k, y: (box.y - top) * k, width: box.width * k, height: box.height * k };
  const out: StickerLayout = {};
  for (const [set, l] of Object.entries(moved) as Array<[StickerSetId, SetLayout]>) {
    const c = centre(set);
    if (!c) {
      out[set] = l;
      continue;
    }
    const next: SetLayout = { ...l, dx: (c.x + l.dx - left) * k - c.x, dy: (c.y + l.dy - top) * k - c.y };
    const sc = Math.round((l.scale ?? 1) * k * 1000) / 1000;
    if (Math.abs(sc - 1) > 0.0005) next.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, sc));
    else delete next.scale;
    out[set] = next;
  }
  return { placement: crop ? { ...box, crop } : box, size: { width: STICKER_W, height }, layout: out };
}

