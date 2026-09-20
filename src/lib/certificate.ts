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
  /** Wordmark shown on the band under the header. */
  label: string;
  number: string;
  issuedOn: string;
  fields: ApposttaField[];
  signatoryName: string;
  /** Must be a data: URI — an external URL would taint the canvas and break the PNG export. */
  signatureDataUri: string | null;
  verifyUrl: string;
  footerNote: string;
}

const W = 560;
const MARGIN = 26;
const CONTENT_W = W - MARGIN * 2;

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "Helvetica, Arial, sans-serif";
const MONO = "'Courier New', Courier, monospace";

const INK = "#111111";
const MUTED = "#555555";
const RULE = "#111111";
const BAND = "#eef1f5";

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

export function buildCertificateSvg(input: CertificateInput): { svg: string; width: number; height: number } {
  const parts: string[] = [];
  let y = MARGIN + 12;

  /* ---- Header ---- */
  const nameLines = wrap(input.orgName || "Your organisation", CONTENT_W, 21, SERIF, true);
  for (const line of nameLines) {
    y += 22;
    parts.push(text(W / 2, y, line, { size: 21, family: SERIF, bold: true, anchor: "middle" }));
  }
  const taglineLines = wrap(input.orgTagline, CONTENT_W, 11, SANS);
  for (const line of taglineLines) {
    y += 14;
    parts.push(text(W / 2, y, line, { size: 11, fill: MUTED, anchor: "middle" }));
  }

  y += 12;
  parts.push(hline(y, MARGIN, W - MARGIN, 1.4));

  /* ---- Wordmark band ---- */
  const bandH = 30;
  parts.push(
    `<rect x="${MARGIN}" y="${round(y)}" width="${CONTENT_W}" height="${bandH}" fill="${BAND}"/>`,
  );
  parts.push(
    text(W / 2, y + 20.5, (input.label || "APPOSTTA").toUpperCase(), {
      size: 14,
      family: SERIF,
      bold: true,
      anchor: "middle",
      letterSpacing: 4,
    }),
  );
  y += bandH;
  parts.push(hline(y, MARGIN, W - MARGIN, 1.4));

  /* ---- Numbered field rows ---- */
  const numX = MARGIN + 8;
  const textX = MARGIN + 30;
  const rowW = CONTENT_W - 38;

  /** Gap between the two halves of a split row, holding the divider. */
  const SPLIT_GAP = 16;

  const hasText = (s: string | undefined) => Boolean((s ?? "").trim());
  const rows = input.fields.filter((f) => hasText(f.label) || hasText(f.value) || hasText(f.second?.label) || hasText(f.second?.value));

  rows.forEach((f, i) => {
    // A split row is two headings on one numbered row, so both halves are laid out from the same top
    // and the row ends at whichever runs longer.
    const split = f.second && (hasText(f.second.label) || hasText(f.second.value)) ? f.second : null;
    const colW = split ? (rowW - SPLIT_GAP) / 2 : rowW;
    const halves = split ? [f, split] : [f];
    const top = y;

    let bottom = top;
    /** Baseline of the row's first line of text, wherever it falls, so the number sits level with it. */
    let firstBaseline = Infinity;

    halves.forEach((half, h) => {
      const colX = textX + h * (colW + SPLIT_GAP);
      const labelLines = wrap(half.label, colW, 11, SANS);
      const valueLines = wrap(half.value, colW, 13, SANS, true);

      let cy = top + 5;
      for (const line of labelLines) {
        cy += 13;
        firstBaseline = Math.min(firstBaseline, cy);
        parts.push(text(colX, cy, line, { size: 11, fill: MUTED }));
      }
      for (const line of valueLines) {
        cy += 16;
        firstBaseline = Math.min(firstBaseline, cy);
        parts.push(text(colX, cy, line, { size: 13, bold: true }));
      }
      // An empty half still needs height, otherwise the rule would sit on the row above it.
      if (!labelLines.length && !valueLines.length) cy += 14;
      bottom = Math.max(bottom, cy);
    });

    // Printed once, at the start of the row, however many halves it has.
    parts.push(text(numX, Number.isFinite(firstBaseline) ? firstBaseline : top + 19, String(i + 1), { size: 11, fill: MUTED }));

    y = bottom + 6;
    if (top === y) y += 20;
    if (split) parts.push(vline(textX + colW + SPLIT_GAP / 2, top + 3, y - 3));
    parts.push(hline(y));
  });

  /* ---- Reference / QR / signature strip ---- */
  const stripTop = y;
  const stripH = 124;
  const colA = MARGIN + CONTENT_W * 0.36;
  const colB = MARGIN + CONTENT_W * 0.66;

  // Left: the two values a verifier is asked to match.
  parts.push(text(MARGIN + 8, stripTop + 20, "Reference No.", { size: 9.5, fill: MUTED }));
  const numberLines = wrap(input.number, colA - MARGIN - 16, 13, MONO, true);
  let ny = stripTop + 20;
  for (const line of numberLines) {
    ny += 16;
    parts.push(text(MARGIN + 8, ny, line, { size: 13, family: MONO, bold: true }));
  }
  parts.push(text(MARGIN + 8, ny + 22, "Date of issue", { size: 9.5, fill: MUTED }));
  parts.push(text(MARGIN + 8, ny + 38, formatIssued(input.issuedOn), { size: 13, bold: true }));

  // Middle: the QR a phone camera resolves to the verification link.
  const qrSize = 94;
  const qrX = colA + (colB - colA - qrSize) / 2;
  const qrY = stripTop + 14;
  parts.push(qrBlock(input.verifyUrl, qrX, qrY, qrSize));
  parts.push(
    text((colA + colB) / 2, qrY + qrSize + 13, "Scan to verify", { size: 9, fill: MUTED, anchor: "middle" }),
  );

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

  const stripBottom = stripTop + stripH;
  parts.push(vline(colA, stripTop, stripBottom));
  parts.push(vline(colB, stripTop, stripBottom));
  parts.push(hline(stripBottom, MARGIN, W - MARGIN, 1.4));
  y = stripBottom;

  /* ---- Footer ---- */
  y += 6;
  for (const line of wrap(input.footerNote, CONTENT_W - 16, 9.5, SANS)) {
    y += 12;
    parts.push(text(W / 2, y, line, { size: 9.5, fill: MUTED, anchor: "middle" }));
  }
  for (const line of wrap(`To verify, visit ${input.verifyUrl}`, CONTENT_W - 8, 9, SANS, true)) {
    y += 12;
    parts.push(text(W / 2, y, line, { size: 9, bold: true, anchor: "middle" }));
  }
  y += MARGIN;

  const H = Math.max(360, Math.round(y));

  const frame =
    `<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${RULE}" stroke-width="2.5"/>` +
    `<rect x="17" y="17" width="${W - 34}" height="${H - 34}" fill="none" stroke="${RULE}" stroke-width="0.8"/>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Certificate">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
    parts.join("") +
    frame +
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
