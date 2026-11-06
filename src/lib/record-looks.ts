import type { CSSProperties } from "react";

/**
 * Moving and sizing the pieces of the verification record (New M's and Appo's, desktop and mobile alike):
 * the card's heading and title, the certificate's logo, title and subtitle, every entry's words and value,
 * the officer's designation and signature, and the note under the record. The super admin sets them under
 * Page design; they are saved with the page content in the database, per view.
 *
 * A move is in the view's design pixels (1062 px wide desktop, 360 px phone), so it keeps its place at
 * every width; it shifts the piece where it is drawn without pushing anything aside. A size is a percent
 * of the designed size: text grows and wraps within its box, a logo grows in place, a signature grows
 * round its middle.
 */

/** How one piece was moved and sized. */
export interface PieceLook {
  x: number;
  y: number;
  /** Percent of the designed size; 100 is as designed. */
  size: number;
}

/** The furthest a piece may be moved, in design pixels either way. */
export const LOOK_MOVE_MAX = 600;
/** The smallest and largest a piece may be made, in percent. */
export const LOOK_SIZE = { min: 30, max: 300 } as const;

export const AS_DESIGNED: PieceLook = { x: 0, y: 0, size: 100 };

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
}

/** A move kept within reach, to a tenth of a design pixel. */
export function clampMove(n: number): number {
  return Number.isFinite(n) ? Math.round(Math.min(LOOK_MOVE_MAX, Math.max(-LOOK_MOVE_MAX, n)) * 10) / 10 : 0;
}

/** A size kept within reach, in whole percent; anything unreadable is as designed. */
export function clampSize(n: number): number {
  return Number.isFinite(n) ? Math.round(Math.min(LOOK_SIZE.max, Math.max(LOOK_SIZE.min, n))) : 100;
}

/** A look kept within reach, or null when it leaves the piece as designed. */
export function tidyLook(v: unknown): PieceLook | null {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const x = clampMove(num(o.x));
  const y = clampMove(num(o.y));
  const size = o.size === undefined ? 100 : clampSize(num(o.size));
  return x === 0 && y === 0 && size === 100 ? null : { x, y, size };
}

/** The looks of these pieces as sent or saved: known pieces only, and only those changed. */
export function cleanLooks<K extends string>(v: unknown, ids: readonly K[]): Partial<Record<K, PieceLook>> {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: Partial<Record<K, PieceLook>> = {};
  for (const id of ids) {
    const l = tidyLook(o[id]);
    if (l) out[id] = l;
  }
  return out;
}

/** Sizes of a few parts, in percent, as sent or saved: known parts only, and only those changed. */
export function cleanSizes<K extends string>(v: unknown, ids: readonly K[]): Partial<Record<K, number>> {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out: Partial<Record<K, number>> = {};
  for (const id of ids) {
    if (o[id] === undefined) continue;
    const s = clampSize(num(o[id]));
    if (s !== 100) out[id] = s;
  }
  return out;
}

/**
 * The CSS that moves a piece. "shift" translates it, for anything drawn as a box (absolutely placed text, a
 * logo, a signature); "flow" offsets it relatively, which also works for text that runs on one line with
 * other text. A box that is sized as a whole (a signature) passes its scale, so it grows round its middle.
 */
export function moveCss(
  move: { x: number; y: number } | undefined,
  unit: (n: number) => string,
  how: "shift" | "flow",
  scale = 1,
): CSSProperties | undefined {
  const x = move?.x ?? 0;
  const y = move?.y ?? 0;
  if (how === "flow") {
    if (!x && !y) return undefined;
    return { position: "relative", left: unit(x), top: unit(y) };
  }
  const steps: string[] = [];
  if (x || y) steps.push(`translate(${unit(x)}, ${unit(y)})`);
  if (scale !== 1) steps.push(`scale(${scale})`);
  return steps.length ? { transform: steps.join(" ") } : undefined;
}

/** A size as a zoom factor, or undefined when it is as designed. */
export function zoomOf(size: number | undefined): number | undefined {
  return size !== undefined && size !== 100 ? size / 100 : undefined;
}
