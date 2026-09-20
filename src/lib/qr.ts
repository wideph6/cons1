/**
 * QR Code encoder (ISO/IEC 18004), byte mode only, with no dependencies.
 * Pure arithmetic on plain arrays, so the same module runs in a route handler and in the browser.
 */

export type QrEcc = "L" | "M" | "Q" | "H";

export interface QrMatrix {
  /** Modules per side (21 for version 1, +4 per version). */
  size: number;
  /** [row][col], true = dark. */
  modules: boolean[][];
  version: number;
  ecc: QrEcc;
}

const ECC_LEVELS: readonly QrEcc[] = ["L", "M", "Q", "H"];

// Format-information value per level. Deliberately not in strength order: that is how the spec numbers them.
const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 };

// Index = version (slot 0 unused). Straight from the error-correction characteristics table.
const ECC_CODEWORDS_PER_BLOCK: Record<QrEcc, readonly number[]> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30,
    26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30,
    30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

const ECC_BLOCKS: Record<QrEcc, readonly number[]> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
    16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26,
    28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34,
    35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40,
    42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const MIN_VERSION = 1;
const MAX_VERSION = 40;

// Penalty weights for mask selection.
const N1 = 3;
const N2 = 3;
const N3 = 40;
const N4 = 10;

/* ---------------------------------------------------------------- capacity */

/** Module positions available to data + ECC bits, before the codeword split. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    // Alignment squares, minus the parts that overlap the timing patterns.
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36; // two 18-bit version blocks
  }
  return result;
}

function totalCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8);
}

function dataCodewords(version: number, ecc: QrEcc): number {
  return totalCodewords(version) - ECC_CODEWORDS_PER_BLOCK[ecc][version] * ECC_BLOCKS[ecc][version];
}

/** Byte mode uses an 8-bit character count up to version 9 and 16 bits from version 10. */
function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

function fits(byteLength: number, version: number, ecc: QrEcc): boolean {
  return 4 + charCountBits(version) + byteLength * 8 <= dataCodewords(version, ecc) * 8;
}

/* -------------------------------------------------------------------- utf8 */

/** UTF-8 by hand rather than TextEncoder, so server and browser produce byte-identical payloads. */
function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const low = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
        i++;
      } else {
        cp = 0xfffd; // lone surrogate: emit U+FFFD so the byte stream stays valid UTF-8
      }
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      cp = 0xfffd;
    }
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return out;
}

/* ------------------------------------------------------------------ GF(256) */

// Log/antilog tables for the QR field: generator 2, primitive polynomial 0x11D.
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

function initGaloisField(): void {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  // Doubled so an exponent sum of up to 508 needs no modulo.
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}
initGaloisField();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Coefficients of (x - 2^0)(x - 2^1)...(x - 2^(degree-1)), highest power first, leading 1 implied. */
function rsGenerator(degree: number): number[] {
  const poly = new Array<number>(degree).fill(0);
  poly[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      poly[j] = gfMul(poly[j], root);
      if (j + 1 < degree) poly[j] ^= poly[j + 1];
    }
    root = gfMul(root, 2);
  }
  return poly;
}

function rsRemainder(data: readonly number[], generator: readonly number[]): number[] {
  const degree = generator.length;
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < degree; i++) result[i] ^= gfMul(generator[i], factor);
  }
  return result;
}

/* ----------------------------------------------------------------- bitstream */

function appendBits(bits: number[], value: number, count: number): void {
  for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function bitsToCodewords(bits: readonly number[]): number[] {
  const out = new Array<number>(bits.length >> 3).fill(0);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) out[i >> 3] |= 0x80 >> (i & 7);
  }
  return out;
}

/** Mode indicator + count + payload, then terminator, byte alignment and the alternating pad bytes. */
function buildDataCodewords(bytes: readonly number[], version: number, ecc: QrEcc): number[] {
  const capacity = dataCodewords(version, ecc);
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4); // byte mode
  appendBits(bits, bytes.length, charCountBits(version));
  for (const b of bytes) appendBits(bits, b, 8);

  for (let i = 0; i < 4 && bits.length < capacity * 8; i++) bits.push(0); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = bitsToCodewords(bits);
  // 0xEC / 0x11 alternate because that pair keeps light and dark modules evenly spread.
  for (let pad = 0xec; codewords.length < capacity; pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

/** Split into group1/group2 blocks, add ECC per block, then interleave data and ECC codewords. */
function interleave(data: readonly number[], version: number, ecc: QrEcc): number[] {
  const numBlocks = ECC_BLOCKS[ecc][version];
  const eccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version];
  const rawCodewords = totalCodewords(version);
  // Short blocks (group 1) come first; the remainder each get one extra data codeword (group 2).
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const generator = rsGenerator(eccLen);

  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  for (let i = 0, offset = 0; i < numBlocks; i++) {
    const len = shortBlockLen - eccLen + (i < numShortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    eccBlocks.push(rsRemainder(block, generator));
  }

  const result: number[] = [];
  const longestData = shortBlockLen - eccLen + 1;
  for (let i = 0; i < longestData; i++) {
    for (const block of dataBlocks) {
      const cw = block[i];
      if (cw !== undefined) result.push(cw);
    }
  }
  for (let i = 0; i < eccLen; i++) {
    for (const block of eccBlocks) {
      const cw = block[i];
      if (cw !== undefined) result.push(cw);
    }
  }
  return result;
}

/* ------------------------------------------------------------------- canvas */

interface Canvas {
  size: number;
  /** [row][col] */
  modules: boolean[][];
  /** Function patterns and format/version areas, which data placement and masking must skip. */
  reserved: boolean[][];
}

function newCanvas(version: number): Canvas {
  const size = version * 4 + 17;
  const modules: boolean[][] = [];
  const reserved: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    modules.push(new Array<boolean>(size).fill(false));
    reserved.push(new Array<boolean>(size).fill(false));
  }
  return { size, modules, reserved };
}

/** Coordinates are (x = column, y = row); out-of-range writes are dropped so callers can overdraw. */
function setFunction(c: Canvas, x: number, y: number, dark: boolean): void {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const row = c.modules[y];
  const res = c.reserved[y];
  if (!row || !res) return;
  row[x] = dark;
  res[x] = true;
}

function moduleAt(c: Canvas, row: number, col: number): boolean {
  const r = c.modules[row];
  return r !== undefined && r[col] === true;
}

/** Alignment-pattern centres: always 6 and size-7, with evenly spaced centres between them. */
function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  // Version 32 is the one case the general spacing formula gets wrong.
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result: number[] = [6];
  for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

function drawFinder(c: Canvas, cx: number, cy: number): void {
  // -4..4 also paints the separators (always light) around the 7x7 pattern.
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(c, cx + dx, cy + dy, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(c: Canvas, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunction(c, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawFunctionPatterns(c: Canvas, version: number): void {
  for (let i = 0; i < c.size; i++) {
    setFunction(c, 6, i, i % 2 === 0);
    setFunction(c, i, 6, i % 2 === 0);
  }
  drawFinder(c, 3, 3);
  drawFinder(c, c.size - 4, 3);
  drawFinder(c, 3, c.size - 4);

  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      // The three finder corners have no alignment pattern.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      const cx = positions[j];
      const cy = positions[i];
      if (cx === undefined || cy === undefined) continue;
      drawAlignment(c, cx, cy);
    }
  }

  drawVersionInfo(c, version);
  // Reserve the format areas now; the real bits are rewritten once per candidate mask.
  drawFormatInfo(c, "M", 0);
}

/** BCH(18,6) version information, mirrored beside the top-right and bottom-left finders. */
function drawVersionInfo(c: Canvas, version: number): void {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0;
    const a = c.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunction(c, a, b, bit);
    setFunction(c, b, a, bit);
  }
}

/** BCH(15,5) format information, XORed with 0x5412 so no valid format is ever all-light. */
function drawFormatInfo(c: Canvas, ecc: QrEcc, mask: number): void {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;

  // Copy 1: down the right edge of the top-left finder, then back along its bottom edge.
  for (let i = 0; i <= 5; i++) setFunction(c, 8, i, bit(i));
  setFunction(c, 8, 7, bit(6));
  setFunction(c, 8, 8, bit(7));
  setFunction(c, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFunction(c, 14 - i, 8, bit(i));

  // Copy 2: right of the bottom-left finder, then under the top-right one.
  for (let i = 0; i < 8; i++) setFunction(c, c.size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFunction(c, 8, c.size - 15 + i, bit(i));
  setFunction(c, 8, c.size - 8, true); // the always-dark module
}

/** Zig-zag placement, two columns at a time from the right; leftover remainder bits stay light. */
function drawCodewords(c: Canvas, codewords: readonly number[]): void {
  const totalBits = codewords.length * 8;
  let i = 0;
  for (let right = c.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // step over the vertical timing column
    for (let vert = 0; vert < c.size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        // Direction alternates per column pair, counted from the right edge.
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? c.size - 1 - vert : vert;
        const row = c.modules[y];
        const res = c.reserved[y];
        if (!row || !res || res[x]) continue;
        if (i >= totalBits) continue;
        const cw = codewords[i >>> 3] ?? 0;
        row[x] = ((cw >>> (7 - (i & 7))) & 1) !== 0;
        i++;
      }
    }
  }
}

function maskAt(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row * col) % 3) + ((row + col) % 2)) % 2 === 0;
  }
}

/** XOR in place over non-reserved modules; applying the same mask twice restores the matrix. */
function applyMask(c: Canvas, mask: number): void {
  for (let r = 0; r < c.size; r++) {
    const row = c.modules[r];
    const res = c.reserved[r];
    if (!row || !res) continue;
    for (let col = 0; col < c.size; col++) {
      if (!res[col]) row[col] = row[col] !== maskAt(mask, r, col);
    }
  }
}

function penalty(c: Canvas): number {
  const size = c.size;
  let score = 0;

  // N1: runs of five or more same-coloured modules along a row or column.
  for (let i = 0; i < size; i++) {
    let runRow = 0;
    let runCol = 0;
    let lastRow: boolean | null = null;
    let lastCol: boolean | null = null;
    for (let j = 0; j < size; j++) {
      const a = moduleAt(c, i, j);
      if (a === lastRow) {
        runRow++;
      } else {
        if (runRow >= 5) score += N1 + (runRow - 5);
        lastRow = a;
        runRow = 1;
      }
      const b = moduleAt(c, j, i);
      if (b === lastCol) {
        runCol++;
      } else {
        if (runCol >= 5) score += N1 + (runCol - 5);
        lastCol = b;
        runCol = 1;
      }
    }
    if (runRow >= 5) score += N1 + (runRow - 5);
    if (runCol >= 5) score += N1 + (runCol - 5);
  }

  // N2: every 2x2 block of a single colour.
  for (let r = 0; r < size - 1; r++) {
    for (let col = 0; col < size - 1; col++) {
      const a = moduleAt(c, r, col);
      if (
        a === moduleAt(c, r, col + 1) &&
        a === moduleAt(c, r + 1, col) &&
        a === moduleAt(c, r + 1, col + 1)
      ) {
        score += N2;
      }
    }
  }

  // N3: the finder-like 1:1:3:1:1 run with four light modules beside it, matched as an 11-bit window.
  for (let i = 0; i < size; i++) {
    let windowRow = 0;
    let windowCol = 0;
    for (let j = 0; j < size; j++) {
      windowRow = ((windowRow << 1) & 0x7ff) | (moduleAt(c, i, j) ? 1 : 0);
      windowCol = ((windowCol << 1) & 0x7ff) | (moduleAt(c, j, i) ? 1 : 0);
      if (j < 10) continue;
      if (windowRow === 0x5d0 || windowRow === 0x05d) score += N3;
      if (windowCol === 0x5d0 || windowCol === 0x05d) score += N3;
    }
  }

  // N4: how far the proportion of dark modules strays from 50%, in 5% steps.
  let dark = 0;
  for (let r = 0; r < size; r++) {
    for (let col = 0; col < size; col++) {
      if (moduleAt(c, r, col)) dark++;
    }
  }
  const total = size * size;
  const k = Math.floor(Math.abs(dark * 100 - total * 50) / (total * 5));
  return score + k * N4;
}

/* ---------------------------------------------------------------- public API */

/** Encode text (UTF-8, byte mode) into a QR matrix. Throws if it does not fit. */
export function encodeQr(text: string, ecc: QrEcc = "M"): QrMatrix {
  if (typeof text !== "string") throw new Error("QR text must be a string");
  if (!ECC_LEVELS.includes(ecc)) throw new Error(`Unknown QR error-correction level: ${String(ecc)}`);

  const bytes = utf8Bytes(text);
  let version = 0;
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    if (fits(bytes.length, v, ecc)) {
      version = v;
      break;
    }
  }
  if (version === 0) {
    // 4 mode bits + 16 count bits cost two and a half codewords, so drop three to be safe.
    const max = dataCodewords(MAX_VERSION, ecc) - 3;
    throw new Error(
      `Text is too long for a QR code: ${bytes.length} UTF-8 bytes, but level ${ecc} holds at most ${max}.`,
    );
  }

  const codewords = interleave(buildDataCodewords(bytes, version, ecc), version, ecc);
  const canvas = newCanvas(version);
  drawFunctionPatterns(canvas, version);
  drawCodewords(canvas, codewords);

  // Each mask is scored on the finished symbol, so its own format bits go in before scoring.
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    drawFormatInfo(canvas, ecc, mask);
    applyMask(canvas, mask);
    const score = penalty(canvas);
    applyMask(canvas, mask);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }
  drawFormatInfo(canvas, ecc, bestMask);
  applyMask(canvas, bestMask);

  return { size: canvas.size, modules: canvas.modules, version, ecc };
}

/** Render a matrix as an SVG path "d" string, one module = one 1x1 unit, origin at 0,0. */
export function qrToPathData(m: QrMatrix): string {
  const parts: string[] = [];
  for (let r = 0; r < m.size; r++) {
    const row = m.modules[r];
    if (!row) continue;
    let col = 0;
    while (col < m.size) {
      if (!row[col]) {
        col++;
        continue;
      }
      // Merge each horizontal run into one rectangle to keep the path short.
      let end = col;
      while (end < m.size && row[end]) end++;
      const len = end - col;
      parts.push(`M${col} ${r}h${len}v1h-${len}z`);
      col = end;
    }
  }
  return parts.join("");
}

/** Render a matrix as a standalone <svg> string. quietZone is in modules (default 4). */
export function qrToSvg(
  m: QrMatrix,
  opts: {
    size?: number;
    quietZone?: number;
    dark?: string;
    light?: string;
    idPrefix?: string;
  } = {},
): string {
  const px = opts.size ?? 90;
  const quiet = opts.quietZone ?? 4;
  const dark = opts.dark ?? "#000000";
  const light = opts.light ?? "#ffffff";
  const span = m.size + quiet * 2;
  const titleId = `${opts.idPrefix ?? "qr"}-title`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" ` +
    `viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges" role="img" aria-labelledby="${titleId}">` +
    `<title id="${titleId}">QR code</title>` +
    `<rect width="${span}" height="${span}" fill="${light}"/>` +
    `<path transform="translate(${quiet} ${quiet})" fill="${dark}" d="${qrToPathData(m)}"/>` +
    `</svg>`
  );
}
