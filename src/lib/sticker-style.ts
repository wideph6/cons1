/**
 * How each text on a sticker (New M's and Appo's alike) is written, as the super admin set it in the
 * background editor: its boldness and its colour. Saved with the sticker's layout, per set and per half
 * (the fixed words, the value, or a set written in one piece), in the database with the background's
 * position; nothing of it lives in the app's code.
 *
 * Boldness goes in nine steps, from the font's regular to its heaviest. A font has only so many weights,
 * so a step is a weight the font has plus, where needed, a thin outline in the text's own colour; that
 * way every font goes from light to heavy in even steps, and the sticker is drawn the same everywhere.
 */

/** A text half's look. Left out: as the sticker was made. */
export interface TextStyle {
  /** Boldness, BOLD_MIN (lightest) to BOLD_MAX (heaviest). */
  bold?: number;
  /** #rrggbb. */
  color?: string;
}

/** Which text of a set a style is for: its fixed words, its value, or the whole of a one-piece set. */
export type StyleKey = "label" | "value" | "whole";
export const STYLE_KEYS: StyleKey[] = ["label", "value", "whole"];

export const BOLD_MIN = 1;
export const BOLD_MAX = 9;
export const BOLD_NAMES = ["Light", "Light +", "Regular", "Regular +", "Bold", "Bold +", "Heavy", "Heavy +", "Black"];

/** The colour text is written in, unless the super admin chose another. */
export const INK = "#000000";
/** The colour behind the QR code, unless the super admin chose another or none. */
export const QR_PAPER = "#ffffff";
/** No colour behind the QR code: the background image shows through. */
export const NO_FILL = "none";

/** One boldness step: the font weight to ask for, and an outline (in sticker units) drawn in the text's colour. */
export interface Ink {
  weight: string;
  outline: number;
}

/**
 * Georgia and Times New Roman come in regular and bold only, so the steps between are drawn with an outline.
 * Step 2 is how the sticker writes its regular labels (regular with a 0.2 outline), step 5 its bold values.
 */
export const SERIF_STEPS: Ink[] = [
  { weight: "normal", outline: 0 },
  { weight: "normal", outline: 0.2 },
  { weight: "normal", outline: 0.45 },
  { weight: "normal", outline: 0.7 },
  { weight: "bold", outline: 0 },
  { weight: "bold", outline: 0.3 },
  { weight: "bold", outline: 0.6 },
  { weight: "bold", outline: 0.9 },
  { weight: "bold", outline: 1.2 },
];

/** Poppins comes in 400 to 800 (each carried inside the sticker); step 3 is SemiBold, how Appo writes its values. */
export const POPPINS_STEPS: Ink[] = [
  { weight: "400", outline: 0 },
  { weight: "500", outline: 0 },
  { weight: "600", outline: 0 },
  { weight: "600", outline: 0.3 },
  { weight: "700", outline: 0 },
  { weight: "700", outline: 0.35 },
  { weight: "800", outline: 0 },
  { weight: "800", outline: 0.4 },
  { weight: "800", outline: 0.8 },
];

/** A step as given, kept within the scale. */
export function clampBold(v: number): number {
  return Math.min(BOLD_MAX, Math.max(BOLD_MIN, Math.round(v)));
}

/** The ink of a step on a font's ladder. */
export function inkOf(steps: Ink[], level: number): Ink {
  return steps[clampBold(level) - 1];
}

/** A colour as #rrggbb (lower case), or null when it is not one. */
export function cleanColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(c) ? c : null;
}

/** A text style as sent or saved: a step and a colour that make sense, and only what differs from as made. */
export function cleanTextStyle(v: unknown, designBold: number): TextStyle | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: TextStyle = {};
  if (typeof o.bold === "number" && Number.isFinite(o.bold)) {
    const b = clampBold(o.bold);
    if (b !== designBold) out.bold = b;
  }
  const color = cleanColor(o.color);
  if (color && color !== INK) out.color = color;
  return Object.keys(out).length ? out : null;
}

/** The colour behind the QR code as sent or saved: a colour, or "none"; null for the usual white. */
export function cleanFill(v: unknown): string | null {
  if (v === NO_FILL) return NO_FILL;
  const c = cleanColor(v);
  return c && c !== QR_PAPER ? c : null;
}

/** The line round the QR code as New M draws it, in sticker units; a line the super admin turns on starts this thick. */
export const QR_LINE = 1.4;
/** The thinnest and thickest line round the QR code the super admin may set, in sticker units. */
export const MIN_QR_LINE = 0.5;
export const MAX_QR_LINE = 10;

/** The line round the QR code as sent or saved: its thickness to a tenth (0 for no line), or null when it is not one. */
export function cleanQrLine(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_QR_LINE + 1e-9) return null;
  const t = Math.round(v * 10) / 10;
  return t > 0 && t < MIN_QR_LINE ? MIN_QR_LINE : t;
}

/** How far a line of thickness t round the QR code reaches out past the edge of its square. */
export function qrLineReach(t: number): number {
  return Math.max(0, t - QR_LINE);
}

/**
 * A black line of thickness t round the QR code's square b, drawn over what is under it. Up to QR_LINE thick it
 * lies just inside b's edge, where New M's line has always been; thicker, it keeps that line's inner edge and
 * grows outward, so it never covers more of the code than the line as made. Nothing for no line.
 */
export function qrLineSvg(b: { x: number; y: number; width: number; height: number }, t: number): string {
  if (!(t > 0)) return "";
  const r = (v: number) => Math.round(v * 100) / 100;
  const out = qrLineReach(t);
  return (
    `<rect x="${r(b.x - out + t / 2)}" y="${r(b.y - out + t / 2)}" width="${r(b.width + 2 * out - t)}" ` +
    `height="${r(b.height + 2 * out - t)}" fill="none" stroke="#000000" stroke-width="${r(t)}"/>`
  );
}

/** SVG attributes that write text in a colour with an outline of the same colour (none when it has no outline). */
export function inkAttrs(fill: string, outline: number): string {
  const o = outline > 0 ? ` stroke="${fill}" stroke-width="${Math.round(outline * 100) / 100}" stroke-linejoin="round"` : "";
  return ` fill="${fill}"${o}`;
}
