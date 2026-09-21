/**
 * Builds the printable certificate as a standalone SVG string.
 *
 * Pure string work with no DOM and no external assets, so the same function feeds the on-screen
 * preview and the PNG export. Fonts are generic families on purpose: a web font would not be loaded
 * by the time the SVG is rasterised onto a canvas and the export would come out in a fallback face.
 */
import { encodeQr, qrToPathData } from "./qr";
import type { ApposttaField } from "./types";
import { formatIssued } from "./utils";

export interface CertificateInput {
  orgName: string;
  orgTagline: string;
  number: string;
  issuedOn: string;
  fields: ApposttaField[];
  signatoryName: string;
  /** Must be a data: URI — an external URL would taint the canvas and break the PNG export. */
  signatureDataUri: string | null;
  verifyUrl: string;
  footerNote: string;
  /** Repeated faintly across the background. Blank leaves the page plain. */
  watermarkText?: string;
  /** Printed between the rows, in italic, as a certification mark. Blank prints nothing. */
  stampText?: string;
  /** Which row the mark follows. 0, or past the last row, puts it after them all. */
  stampAfterRow?: number;
  /** The always-present bottom line. Blank falls back to the default wording. */
  verifyNote?: string;
  /** How the page edge is drawn. */
  borderStyle?: BorderStyle;
  /**
   * The fixed apostille template's background, as a data: URI (see `signatureDataUri` for why it
   * can't be a plain URL). When set, values are overlaid onto this image at the coordinates
   * measured for it instead of the border/watermark/labels being drawn from scratch — see
   * `buildTemplateCertificateSvg`. Fields past the template's fixed first 8 still print below it
   * in the fully-drawn style, so extra rows a settings panel adds keep working.
   */
  templateBackground?: string | null;
}

/** The page-edge treatments the panel offers. */
export const BORDER_STYLES = ["ornament", "double", "plain"] as const;
export type BorderStyle = (typeof BORDER_STYLES)[number];

/** What `{{name}}` in a value, the stamp or the footer stands for. */
export type TokenContext = Record<string, string>;

/**
 * Replaces `{{number}}`, `{{date}}` and the rest at render time rather than when the value is saved,
 * so a row that carries the number or the issue date follows the record when either is edited.
 * An unknown name is left as typed, which shows the mistake instead of silently blanking the row.
 */
export function fillTokens(value: string, ctx: TokenContext): string {
  return String(value ?? "").replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (whole, name: string) => {
    const hit = ctx[name.toLowerCase()];
    return hit === undefined ? whole : hit;
  });
}

/** The names a row value may use, with a short description for the settings screen. */
export const TOKEN_HELP: Array<{ token: string; means: string }> = [
  { token: "{{number}}", means: "this record's reference number" },
  { token: "{{date}}", means: "the issue date, written out" },
  { token: "{{day}}", means: "the issue day, 01-31" },
  { token: "{{month}}", means: "the issue month, 01-12" },
  { token: "{{year}}", means: "the issue year" },
  { token: "{{url}}", means: "the verification link" },
];

function tokenContext(input: CertificateInput): TokenContext {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.issuedOn ?? "");
  return {
    number: input.number ?? "",
    date: formatIssued(input.issuedOn),
    day: d?.[3] ?? "",
    month: d?.[2] ?? "",
    year: d?.[1] ?? "",
    url: input.verifyUrl ?? "",
  };
}

const W = 560;
const MARGIN = 32;
/** Stops a certificate with very few rows coming out as a wide strip. */
const MIN_H = 520;
const CONTENT_W = W - MARGIN * 2;

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "Helvetica, Arial, sans-serif";
const MONO = "'Courier New', Courier, monospace";
/** For the certification mark only — named script faces first, generic `cursive` as the last resort
 * so the mark still renders as something rather than erroring wherever none of them are installed. */
const SCRIPT = "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive";

const INK = "#111111";
const MUTED = "#555555";
const RULE = "#111111";
/** Pale enough to read the certificate straight through it, dark enough to survive printing. */
const WATERMARK_FILL = "#1a1a1a";
const WATERMARK_OPACITY = 0.07;

export function escapeXml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Rough advance width per character. Good enough to wrap text without measuring in a DOM. */
function charWidth(fontSize: number, family: string, bold: boolean): number {
  const base = family === MONO ? 0.6 : family === SERIF ? 0.48 : 0.52;
  return fontSize * (bold ? base + 0.03 : base);
}

/** Greedy word wrap, splitting any single word that is itself too long to fit. */
function wrap(text: string, maxWidth: number, fontSize: number, family: string, bold = false): string[] {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const perChar = charWidth(fontSize, family, bold);
  const maxChars = Math.max(4, Math.floor(maxWidth / perChar));

  const lines: string[] = [];
  let line = "";
  for (const word of clean.split(" ")) {
    let w = word;
    while (w.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
    }
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxChars) line = next;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface TextOpts {
  size: number;
  family?: string;
  bold?: boolean;
  italic?: boolean;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number;
}

function text(x: number, y: number, content: string, o: TextOpts): string {
  const attrs = [
    `x="${round(x)}"`,
    `y="${round(y)}"`,
    `font-family="${o.family ?? SANS}"`,
    `font-size="${o.size}"`,
    `fill="${o.fill ?? INK}"`,
  ];
  if (o.bold) attrs.push(`font-weight="700"`);
  if (o.italic) attrs.push(`font-style="italic"`);
  if (o.anchor) attrs.push(`text-anchor="${o.anchor}"`);
  if (o.letterSpacing) attrs.push(`letter-spacing="${o.letterSpacing}"`);
  return `<text ${attrs.join(" ")}>${escapeXml(content)}</text>`;
}

function hline(y: number, x1 = MARGIN, x2 = W - MARGIN, width = 0.8): string {
  return `<line x1="${round(x1)}" y1="${round(y)}" x2="${round(x2)}" y2="${round(y)}" stroke="${RULE}" stroke-width="${width}"/>`;
}

function vline(x: number, y1: number, y2: number, width = 0.8): string {
  return `<line x1="${round(x)}" y1="${round(y1)}" x2="${round(x)}" y2="${round(y2)}" stroke="${RULE}" stroke-width="${width}"/>`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The repeating background phrase, drawn as plain text elements rather than an SVG pattern.
 * A pattern would be the shorter way to say it, but patterns holding text rasterise unevenly once
 * the SVG is drawn onto a canvas, and the PNG export is the whole point of this file.
 *
 * Every other line is offset by half a step so the phrase does not stack into visible columns. The
 * grid is drawn a step past each edge, then clipped to `watermarkInset(style)`, so a repeat runs off
 * the edge of its own tile the way a printed watermark does, but never crosses into the border.
 */
function watermarkLayer(phrase: string, height: number, style: BorderStyle, clipId: string): string {
  const clean = String(phrase ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const size = 17;
  const letterSpacing = 1;
  // A conservative per-character advance for bold, all-caps sans text — wider than the mixed-case
  // estimate `charWidth` uses for row labels. Underestimating it, and ignoring letter-spacing, is
  // what let consecutive repeats overlap.
  const phraseWidth = clean.length * size * 0.68 + Math.max(0, clean.length - 1) * letterSpacing;
  const horizontalGap = 6; // was 28, cut 80% so repeats sit close together without touching
  const verticalGap = 3; // extra space beyond the line's own height; was 9, cut 65%
  const stepX = phraseWidth + horizontalGap;
  const stepY = size + verticalGap;
  const inset = watermarkInset(style);

  const out: string[] = [];
  let row = 0;
  for (let ty = inset + size; ty < height - inset; ty += stepY, row++) {
    const offset = (row % 2) * (stepX / 2);
    for (let tx = inset - stepX - offset; tx < W - inset + stepX; tx += stepX) {
      out.push(`<text x="${round(tx)}" y="${round(ty)}">${escapeXml(clean)}</text>`);
    }
  }

  return (
    `<clipPath id="${clipId}"><rect x="${round(inset)}" y="${round(inset)}" ` +
    `width="${round(W - inset * 2)}" height="${round(height - inset * 2)}"/></clipPath>` +
    `<g clip-path="url(#${clipId})" fill="${WATERMARK_FILL}" fill-opacity="${WATERMARK_OPACITY}" font-family="${SANS}" ` +
    `font-size="${size}" font-weight="700" letter-spacing="${letterSpacing}">${out.join("")}</g>`
  );
}

/** How far the watermark's clip box sits from the page edge, clear of whichever border is drawn. */
function watermarkInset(style: BorderStyle): number {
  if (style === "plain") return 20;
  if (style === "double") return 23;
  return 26; // ornament: clear of the star/dot motifs, centred at inset 15 with radius 6.5
}

/**
 * The page edge. `ornament` repeats a small four-point motif around all four sides, `double` is the
 * plain pair of rules the panel started with, and `plain` is a single rule.
 */
function borderLayer(style: BorderStyle, height: number): string {
  if (style === "plain") {
    return `<rect x="14" y="14" width="${W - 28}" height="${height - 28}" fill="none" stroke="${RULE}" stroke-width="1.6"/>`;
  }

  if (style === "double") {
    return (
      `<rect x="10" y="10" width="${W - 20}" height="${height - 20}" fill="none" stroke="${RULE}" stroke-width="2.5"/>` +
      `<rect x="17" y="17" width="${W - 34}" height="${height - 34}" fill="none" stroke="${RULE}" stroke-width="0.8"/>`
    );
  }

  /* ---- Ornamental ---- */
  const inset = 15;
  const r = 6.5;
  const step = 26;
  const glyphs: string[] = [];

  /** A four-pointed star: long points on the axes, short shoulders between them. */
  const star = (cx: number, cy: number) =>
    `<path d="M${round(cx)} ${round(cy - r)}L${round(cx + r * 0.3)} ${round(cy - r * 0.3)}` +
    `L${round(cx + r)} ${round(cy)}L${round(cx + r * 0.3)} ${round(cy + r * 0.3)}` +
    `L${round(cx)} ${round(cy + r)}L${round(cx - r * 0.3)} ${round(cy + r * 0.3)}` +
    `L${round(cx - r)} ${round(cy)}L${round(cx - r * 0.3)} ${round(cy - r * 0.3)}Z"/>`;

  /** The three small dots that sit between one star and the next. */
  const dots = (cx: number, cy: number, horizontal: boolean) =>
    [-4, 0, 4]
      .map((d) => {
        const x = horizontal ? cx + d : cx;
        const cyy = horizontal ? cy : cy + d;
        return `<circle cx="${round(x)}" cy="${round(cyy)}" r="${d === 0 ? 1.5 : 1}"/>`;
      })
      .join("");

  // Both horizontal edges, then both vertical ones, so the corners are covered by the run that
  // reaches them rather than by a separate corner case.
  for (let x = inset; x <= W - inset + 0.01; x += step) {
    glyphs.push(star(x, inset), star(x, height - inset));
    if (x + step <= W - inset + 0.01) {
      glyphs.push(dots(x + step / 2, inset, true), dots(x + step / 2, height - inset, true));
    }
  }
  for (let ty = inset + step; ty <= height - inset - step + 0.01; ty += step) {
    glyphs.push(star(inset, ty), star(W - inset, ty));
    if (ty + step <= height - inset - step + 0.01) {
      glyphs.push(dots(inset, ty + step / 2, false), dots(W - inset, ty + step / 2, false));
    }
  }

  return `<g fill="${INK}">${glyphs.join("")}</g>`;
}

const SPLIT_GAP = 14;
const hasText = (s: string | undefined) => Boolean((s ?? "").trim());

/**
 * Draws one numbered row (optionally split into two halves under the same number) and returns
 * where it ends, so both the fully-drawn certificate and the image-backed one's overflow rows
 * (fields past the template's fixed 8) can share the same row layout.
 */
function drawFieldRow(
  parts: string[],
  tokens: TokenContext,
  num: number,
  field: ApposttaField,
  top: number,
  textX: number,
  numX: number,
  rowW: number,
): { bottom: number; colW: number; split: ApposttaField["second"] | null } {
  const split = field.second && (hasText(field.second.label) || hasText(field.second.value)) ? field.second : null;
  const colW = split ? (rowW - SPLIT_GAP) / 2 : rowW;
  const halves = split ? [field, split] : [field];

  let bottom = top;
  /** Baseline of the row's first line of text, so the number sits level with it. */
  let firstBaseline = Infinity;

  halves.forEach((half, h) => {
    const colX = textX + h * (colW + SPLIT_GAP);
    let cy = top + 5;

    if (field.inline) {
      // Heading and value on one line, the value starting at a fixed indent so a column of inline
      // rows lines up with itself however long each heading is.
      const labelW = Math.min(colW * 0.42, 116);
      const labelLines = wrap(half.label, labelW, 12, SANS);
      // Only the value takes tokens. A heading is set in settings and is meant to read literally.
      const valueLines = wrap(fillTokens(half.value, tokens), colW - labelW - 10, 13, SANS, true);
      const lines = Math.max(labelLines.length, valueLines.length, 1);
      for (let k = 0; k < lines; k++) {
        cy += 17;
        if (k === 0) firstBaseline = Math.min(firstBaseline, cy);
        const lab = labelLines[k];
        const val = valueLines[k];
        if (lab) parts.push(text(colX, cy, lab, { size: 12 }));
        if (val) parts.push(text(colX + labelW + 10, cy, val, { size: 13, bold: true }));
      }
    } else {
      const labelLines = wrap(half.label, colW, 12, SANS);
      const valueLines = wrap(fillTokens(half.value, tokens), colW, 13, SANS, true);
      for (const line of labelLines) {
        cy += 16;
        firstBaseline = Math.min(firstBaseline, cy);
        parts.push(text(colX, cy, line, { size: 12 }));
      }
      for (const line of valueLines) {
        cy += 18;
        firstBaseline = Math.min(firstBaseline, cy);
        parts.push(text(colX, cy, line, { size: 13, bold: true }));
      }
      // An empty half still needs height, otherwise the rule would sit on the row above it.
      if (!labelLines.length && !valueLines.length) cy += 16;
    }

    bottom = Math.max(bottom, cy);
  });

  // Printed once, at the start of the row, however many halves it has.
  parts.push(text(numX, Number.isFinite(firstBaseline) ? firstBaseline : top + 21, String(num), { size: 12 }));

  return { bottom, colW, split };
}

export function buildCertificateSvg(input: CertificateInput): { svg: string; width: number; height: number } {
  return input.templateBackground
    ? buildTemplateCertificateSvg(input, input.templateBackground)
    : buildDrawnCertificateSvg(input);
}

function buildDrawnCertificateSvg(input: CertificateInput): { svg: string; width: number; height: number } {
  const parts: string[] = [];
  const tokens = tokenContext(input);

  /** Every internal rule of the table, collected as the content is laid out and drawn at the end. */
  const rules: number[] = [];
  const tableTop = MARGIN;
  let y = tableTop;

  /* ---- Heading cells ---- */
  // The name and tagline are the first two cells of the same table, not a separate block above it,
  // so the whole certificate reads as one ruled sheet.
  const nameLines = wrap(input.orgName || "Your organisation", CONTENT_W - 24, 20, SERIF, true);
  y += 6;
  for (const line of nameLines) {
    y += 24;
    parts.push(text(W / 2, y, line, { size: 20, family: SERIF, bold: true, anchor: "middle", letterSpacing: 3 }));
  }
  y += 8;
  rules.push(y);

  const taglineLines = wrap(input.orgTagline, CONTENT_W - 24, 12, SERIF);
  if (taglineLines.length) {
    y += 4;
    for (const line of taglineLines) {
      y += 16;
      parts.push(text(W / 2, y, line, { size: 12, family: SERIF, italic: true, anchor: "middle" }));
    }
    y += 7;
    rules.push(y);
  }

  /* ---- Numbered rows ---- */
  const numX = MARGIN + 8;
  const textX = MARGIN + 28;
  const rowW = CONTENT_W - 36;

  const rows = input.fields.filter(
    (f) => hasText(f.label) || hasText(f.value) || hasText(f.second?.label) || hasText(f.second?.value),
  );

  /**
   * The certification mark. It gets a full-width cell with no number, because it marks the rows
   * rather than being one of them, and it can sit between two rows instead of only after the last.
   */
  const stampLines = wrap(fillTokens(input.stampText ?? "", tokens), CONTENT_W - 60, 17, SERIF);
  const stampAfter = Math.trunc(input.stampAfterRow ?? 0);
  // Anything outside the row range, including the default 0, means "after them all".
  const stampRow = stampLines.length ? (stampAfter >= 1 && stampAfter <= rows.length ? stampAfter : rows.length) : -1;

  function drawStamp() {
    y += 4;
    for (const line of stampLines) {
      y += 22;
      // A script face reads as a handwritten certification mark; an italic serif reads as a
      // heading. `SCRIPT` tries the common named script fonts first and falls back to the
      // generic `cursive` family only if none of them are installed.
      parts.push(text(W / 2, y, line, { size: 19, family: SCRIPT, anchor: "middle" }));
    }
    y += 6;
    rules.push(y);
  }

  rows.forEach((f, i) => {
    const top = y;
    const drawn = drawFieldRow(parts, tokens, i + 1, f, top, textX, numX, rowW);

    y = drawn.bottom + 6;
    if (top === y) y += 22;
    if (drawn.split) parts.push(vline(textX + drawn.colW + SPLIT_GAP / 2, top, y));
    rules.push(y);

    if (stampRow === i + 1) drawStamp();
  });

  // A mark on a certificate that has no rows at all still belongs on it.
  if (stampRow === 0) drawStamp();

  /* ---- Reference / QR / signature strip ---- */
  const stripTop = y;
  const stripH = 126;
  const colA = MARGIN + CONTENT_W * 0.38;
  const colB = MARGIN + CONTENT_W * 0.68;

  // Left: the issue date inline with its label, and blank room below for the physical seal —
  // the reference certificate this layout follows never repeats the reference number here, since
  // it's already row 8 of the numbered table.
  const dateLabel = "Date: ";
  parts.push(text(MARGIN + 10, stripTop + 24, dateLabel, { size: 12.5 }));
  parts.push(
    text(MARGIN + 10 + charWidth(12.5, SANS, false) * dateLabel.length, stripTop + 24, formatIssued(input.issuedOn), {
      size: 12.5,
      bold: true,
    }),
  );
  parts.push(text(MARGIN + 10, stripTop + stripH - 26, "Seal/Stamp", { size: 12.5 }));

  // Middle: the QR a phone camera resolves to the verification link.
  const qrSize = 94;
  const qrX = colA + (colB - colA - qrSize) / 2;
  const qrY = stripTop + 16;
  parts.push(qrBlock(input.verifyUrl, qrX, qrY, qrSize));

  // Right: signature image over the signatory's name, with no caption or rule beneath it — the
  // name alone is what the reference certificate prints there.
  const sigCx = (colB + (W - MARGIN)) / 2;
  if (input.signatureDataUri) {
    const sigW = Math.min(130, W - MARGIN - colB - 16);
    parts.push(
      `<image href="${escapeXml(input.signatureDataUri)}" x="${round(sigCx - sigW / 2)}" y="${round(stripTop + 22)}" ` +
        `width="${round(sigW)}" height="52" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  const sigNameLines = wrap(input.signatoryName, 132, 10, SANS).slice(0, 2);
  let sy = stripTop + 82;
  for (const line of sigNameLines) {
    sy += 13;
    parts.push(text(sigCx, sy, line, { size: 10, anchor: "middle" }));
  }

  const tableBottom = stripTop + stripH;
  parts.push(vline(colA, stripTop, tableBottom));
  parts.push(vline(colB, stripTop, tableBottom));

  /* ---- Footer, below the table ---- */
  const footerLines = wrap(fillTokens(input.footerNote, tokens), CONTENT_W - 20, 10, SANS);
  // Always printed, so a certificate never leaves without saying how to check it. The wording is
  // the panel's own; blank falls back to the plain sentence rather than to nothing.
  const verifyLines = wrap(
    fillTokens(input.verifyNote?.trim() || "To verify, visit {{url}}", tokens),
    CONTENT_W - 10,
    9.5,
    SANS,
    true,
  );
  const footerH = 10 + footerLines.length * 13 + verifyLines.length * 13;

  // The page ends where the content does. Anchoring the footer to the bottom of a fixed sheet
  // instead would open a band of empty paper between it and the table whenever the rows are few.
  const H = Math.max(MIN_H, Math.round(tableBottom + footerH + MARGIN));

  let fy = tableBottom + 10;
  for (const line of footerLines) {
    fy += 13;
    parts.push(text(W / 2, fy, line, { size: 10, fill: MUTED, anchor: "middle" }));
  }
  for (const line of verifyLines) {
    fy += 13;
    parts.push(text(W / 2, fy, line, { size: 9.5, bold: true, anchor: "middle" }));
  }

  /* ---- The table itself, drawn under the text it encloses ---- */
  const table =
    `<rect x="${round(MARGIN)}" y="${round(tableTop)}" width="${round(CONTENT_W)}" ` +
    `height="${round(tableBottom - tableTop)}" fill="none" stroke="${RULE}" stroke-width="1.2"/>` +
    rules.map((ry) => hline(ry)).join("");

  const borderStyle = input.borderStyle ?? "ornament";
  // Unique per record, so two certificates open in the same page never share a clip id.
  const clipId = `wm-clip-${(input.number || "cert").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || "x"}`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Certificate">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
    // Behind the content: the QR paints its own white backing, so it stays scannable over this.
    watermarkLayer(input.watermarkText ?? "", H, borderStyle, clipId) +
    table +
    parts.join("") +
    borderLayer(borderStyle, H) +
    `</svg>`;

  return { svg, width: W, height: H };
}

/**
 * Pixel layout for the `apostille_padded_40px` template image (862x1125), measured directly from
 * its rule lines and baked-in label glyphs. A value placed at these coordinates lands under or
 * beside its printed label without the label needing to be drawn at all — everything static
 * (border, watermark, title, the numbered labels, row 7's fixed value, the footer) is already
 * pixels in the image; only the record's own values are drawn on top of it.
 */
const TPL_W = 862;
const TPL_H = 1125;
/** Bold size that matches row 7's baked-in "Ministry of Foreign Affairs" — the reference the panel
 * asked every overlaid value to follow for style, weight and size. Measured by comparing rendered
 * cap-heights against that fixed text directly, since the image's own font metrics don't line up
 * with this file's generic-family width estimate. */
const TPL_VALUE_SIZE = 22;
const TPL_ROW1 = { leftX: 125, rightX: 335, y: 250 };
/** Rows 2-4: value stacked under the fixed label, at this x and baseline. */
const TPL_STACKED = [
  { x: 125, y: 327 },
  { x: 125, y: 405 },
  { x: 125, y: 482 },
];
/** Rows 5, 6, 8: value inline beside the fixed label — row 7's value is fixed in the image itself,
 * so there is no entry for it here. */
const TPL_INLINE = [
  { field: 4, x: 178, y: 574 },
  { field: 5, x: 192, y: 613 },
  { field: 7, x: 184, y: 692 },
];
const TPL_DATE = { x: 165, y: 735 };
/** The QR's cell runs from x 364 to 500 (persistent column rules either side); maxed to that width
 * and left square, so it comes out taller than the cell — the panel asked for the width filled
 * rather than the aspect ratio changed to fit both dimensions. */
const TPL_QR = { x: 364, y: 707, size: 136 };
const TPL_SIGNATURE = { cx: 642, y: 726, w: 195, h: 77, nameY: 828 };
/** Where an overflow row (past the template's fixed 8) starts, and the same numbered-row layout
 * the fully-drawn certificate uses for it. */
const TPL_OVERFLOW_MARGIN = 32;

function buildTemplateCertificateSvg(
  input: CertificateInput,
  backgroundDataUri: string,
): { svg: string; width: number; height: number } {
  const tokens = tokenContext(input);
  const parts: string[] = [];
  const fields = input.fields;
  const value = (i: number) => fillTokens(fields[i]?.value ?? "", tokens);

  const row1 = fields[0];
  if (row1) {
    parts.push(text(TPL_ROW1.leftX, TPL_ROW1.y, fillTokens(row1.value ?? "", tokens), { size: TPL_VALUE_SIZE, bold: true }));
    if (row1.second) {
      parts.push(
        text(TPL_ROW1.rightX, TPL_ROW1.y, fillTokens(row1.second.value ?? "", tokens), { size: TPL_VALUE_SIZE, bold: true }),
      );
    }
  }

  TPL_STACKED.forEach((pos, i) => {
    parts.push(text(pos.x, pos.y, value(i + 1), { size: TPL_VALUE_SIZE, bold: true }));
  });

  // Row 7 (fields[6]) is intentionally skipped: its value is baked into the template image.
  TPL_INLINE.forEach((pos) => {
    parts.push(text(pos.x, pos.y, value(pos.field), { size: TPL_VALUE_SIZE, bold: true }));
  });

  // "Date:" repeats row 6's value (the issue date row), per the template's own layout.
  parts.push(text(TPL_DATE.x, TPL_DATE.y, value(5), { size: TPL_VALUE_SIZE, bold: true }));

  // No backing rect: the template's own cell is already blank, and drawing one on top of it only
  // risks a seam where a pure white rect meets the image's JPEG-compressed near-white pixels.
  parts.push(qrBlock(input.verifyUrl, TPL_QR.x, TPL_QR.y, TPL_QR.size, 1, false));

  if (input.signatureDataUri) {
    parts.push(
      `<image href="${escapeXml(input.signatureDataUri)}" x="${round(TPL_SIGNATURE.cx - TPL_SIGNATURE.w / 2)}" ` +
        `y="${round(TPL_SIGNATURE.y)}" width="${round(TPL_SIGNATURE.w)}" height="${round(TPL_SIGNATURE.h)}" ` +
        `preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  const sigNameLines = wrap(input.signatoryName, 240, 14, SANS).slice(0, 2);
  let sy = TPL_SIGNATURE.nameY;
  for (const line of sigNameLines) {
    parts.push(text(TPL_SIGNATURE.cx, sy, line, { size: 14, anchor: "middle" }));
    sy += 18;
  }

  // Fields past the template's fixed first 8 print below the image in the fully-drawn row style,
  // so a settings panel that adds a 9th row still has somewhere for it to go.
  let height = TPL_H;
  const overflow = fields.slice(8);
  if (overflow.length) {
    const numX = TPL_OVERFLOW_MARGIN + 8;
    const textX = TPL_OVERFLOW_MARGIN + 28;
    const rowW = TPL_W - TPL_OVERFLOW_MARGIN * 2 - 36;
    let y = TPL_H + TPL_OVERFLOW_MARGIN;
    overflow.forEach((f, i) => {
      const top = y;
      const drawn = drawFieldRow(parts, tokens, i + 9, f, top, textX, numX, rowW);
      parts.push(hline(top, TPL_OVERFLOW_MARGIN, TPL_W - TPL_OVERFLOW_MARGIN));
      y = drawn.bottom + 6;
      if (drawn.split) parts.push(vline(textX + drawn.colW + SPLIT_GAP / 2, top, y));
    });
    parts.push(hline(y, TPL_OVERFLOW_MARGIN, TPL_W - TPL_OVERFLOW_MARGIN));
    height = y + TPL_OVERFLOW_MARGIN;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${TPL_W}" height="${height}" viewBox="0 0 ${TPL_W} ${height}" role="img" aria-label="Certificate">` +
    `<rect width="${TPL_W}" height="${height}" fill="#ffffff"/>` +
    `<image href="${escapeXml(backgroundDataUri)}" x="0" y="0" width="${TPL_W}" height="${TPL_H}"/>` +
    parts.join("") +
    `</svg>`;

  return { svg, width: TPL_W, height };
}

/**
 * The QR as a nested group, scaled so its modules land on the requested pixel box.
 * `quiet` is the blank margin around the modules, in modules — the spec default (4) is generous;
 * callers overlaying onto an already-framed placeholder can pass less since the frame itself
 * supplies separation from surrounding content.
 */
function qrBlock(url: string, x: number, y: number, size: number, quiet = 4, whiteBg = true): string {
  let matrix;
  try {
    matrix = encodeQr(url, "M");
  } catch {
    return text(x, y + size / 2, "QR unavailable", { size: 9, fill: MUTED });
  }
  const span = matrix.size + quiet * 2;
  const scale = size / span;
  return (
    `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale)})">` +
    (whiteBg ? `<rect width="${span}" height="${span}" fill="#ffffff"/>` : "") +
    `<path transform="translate(${quiet} ${quiet})" fill="#000000" d="${qrToPathData(matrix)}"/>` +
    `</g>`
  );
}
