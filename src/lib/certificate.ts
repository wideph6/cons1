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
 * Every other line is offset by half a step so the phrase does not stack into visible columns.
 */
function watermarkLayer(phrase: string, height: number): string {
  const clean = String(phrase ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const size = 17;
  const stepX = clean.length * charWidth(size, SANS, true) + 30;
  const stepY = 38;

  const out: string[] = [];
  let row = 0;
  for (let ty = 22; ty < height; ty += stepY, row++) {
    const offset = (row % 2) * (stepX / 2);
    for (let tx = -offset; tx < W; tx += stepX) {
      out.push(`<text x="${round(tx)}" y="${round(ty)}">${escapeXml(clean)}</text>`);
    }
  }

  return (
    `<g fill="${WATERMARK_FILL}" fill-opacity="${WATERMARK_OPACITY}" font-family="${SANS}" ` +
    `font-size="${size}" font-weight="700" letter-spacing="1">${out.join("")}</g>`
  );
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

export function buildCertificateSvg(input: CertificateInput): { svg: string; width: number; height: number } {
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
    parts.push(text(W / 2, y, line, { size: 20, family: SERIF, bold: true, anchor: "middle" }));
  }
  y += 8;
  rules.push(y);

  const taglineLines = wrap(input.orgTagline, CONTENT_W - 24, 12, SANS);
  if (taglineLines.length) {
    y += 4;
    for (const line of taglineLines) {
      y += 16;
      parts.push(text(W / 2, y, line, { size: 12, anchor: "middle" }));
    }
    y += 7;
    rules.push(y);
  }

  /* ---- Numbered rows ---- */
  const numX = MARGIN + 8;
  const textX = MARGIN + 28;
  const rowW = CONTENT_W - 36;

  /** Gap between the two halves of a split row, holding the divider. */
  const SPLIT_GAP = 14;

  const hasText = (s: string | undefined) => Boolean((s ?? "").trim());
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
      y += 21;
      parts.push(text(W / 2, y, line, { size: 17, family: SERIF, italic: true, anchor: "middle" }));
    }
    y += 6;
    rules.push(y);
  }

  rows.forEach((f, i) => {
    // A split row is two headings on one numbered row, so both halves are laid out from the same top
    // and the row ends at whichever runs longer.
    const split = f.second && (hasText(f.second.label) || hasText(f.second.value)) ? f.second : null;
    const colW = split ? (rowW - SPLIT_GAP) / 2 : rowW;
    const halves = split ? [f, split] : [f];
    const top = y;

    let bottom = top;
    /** Baseline of the row's first line of text, so the number sits level with it. */
    let firstBaseline = Infinity;

    halves.forEach((half, h) => {
      const colX = textX + h * (colW + SPLIT_GAP);
      let cy = top + 5;

      if (f.inline) {
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
    parts.push(
      text(numX, Number.isFinite(firstBaseline) ? firstBaseline : top + 21, String(i + 1), { size: 12 }),
    );

    y = bottom + 6;
    if (top === y) y += 22;
    if (split) parts.push(vline(textX + colW + SPLIT_GAP / 2, top, y));
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

  // Left: the two values a verifier is asked to match.
  parts.push(text(MARGIN + 10, stripTop + 22, "Reference No.", { size: 9.5, fill: MUTED }));
  const numberLines = wrap(input.number, colA - MARGIN - 20, 12.5, MONO, true);
  let ny = stripTop + 22;
  for (const line of numberLines) {
    ny += 16;
    parts.push(text(MARGIN + 10, ny, line, { size: 12.5, family: MONO, bold: true }));
  }
  parts.push(text(MARGIN + 10, ny + 22, "Date of issue", { size: 9.5, fill: MUTED }));
  parts.push(text(MARGIN + 10, ny + 38, formatIssued(input.issuedOn), { size: 12.5, bold: true }));

  // Middle: the QR a phone camera resolves to the verification link.
  const qrSize = 94;
  const qrX = colA + (colB - colA - qrSize) / 2;
  const qrY = stripTop + 16;
  parts.push(qrBlock(input.verifyUrl, qrX, qrY, qrSize));
  parts.push(text((colA + colB) / 2, qrY + qrSize + 13, "Scan to verify", { size: 9, fill: MUTED, anchor: "middle" }));

  // Right: signature image over the signatory's name.
  const sigCx = (colB + (W - MARGIN)) / 2;
  if (input.signatureDataUri) {
    const sigW = Math.min(130, W - MARGIN - colB - 16);
    parts.push(
      `<image href="${escapeXml(input.signatureDataUri)}" x="${round(sigCx - sigW / 2)}" y="${round(stripTop + 22)}" ` +
        `width="${round(sigW)}" height="52" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  parts.push(
    `<line x1="${round(sigCx - 58)}" y1="${round(stripTop + 82)}" x2="${round(sigCx + 58)}" y2="${round(stripTop + 82)}" stroke="${RULE}" stroke-width="0.8"/>`,
  );
  const sigNameLines = wrap(input.signatoryName, 132, 10, SANS).slice(0, 2);
  let sy = stripTop + 82;
  for (const line of sigNameLines) {
    sy += 13;
    parts.push(text(sigCx, sy, line, { size: 10, anchor: "middle" }));
  }
  parts.push(text(sigCx, Math.max(sy, stripTop + 82) + 14, "Authorised signature", { size: 8.5, fill: MUTED, anchor: "middle" }));

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

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Certificate">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
    // Behind the content: the QR paints its own white backing, so it stays scannable over this.
    watermarkLayer(input.watermarkText ?? "", H) +
    table +
    parts.join("") +
    borderLayer(input.borderStyle ?? "ornament", H) +
    `</svg>`;

  return { svg, width: W, height: H };
}

/** The QR as a nested group, scaled so its modules land on the requested pixel box. */
function qrBlock(url: string, x: number, y: number, size: number): string {
  let matrix;
  try {
    matrix = encodeQr(url, "M");
  } catch {
    return text(x, y + size / 2, "QR unavailable", { size: 9, fill: MUTED });
  }
  // The spec's four-module quiet zone; with the cell divider lines this close, scanners need it.
  const quiet = 4;
  const span = matrix.size + quiet * 2;
  const scale = size / span;
  return (
    `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale)})">` +
    `<rect width="${span}" height="${span}" fill="#ffffff"/>` +
    `<path transform="translate(${quiet} ${quiet})" fill="#000000" d="${qrToPathData(matrix)}"/>` +
    `</g>`
  );
}
