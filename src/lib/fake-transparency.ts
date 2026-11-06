/**
 * Fake transparency. Many logos found online as "transparent PNG" are not see-through at all: the grey and
 * white squares an image editor shows behind a see-through picture are painted into the picture itself.
 * Uploaded as they are, those squares show behind the logo on the page. This finds such a pattern and makes
 * it truly see-through, in the browser, before the image is uploaded. A logo without the pattern (a truly
 * transparent PNG, a plain white background, a photo) is left exactly as it was.
 *
 * The pattern is told from the logo by its grid: two neutral shades alternating in squares of one size, on
 * one grid across the whole image. A pixel is part of it only where it has the shade its square should have,
 * so the white parts of a logo stay (only a square's worth along an edge where a white part touches a white
 * square directly cannot be told apart).
 */

type RGB = [number, number, number];

/** The painted squares found in an image. */
export interface Checker {
  /** The two shades, as found. */
  a: RGB;
  b: RGB;
  /** Their brightness, and how far a pixel may be from it and still count as that shade. */
  la: number;
  lb: number;
  tol: number;
  /** Square size and where the grid starts, in pixels, across (x) and down (y). */
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  /** Which squares (by the parity of their column + row) have shade a. */
  aParity: 0 | 1;
}

/** A pixel this opaque or more can be part of the painted squares. */
const OPAQUE = 250;
/** Most a pixel's channels may differ and it still counts as grey. */
const NEUTRAL = 18;
/** Pixels this close to a square's edge may be a blend of two squares (a resized or blurred image). */
const EDGE = 1;
/** How far around a blended pixel both shades are looked for. */
const SANDWICH = 2;

const lumOf = (d: ArrayLike<number>, i: number) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
const neutralAt = (d: ArrayLike<number>, i: number) =>
  Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) <= NEUTRAL;

function median(v: number[]): number {
  const s = [...v].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Every pixel on the image's outer edge, as data indexes. */
function ring(w: number, h: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) {
    out.push(x * 4, ((h - 1) * w + x) * 4);
  }
  for (let y = 1; y < h - 1; y++) {
    out.push(y * w * 4, (y * w + w - 1) * 4);
  }
  return out;
}

const A = 1;
const B = 2;
const MID = 3;
const OTHER = 0;

/** Where along one line of pixels the squares change shade, and the widths of the whole squares between. */
function lineEdges(d: ArrayLike<number>, at: (k: number) => number, n: number, la: number, lb: number, tol: number) {
  const lo = Math.min(la, lb);
  const hi = Math.max(la, lb);
  const runs: { c: number; s: number; e: number }[] = [];
  for (let k = 0; k < n; k++) {
    const i = at(k);
    let c = OTHER;
    if (d[i + 3] >= OPAQUE && neutralAt(d, i)) {
      const l = lumOf(d, i);
      if (Math.abs(l - la) <= tol) c = A;
      else if (Math.abs(l - lb) <= tol) c = B;
      else if (l > lo && l < hi) c = MID;
    }
    const last = runs[runs.length - 1];
    if (last && last.c === c) last.e = k + 1;
    else runs.push({ c, s: k, e: k + 1 });
  }

  const edges: number[] = [];
  const widths: number[] = [];
  let prev: number | null = null;
  let prevRun = -1;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (r.c === OTHER) {
      prev = null;
      continue;
    }
    if (r.c === MID) continue;
    // The next square: right after, or after a pixel or two blended from both.
    let j = i + 1;
    let gap = 0;
    while (j < runs.length && runs[j].c === MID) {
      gap += runs[j].e - runs[j].s;
      j++;
    }
    if (j >= runs.length || gap > 2 || runs[j].c === OTHER || runs[j].c === r.c) {
      prev = null;
      continue;
    }
    const edge = (r.e + runs[j].s) / 2;
    if (prev !== null && prevRun === i) widths.push(edge - prev);
    edges.push(edge);
    prev = edge;
    prevRun = j;
  }
  return { edges, widths };
}

/** The square size and grid start on one axis, from the shade changes found along it; null if they are not one grid. */
function fitAxis(edges: number[], widths: number[]): { s: number; o: number } | null {
  if (widths.length < 6 || edges.length < 6) return null;
  const s0 = median(widths);
  if (s0 < 3) return null;
  const close = widths.filter((v) => Math.abs(v - s0) <= Math.max(1, s0 * 0.12));
  if (close.length < widths.length * 0.75) return null;

  // Every change lies on one grid, edge = o + k * s; fitted twice, the second time with the first fit's k.
  let s = close.reduce((t, v) => t + v, 0) / close.length;
  let o = edges[0];
  for (let pass = 0; pass < 2; pass++) {
    let n = 0;
    let sk = 0;
    let se = 0;
    let skk = 0;
    let ske = 0;
    for (const e of edges) {
      const k = Math.round((e - o) / s);
      n++;
      sk += k;
      se += e;
      skk += k * k;
      ske += k * e;
    }
    const den = n * skk - sk * sk;
    if (den <= 0) return null;
    s = (n * ske - sk * se) / den;
    o = (se - s * sk) / n;
    if (!(s >= 3)) return null;
  }
  const near = edges.filter((e) => Math.abs(e - (o + Math.round((e - o) / s) * s)) <= Math.max(1, s * 0.15));
  if (near.length < edges.length * 0.8) return null;
  if (Math.abs(s - s0) > Math.max(1, s0 * 0.15)) return null;
  return { s, o: ((o % s) + s) % s };
}

/**
 * Grid helpers for one axis: which square a pixel is in, whether it sits close to a square's edge, and which
 * way that nearest edge is (-1 before it, 1 after).
 */
function axis(n: number, s: number, o: number, edge: number) {
  const cell = new Int32Array(n);
  const near = new Uint8Array(n);
  const side = new Int8Array(n);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5 - o) / s;
    const f = t - Math.floor(t);
    cell[k] = Math.floor(t);
    near[k] = Math.min(f, 1 - f) * s < edge ? 1 : 0;
    side[k] = f < 0.5 ? -1 : 1;
  }
  return { cell, near, side };
}

/**
 * The painted squares in an image (RGBA data, w x h), or null when it has none: when its edge is not mostly
 * two greys alternating in squares on one grid.
 */
export function findChecker(d: ArrayLike<number>, w: number, h: number): Checker | null {
  if (w < 16 || h < 16) return null;

  // The two shades: the two most common greys around the image's edge.
  const edgePx = ring(w, h);
  const hist = new Float64Array(256);
  let greys = 0;
  for (const i of edgePx) {
    if (d[i + 3] >= OPAQUE && neutralAt(d, i)) {
      hist[Math.round(lumOf(d, i))]++;
      greys++;
    }
  }
  if (greys < edgePx.length * 0.3) return null;
  const around = (l: number) => {
    let t = 0;
    for (let k = Math.max(0, l - 2); k <= Math.min(255, l + 2); k++) t += hist[k];
    return t;
  };
  let p1 = 0;
  for (let l = 1; l < 256; l++) if (around(l) > around(p1)) p1 = l;
  let p2 = -1;
  for (let l = 0; l < 256; l++) if (Math.abs(l - p1) >= 8 && (p2 < 0 || around(l) > around(p2))) p2 = l;
  if (p2 < 0 || around(p2) < greys * 0.1) return null;
  const peak = (p: number) => {
    let t = 0;
    let n = 0;
    for (let k = Math.max(0, p - 3); k <= Math.min(255, p + 3); k++) {
      t += k * hist[k];
      n += hist[k];
    }
    return n ? t / n : p;
  };
  const la = peak(p1);
  const lb = peak(p2);
  const tol = Math.min(14, Math.max(3, Math.abs(la - lb) / 2 - 1));

  let na = 0;
  let nb = 0;
  for (const i of edgePx) {
    if (d[i + 3] < OPAQUE || !neutralAt(d, i)) continue;
    const l = lumOf(d, i);
    if (Math.abs(l - la) <= tol) na++;
    else if (Math.abs(l - lb) <= tol) nb++;
  }
  if (na + nb < edgePx.length * 0.3 || Math.min(na, nb) < (na + nb) * 0.15) return null;

  // The grid: shade changes along rows give it across, along columns give it down. Rows and columns are
  // taken at the edges and across the image, where the squares show beside the logo.
  const lines = (n: number) => {
    const set = new Set<number>([0, 1, n - 2, n - 1]);
    for (let i = 1; i < 16; i++) set.add(Math.round((n * i) / 16));
    return [...set].filter((v) => v >= 0 && v < n);
  };
  const rows = lines(h);
  const cols = lines(w);
  const xe: number[] = [];
  const xw: number[] = [];
  for (const y of rows) {
    const r = lineEdges(d, (k) => (y * w + k) * 4, w, la, lb, tol);
    xe.push(...r.edges);
    xw.push(...r.widths);
  }
  const ye: number[] = [];
  const yw: number[] = [];
  for (const x of cols) {
    const r = lineEdges(d, (k) => (k * w + x) * 4, h, la, lb, tol);
    ye.push(...r.edges);
    yw.push(...r.widths);
  }
  const fx = fitAxis(xe, xw);
  const fy = fitAxis(ye, yw);
  if (!fx || !fy) return null;
  // Squares, not stripes or tiles of another shape; at least three across and down.
  if (Math.abs(fx.s - fy.s) > Math.max(1, Math.max(fx.s, fy.s) * 0.15)) return null;
  if (fx.s * 3 > w || fy.s * 3 > h) return null;

  // Which squares have which shade, and the shades' colours, from the same rows and columns, away from
  // square edges (the image's own edge can lie wholly on one when its size is a whole number of squares).
  const sample: number[] = [];
  for (const y of rows) for (let x = 0; x < w; x++) sample.push((y * w + x) * 4);
  for (const x of cols) for (let y = 0; y < h; y++) sample.push((y * w + x) * 4);
  const ax = axis(w, fx.s, fx.o, EDGE);
  const ay = axis(h, fy.s, fy.o, EDGE);
  const count = [
    [0, 0],
    [0, 0],
  ];
  const sum: number[][][] = [
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  ];
  for (const i of sample) {
    if (d[i + 3] < OPAQUE || !neutralAt(d, i)) continue;
    const px = (i >> 2) % w;
    const py = Math.floor((i >> 2) / w);
    if (ax.near[px] || ay.near[py]) continue;
    const l = lumOf(d, i);
    const shade = Math.abs(l - la) <= tol ? 0 : Math.abs(l - lb) <= tol ? 1 : -1;
    if (shade < 0) continue;
    const parity = (ax.cell[px] + ay.cell[py]) & 1;
    count[parity][shade]++;
    const acc = sum[parity][shade];
    acc[0] += d[i];
    acc[1] += d[i + 1];
    acc[2] += d[i + 2];
    acc[3]++;
  }
  const straight = count[0][0] + count[1][1];
  const crossed = count[0][1] + count[1][0];
  const total = straight + crossed;
  if (total < 20 || Math.max(straight, crossed) < total * 0.9) return null;
  const aParity: 0 | 1 = straight >= crossed ? 0 : 1;
  const colour = (shade: 0 | 1): RGB => {
    const acc = sum[shade === 0 ? aParity : 1 - aParity][shade];
    if (!acc[3]) return [0, 0, 0];
    return [acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3]];
  };
  if (!count[aParity][0] || !count[1 - aParity][1]) return null;

  return { a: colour(0), b: colour(1), la, lb, tol, sx: fx.s, sy: fy.s, ox: fx.o, oy: fy.o, aParity };
}

/** For each pixel along one axis: the nearest pixel inside the square before and after its own, and how far each is. */
function besides(n: number, s: number, o: number, g: { cell: Int32Array; near: Uint8Array }) {
  const before = new Int32Array(n).fill(-1);
  const after = new Int32Array(n).fill(-1);
  const dBefore = new Float32Array(n);
  const dAfter = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const start = o + g.cell[k] * s;
    const end = start + s;
    const b = Math.floor(start - EDGE - 0.5);
    const a = Math.ceil(end + EDGE - 0.5);
    if (b >= 0 && g.cell[b] === g.cell[k] - 1 && !g.near[b]) before[k] = b;
    if (a < n && g.cell[a] === g.cell[k] + 1 && !g.near[a]) after[k] = a;
    dBefore[k] = k + 0.5 - start + 1;
    dAfter[k] = end - (k + 0.5) + 1;
  }
  return { before, after, dBefore, dAfter };
}

/**
 * Makes the painted squares see-through (alpha 0), in place. Returns how many pixels were cleared.
 *
 * A pixel goes when it has the shade its square should have, unless the logo, in that same shade, most likely
 * covers it: the squares beside its own show that shade where theirs should be (the logo) on the sides it is
 * nearest. So a white part of the logo stays even where it lies over white squares, and a white square beside
 * a coloured part goes whole. A patch is cleared only when it holds both shades in their places.
 */
export function clearChecker(d: Uint8ClampedArray | Uint8Array, w: number, h: number, c: Checker): number {
  const ax = axis(w, c.sx, c.ox, EDGE);
  const ay = axis(h, c.sy, c.oy, EDGE);
  const bx = besides(w, c.sx, c.ox, ax);
  const by = besides(h, c.sy, c.oy, ay);
  const lo = Math.min(c.la, c.lb) - c.tol;
  const hi = Math.max(c.la, c.lb) + c.tol;
  const near = c.tol + 4;

  // Each pixel's shade: 0 (a), 1 (b), or -1 (neither: the logo's own colours).
  const shade = new Int8Array(w * h).fill(-1);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    if (d[i + 3] < OPAQUE) continue;
    const da = Math.max(Math.abs(d[i] - c.a[0]), Math.abs(d[i + 1] - c.a[1]), Math.abs(d[i + 2] - c.a[2]));
    const db = Math.max(Math.abs(d[i] - c.b[0]), Math.abs(d[i + 1] - c.b[1]), Math.abs(d[i + 2] - c.b[2]));
    if (Math.min(da, db) <= near) shade[p] = da <= db ? 0 : 1;
  }

  /**
   * The logo, in shade s, most likely covers (x, y): going by the squares beside its own, along its row and
   * its column. The logo on both sides of a row or column runs through it (a stroke across the square);
   * otherwise the nearer sides count for more.
   */
  const covered = (x: number, y: number, s: number) => {
    let all = 0;
    let logo = 0;
    /** 1: the logo (shade s where the other shade belongs), 0: the squares, -1: cannot tell. */
    const look = (q: number, dist: number) => {
      if (q < 0) return -1;
      const v = shade[q];
      if (v === s) {
        all += 1 / dist;
        logo += 1 / dist;
        return 1;
      }
      if (v === 1 - s) {
        all += 1 / dist;
        return 0;
      }
      return -1;
    };
    const left = look(bx.before[x] < 0 ? -1 : y * w + bx.before[x], bx.dBefore[x]);
    const right = look(bx.after[x] < 0 ? -1 : y * w + bx.after[x], bx.dAfter[x]);
    const up = look(by.before[y] < 0 ? -1 : by.before[y] * w + x, by.dBefore[y]);
    const down = look(by.after[y] < 0 ? -1 : by.after[y] * w + x, by.dAfter[y]);
    if ((left === 1 && right === 1) || (up === 1 && down === 1)) return true;
    return logo > 0 && logo >= all / 2;
  };

  // 1, 2: inside a square, in its own shade (a, b), not under the logo; 3: by a square's edge, part of the squares.
  const bg = new Uint8Array(w * h);
  const blends: number[] = [];
  const spills: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      if (d[i + 3] < OPAQUE) continue;
      const own = ((ax.cell[x] + ay.cell[y]) & 1) === c.aParity ? 0 : 1;
      const byEdge = ax.near[x] || ay.near[y];
      if (shade[p] === own) {
        if (!covered(x, y, own)) bg[p] = byEdge ? 3 : own + 1;
        continue;
      }
      if (!byEdge) continue;
      // By a square's edge, the next square's shade spilling over (the grid found is a little off): part of
      // the squares only where that square, just across the edge, is.
      if (shade[p] === 1 - own) {
        spills.push(p);
        continue;
      }
      // Or a blend of the two shades.
      if (neutralAt(d, i)) {
        const l = lumOf(d, i);
        if (l >= lo && l <= hi) blends.push(p);
      }
    }
  }
  for (const p of spills) {
    const x = p % w;
    const y = (p - x) / w;
    const steps: [number, number][] = [];
    if (ax.near[x]) steps.push([ax.side[x], 0]);
    if (ay.near[y]) steps.push([0, ay.side[y]]);
    if (steps.length === 2) steps.push([ax.side[x], ay.side[y]]);
    const across = steps.some(([sx, sy]) =>
      [1, 2].some((k) => {
        const xx = x + sx * k;
        const yy = y + sy * k;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) return false;
        const q = yy * w + xx;
        return bg[q] !== 0 && shade[q] === shade[p];
      }),
    );
    if (across) bg[p] = 3;
  }
  // Blends are part of the squares only with both shades, in place, right around them.
  for (const p of blends) {
    const x = p % w;
    const y = (p - x) / w;
    let seen = 0;
    for (let yy = Math.max(0, y - SANDWICH); yy <= Math.min(h - 1, y + SANDWICH) && seen !== 3; yy++) {
      for (let xx = Math.max(0, x - SANDWICH); xx <= Math.min(w - 1, x + SANDWICH); xx++) {
        const v = bg[yy * w + xx];
        if (v === 1 || v === 2) seen |= v;
      }
    }
    if (seen === 3) bg[p] = 3;
  }

  // Patches: cleared only when they hold both shades, each over a good part of a square.
  const inner = Math.max(1, Math.min(c.sx, c.sy) - 2 * EDGE);
  const enough = Math.max(1, Math.floor(0.25 * inner * inner));
  const seenPx = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let cleared = 0;
  for (let start = 0; start < w * h; start++) {
    if (!bg[start] || seenPx[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seenPx[start] = 1;
    let ca = 0;
    let cb = 0;
    while (head < tail) {
      const p = queue[head++];
      if (bg[p] === 1) ca++;
      else if (bg[p] === 2) cb++;
      const x = p % w;
      const tryPx = (q: number) => {
        if (bg[q] && !seenPx[q]) {
          seenPx[q] = 1;
          queue[tail++] = q;
        }
      };
      if (x > 0) tryPx(p - 1);
      if (x < w - 1) tryPx(p + 1);
      if (p >= w) tryPx(p - w);
      if (p < w * (h - 1)) tryPx(p + w);
    }
    if (ca < enough || cb < enough) continue;
    for (let k = 0; k < tail; k++) {
      const i = queue[k] * 4;
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
      cleared++;
    }
  }
  if (!cleared) return 0;
  cleared += clearSpecks(d, w, h, c, lo, hi);
  softenEdges(d, w, h, c);
  return cleared;
}

/**
 * Specks the squares left behind (a heavily compressed image's noise): small islands, under half a square,
 * standing alone in the cleared part, that are almost all greys of the squares' range. A small part of the
 * logo in its own colours stays. Returns how many pixels were cleared.
 */
function clearSpecks(d: Uint8ClampedArray | Uint8Array, w: number, h: number, c: Checker, lo: number, hi: number): number {
  const most = Math.max(4, Math.floor(0.5 * c.sx * c.sy));
  const seen = new Uint8Array(w * h);
  const island: number[] = [];
  let cleared = 0;
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || d[start * 4 + 3] === 0) continue;
    // The island (8-way, so a logo's diagonal strokes stay one piece), given up on once it is too large.
    island.length = 0;
    const stack = [start];
    seen[start] = 1;
    let large = false;
    let greys = 0;
    while (stack.length) {
      const p = stack.pop()!;
      island.push(p);
      const i = p * 4;
      if (neutralAt(d, i)) {
        const l = lumOf(d, i);
        if (l >= lo && l <= hi) greys++;
      }
      const x = p % w;
      const y = (p - x) / w;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
          const q = yy * w + xx;
          if (seen[q] || d[q * 4 + 3] === 0) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
      if (island.length > most) large = true;
    }
    if (large || greys < island.length * 0.8) continue;
    for (const p of island) {
      d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = d[p * 4 + 3] = 0;
      cleared++;
    }
  }
  return cleared;
}

/** How far (in pixels) from the cleared squares the logo's edge is looked at, and where its own colour is taken. */
const FRINGE = 2;
const SOLID = 3;

/**
 * The logo's edge, where the image blended it with the squares: each such pixel is taken apart into the
 * logo's own colour (from the solid logo just inside) and how much of it covers the pixel, so the edge is
 * smooth and see-through rather than ringed with grey. A pixel the logo's colour cannot be told from the
 * squares' (white logo on white) is left as it is.
 */
function softenEdges(d: Uint8ClampedArray | Uint8Array, w: number, h: number, c: Checker) {
  // Steps (4-way) from the nearest cleared pixel, up to SOLID; beyond that, SOLID.
  const dist = new Uint8Array(w * h).fill(SOLID);
  let front: number[] = [];
  for (let p = 0; p < w * h; p++) {
    if (d[p * 4 + 3] === 0) {
      dist[p] = 0;
      front.push(p);
    }
  }
  for (let step = 1; step < SOLID && front.length; step++) {
    const next: number[] = [];
    for (const p of front) {
      const x = p % w;
      const visit = (q: number) => {
        if (dist[q] > step) {
          dist[q] = step;
          next.push(q);
        }
      };
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (p >= w) visit(p - w);
      if (p < w * (h - 1)) visit(p + w);
    }
    front = next;
  }

  const shades = [c.a, c.b];
  const out = new Uint8ClampedArray(d);
  for (let p = 0; p < w * h; p++) {
    const k = dist[p];
    if (k === 0 || k > FRINGE) continue;
    const i = p * 4;
    if (d[i + 3] < OPAQUE) continue;
    const x = p % w;
    const y = (p - x) / w;
    // The logo's own colour: the solid logo close by.
    let n = 0;
    const logo = [0, 0, 0];
    for (let yy = Math.max(0, y - SOLID); yy <= Math.min(h - 1, y + SOLID); yy++) {
      for (let xx = Math.max(0, x - SOLID); xx <= Math.min(w - 1, x + SOLID); xx++) {
        const q = yy * w + xx;
        if (dist[q] < SOLID || d[q * 4 + 3] < OPAQUE) continue;
        logo[0] += d[q * 4];
        logo[1] += d[q * 4 + 1];
        logo[2] += d[q * 4 + 2];
        n++;
      }
    }
    if (!n) continue;
    logo[0] /= n;
    logo[1] /= n;
    logo[2] /= n;
    // The pixel as logo over one of the two shades: whichever explains it better.
    let best: { alpha: number; miss: number; e: RGB } | null = null;
    for (const e of shades) {
      const dr = logo[0] - e[0];
      const dg = logo[1] - e[1];
      const db = logo[2] - e[2];
      const span = dr * dr + dg * dg + db * db;
      if (span < 30 * 30) continue;
      const alpha = Math.min(1, Math.max(0, ((d[i] - e[0]) * dr + (d[i + 1] - e[1]) * dg + (d[i + 2] - e[2]) * db) / span));
      const miss = Math.hypot(d[i] - (e[0] + alpha * dr), d[i + 1] - (e[1] + alpha * dg), d[i + 2] - (e[2] + alpha * db));
      if (!best || miss < best.miss) best = { alpha, miss, e };
    }
    // Not a blend of the two (a detail of the logo's own), or all logo: left as it is.
    if (!best || best.miss > 40 || best.alpha >= 0.94) continue;
    if (best.alpha < 0.06) {
      out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
      continue;
    }
    // Mostly logo: its own colour with the squares' share taken out; mostly squares: the logo's colour nearby.
    const a = best.alpha;
    const e = best.e;
    for (let ch = 0; ch < 3; ch++) {
      out[i + ch] = a >= 0.5 ? (d[i + ch] - (1 - a) * e[ch]) / a : logo[ch];
    }
    out[i + 3] = Math.round(a * 255);
  }
  d.set(out);
}

/** Images at most this many pixels across and down are looked at; larger ones go up as they are. */
const MAX_SIDE = 4096;

/**
 * The image to upload: with any painted squares behind the logo made see-through (then always a PNG, the
 * name ending .png), or the very file given when it has none, is not a PNG, JPG or WebP, or cannot be read.
 * maxBytes: the most the upload may be; a cleared image larger than that is made smaller until it fits.
 */
export async function withoutFakeTransparency(file: File, maxBytes: number): Promise<{ file: File; cleared: boolean }> {
  const unchanged = { file, cleared: false };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["png", "jpg", "jpeg", "webp"].includes(ext)) return unchanged;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return unchanged;
  try {
    const bmp = await createImageBitmap(file);
    const w = bmp.width;
    const h = bmp.height;
    if (w < 16 || h < 16 || w > MAX_SIDE || h > MAX_SIDE) {
      bmp.close();
      return unchanged;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      bmp.close();
      return unchanged;
    }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const img = ctx.getImageData(0, 0, w, h);
    const found = findChecker(img.data, w, h);
    if (!found || clearChecker(img.data, w, h, found) === 0) return unchanged;
    ctx.putImageData(img, 0, 0);

    let out = await pngOf(canvas);
    // Too large as a PNG: halved until it fits, still sharp at the sizes the page shows a logo.
    let side = Math.max(w, h);
    while (out && out.size > maxBytes && side > 256) {
      side = Math.floor(side / 2);
      const k = side / Math.max(w, h);
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(w * k));
      small.height = Math.max(1, Math.round(h * k));
      const sctx = small.getContext("2d");
      if (!sctx) break;
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(canvas, 0, 0, small.width, small.height);
      out = await pngOf(small);
    }
    if (!out || out.size > maxBytes) return unchanged;
    const base = file.name.replace(/\.[^.]*$/, "") || "logo";
    return { file: new File([out], `${base}.png`, { type: "image/png" }), cleared: true };
  } catch {
    return unchanged;
  }
}

function pngOf(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
