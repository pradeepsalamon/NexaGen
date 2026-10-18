// PDF chess-diagram recognition — the pure core.
//
// Runs on a grayscale page image (0 = black, 255 = white) and never touches a
// DOM, a canvas or a chess library, so the web app (which renders PDF pages
// with pdf.js in the coach's browser) and the API's Jest suite run the very
// same code. Classical image processing, no ML model:
//
//   1. detectDiagramBoards — square connected components on a downscaled page,
//      each refined to its 8×8 grid and kept only if its squares really
//      alternate light/dark (an 8×8 table of numbers does not).
//   2. recognizeDiagramBoard — each square is compared with an estimate of the
//      empty light / dark square; what differs is the piece. Its silhouette is
//      matched against DIAGRAM_PIECE_TEMPLATES (the vendored piece sets), its
//      colour comes from how much of it is ink.
//   3. diagramGridToPlacement + the orientation / side-to-move helpers turn the
//      grid into a FEN placement, saying which fields are known and which are
//      a guess the coach must confirm.
//
// Accuracy is measured on the fixtures in apps/api/src/common/chess/__fixtures__
// — it is NOT a promise about every book font. Everything this returns is a
// candidate for coach review.

import {
  DIAGRAM_PIECE_TEMPLATES,
  DIAGRAM_TEMPLATE_SIZE,
  type DiagramPieceTemplate,
} from "./diagram-piece-templates";

export { DIAGRAM_PIECE_TEMPLATES, type DiagramPieceTemplate } from "./diagram-piece-templates";

export type GrayImage = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};

export type DiagramRect = { x: number; y: number; w: number; h: number };
export type DiagramOrientation = "white" | "black";
export type DiagramSide = "w" | "b";

export type DiagramBoardCandidate = {
  rect: DiagramRect;
  /** Mean brightness gap between light and dark squares (0–255). */
  contrast: number;
  /** Share of the 64 squares whose shade matches the checkerboard. */
  agreement: number;
};

export type RecognizedSquare = {
  /** 0 = top row of the diagram as printed. */
  row: number;
  /** 0 = left column of the diagram as printed. */
  col: number;
  /** FEN letter (upper case = white) or null for an empty square. */
  piece: string | null;
  /** 0–1. Below DIAGRAM_LOW_CONFIDENCE the square is flagged for review. */
  confidence: number;
  /** The runner-up reading, when there was a close one. */
  alternative: string | null;
};

export type RecognizedDiagram = {
  rect: DiagramRect;
  /** 64 squares, row-major from the top-left corner as printed. */
  squares: RecognizedSquare[];
  /** grid[row][col] as printed (not yet oriented). */
  grid: (string | null)[][];
  meanConfidence: number;
  lowConfidenceCount: number;
};

export const DIAGRAM_LOW_CONFIDENCE = 0.5;

/** Hard limits that keep a hostile or huge page from stalling the tab. */
export const DIAGRAM_LIMITS = {
  /** Longest side of the image the detector scans (it downsamples to this). */
  detectMaxSide: 1100,
  /** Boards per page; anything beyond is almost certainly a false positive. */
  maxBoardsPerPage: 12,
  /** Smallest board side, in source pixels, worth reading (≈ 12px squares). */
  minBoardSide: 96,
} as const;

const CELL_SAMPLES = 32;
const CELL_INSET = 0.03;

// ── image helpers ────────────────────────────────────────────────────────────

export function rgbaToGray(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 1, p += 4) {
    // Transparent pixels (pdf.js renders onto white, but be safe) count as paper.
    const a = rgba[p + 3] / 255;
    const v = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    data[i] = Math.round(v * a + 255 * (1 - a));
  }
  return { width, height, data };
}

/** Summed-area table of a crop of `img`, for O(1) box means. */
class Integral {
  readonly w: number;
  readonly h: number;
  private readonly t: Float64Array;

  constructor(
    img: GrayImage,
    readonly ox: number,
    readonly oy: number,
    w: number,
    h: number,
  ) {
    this.w = w;
    this.h = h;
    const W = w + 1;
    this.t = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y += 1) {
      let row = 0;
      const src = (oy + y) * img.width + ox;
      for (let x = 0; x < w; x += 1) {
        row += img.data[src + x];
        this.t[(y + 1) * W + x + 1] = this.t[y * W + x + 1] + row;
      }
    }
  }

  /** Mean over [x0,x1)×[y0,y1) in IMAGE coordinates (clamped to the crop). */
  mean(x0: number, y0: number, x1: number, y1: number): number {
    const W = this.w + 1;
    const ax = clampInt(Math.floor(x0 - this.ox), 0, this.w);
    const ay = clampInt(Math.floor(y0 - this.oy), 0, this.h);
    let bx = clampInt(Math.ceil(x1 - this.ox), 0, this.w);
    let by = clampInt(Math.ceil(y1 - this.oy), 0, this.h);
    if (bx <= ax) bx = Math.min(this.w, ax + 1);
    if (by <= ay) by = Math.min(this.h, ay + 1);
    const area = (bx - ax) * (by - ay);
    if (area <= 0) return 255;
    const s = this.t[by * W + bx] - this.t[ay * W + bx] - this.t[by * W + ax] + this.t[ay * W + ax];
    return s / area;
  }
}

function clampInt(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function downsample(img: GrayImage, factor: number): GrayImage {
  if (factor <= 1) return img;
  const width = Math.max(1, Math.floor(img.width / factor));
  const height = Math.max(1, Math.floor(img.height / factor));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let s = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const row = (y * factor + dy) * img.width + x * factor;
        for (let dx = 0; dx < factor; dx += 1) s += img.data[row + dx];
      }
      data[y * width + x] = s / (factor * factor);
    }
  }
  return { width, height, data };
}

// ── 1. board detection ───────────────────────────────────────────────────────

type Component = { minX: number; minY: number; maxX: number; maxY: number; count: number };

/** 8-connected components of `mask` (two-pass union-find). */
function components(mask: Uint8Array, width: number, height: number): Component[] {
  const labels = new Int32Array(width * height);
  const parent: number[] = [0];
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const neighbours: number[] = [];
      if (x > 0 && labels[i - 1]) neighbours.push(labels[i - 1]);
      if (y > 0) {
        const up = i - width;
        if (labels[up]) neighbours.push(labels[up]);
        if (x > 0 && labels[up - 1]) neighbours.push(labels[up - 1]);
        if (x < width - 1 && labels[up + 1]) neighbours.push(labels[up + 1]);
      }
      if (neighbours.length === 0) {
        parent.push(parent.length);
        labels[i] = parent.length - 1;
      } else {
        let m = neighbours[0];
        for (const n of neighbours) if (n < m) m = n;
        labels[i] = m;
        for (const n of neighbours) union(m, n);
      }
    }
  }
  const boxes = new Map<number, Component>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const l = labels[y * width + x];
      if (!l) continue;
      const r = find(l);
      const b = boxes.get(r);
      if (!b) boxes.set(r, { minX: x, minY: y, maxX: x, maxY: y, count: 1 });
      else {
        if (x < b.minX) b.minX = x;
        if (x > b.maxX) b.maxX = x;
        if (y < b.minY) b.minY = y;
        if (y > b.maxY) b.maxY = y;
        b.count += 1;
      }
    }
  }
  return [...boxes.values()];
}

/**
 * Finds the chess diagrams on a page. Each result is a refined 8×8 grid whose
 * squares alternate light/dark with a light top-left square — the one layout
 * every standard diagram shares, whichever side is at the bottom.
 */
export function detectDiagramBoards(img: GrayImage): DiagramBoardCandidate[] {
  const factor = Math.max(1, Math.ceil(Math.max(img.width, img.height) / DIAGRAM_LIMITS.detectMaxSide));
  const small = downsample(img, factor);
  const { width, height } = small;
  // "Not paper": text, frames, tinted or hatched squares, pieces.
  const raw = new Uint8Array(width * height);
  for (let i = 0; i < raw.length; i += 1) raw[i] = small.data[i] < 205 ? 1 : 0;
  // One-pixel dilation bridges hatching and squares that only touch at corners.
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx >= 0 && xx < width && raw[yy * width + xx]) {
            on = 1;
            break;
          }
        }
      }
      mask[y * width + x] = on;
    }
  }
  const minSide = Math.max(DIAGRAM_LIMITS.minBoardSide / factor, Math.min(width, height) * 0.06);
  const found: DiagramBoardCandidate[] = [];
  const comps = components(mask, width, height)
    .filter((c) => {
      const w = c.maxX - c.minX + 1;
      const h = c.maxY - c.minY + 1;
      const aspect = w / h;
      return w >= minSide && h >= minSide && aspect >= 0.8 && aspect <= 1.25;
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);
  for (const c of comps) {
    const approx: DiagramRect = {
      x: c.minX * factor,
      y: c.minY * factor,
      w: (c.maxX - c.minX + 1) * factor,
      h: (c.maxY - c.minY + 1) * factor,
    };
    const refined = refineDiagramBoard(img, approx);
    if (refined && refined.contrast >= 18 && refined.agreement >= 0.9) found.push(refined);
  }
  // Overlapping hits (a board and its own frame) collapse to the best one.
  found.sort((a, b) => b.contrast * b.agreement - a.contrast * a.agreement);
  const kept: DiagramBoardCandidate[] = [];
  for (const cand of found) {
    if (kept.every((k) => overlap(k.rect, cand.rect) < 0.3)) kept.push(cand);
    if (kept.length >= DIAGRAM_LIMITS.maxBoardsPerPage) break;
  }
  // Reading order: top to bottom, then left to right within a band.
  return kept.sort((a, b) => {
    const band = Math.min(a.rect.h, b.rect.h) / 2;
    return Math.abs(a.rect.y - b.rect.y) > band ? a.rect.y - b.rect.y : a.rect.x - b.rect.x;
  });
}

function overlap(a: DiagramRect, b: DiagramRect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / Math.min(a.w * a.h, b.w * b.h);
}

type Grid = { x: number; y: number; w: number; h: number };

/** Corner-patch brightness of each square: pieces rarely reach the corners. */
function squareShades(ii: Integral, g: Grid): number[] {
  const cw = g.w / 8;
  const ch = g.h / 8;
  const p = Math.max(1, cw * 0.2);
  const q = Math.max(1, ch * 0.2);
  const ox = cw * 0.03;
  const oy = ch * 0.03;
  const out: number[] = [];
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const x0 = g.x + c * cw;
      const y0 = g.y + r * ch;
      const m = [
        ii.mean(x0 + ox, y0 + oy, x0 + ox + p, y0 + oy + q),
        ii.mean(x0 + cw - ox - p, y0 + oy, x0 + cw - ox, y0 + oy + q),
        ii.mean(x0 + ox, y0 + ch - oy - q, x0 + ox + p, y0 + ch - oy),
        ii.mean(x0 + cw - ox - p, y0 + ch - oy - q, x0 + cw - ox, y0 + ch - oy),
      ].sort((a, b) => a - b);
      out.push((m[1] + m[2]) / 2);
    }
  }
  return out;
}

function checkerboard(ii: Integral, g: Grid): { contrast: number; agreement: number } {
  const shades = squareShades(ii, g);
  let light = 0;
  let dark = 0;
  for (let i = 0; i < 64; i += 1) {
    if (((i >> 3) + (i & 7)) % 2 === 0) light += shades[i];
    else dark += shades[i];
  }
  light /= 32;
  dark /= 32;
  const mid = (light + dark) / 2;
  let agree = 0;
  for (let i = 0; i < 64; i += 1) {
    const isLight = ((i >> 3) + (i & 7)) % 2 === 0;
    if ((shades[i] >= mid) === isLight) agree += 1;
  }
  return { contrast: light - dark, agreement: agree / 64 };
}

/**
 * Snaps a rough board rectangle (a detected component, or a coach's manual
 * selection) to its 8×8 grid: trims a printed frame, then searches nearby
 * offsets and sizes for the best light/dark alternation. Returns null when the
 * region is too small to read.
 */
export function refineDiagramBoard(img: GrayImage, approx: DiagramRect): DiagramBoardCandidate | null {
  if (approx.w < 32 || approx.h < 32) return null;
  const margin = Math.round(Math.max(approx.w, approx.h) * 0.06) + 2;
  const ox = clampInt(Math.floor(approx.x) - margin, 0, img.width - 1);
  const oy = clampInt(Math.floor(approx.y) - margin, 0, img.height - 1);
  const ex = clampInt(Math.ceil(approx.x + approx.w) + margin, ox + 1, img.width);
  const ey = clampInt(Math.ceil(approx.y + approx.h) + margin, oy + 1, img.height);
  const ii = new Integral(img, ox, oy, ex - ox, ey - oy);

  const start = trimFrame(img, approx);
  let best: Grid = start;
  let bestScore = score(checkerboard(ii, best));
  const sizeRef = Math.max(start.w, start.h);
  for (const stepDiv of [120, 400]) {
    const st = Math.max(1, Math.round(sizeRef / stepDiv));
    for (let round = 0; round < 2; round += 1) {
      for (const axis of ["x", "y"] as const) {
        const base = best;
        for (let a = -4; a <= 4; a += 1) {
          for (let b = -4; b <= 4; b += 1) {
            const g: Grid =
              axis === "x"
                ? { ...base, x: base.x + a * st, w: base.w + b * st }
                : { ...base, y: base.y + a * st, h: base.h + b * st };
            if (g.w < 24 || g.h < 24) continue;
            const s = score(checkerboard(ii, g));
            if (s > bestScore) {
              bestScore = s;
              best = g;
            }
          }
        }
      }
    }
    if (st === 1) break;
  }
  const result = checkerboard(ii, best);
  return { rect: { x: best.x, y: best.y, w: best.w, h: best.h }, ...result };
}

function score(r: { contrast: number; agreement: number }) {
  // Agreement dominates: a half-cell misalignment can keep some contrast.
  return r.contrast * (r.agreement * r.agreement);
}

/** Moves each edge of `r` inward past a solid printed frame line, if there is one. */
function trimFrame(img: GrayImage, r: DiagramRect): Grid {
  const inkFrac = (horizontal: boolean, pos: number, from: number, to: number) => {
    let ink = 0;
    let n = 0;
    for (let t = Math.floor(from); t < Math.ceil(to); t += 1) {
      const x = horizontal ? t : pos;
      const y = horizontal ? pos : t;
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      n += 1;
      if (img.data[y * img.width + x] < 120) ink += 1;
    }
    return n ? ink / n : 0;
  };
  const depth = Math.max(2, Math.round(Math.max(r.w, r.h) * 0.05));
  const spanX0 = r.x + r.w * 0.15;
  const spanX1 = r.x + r.w * 0.85;
  const spanY0 = r.y + r.h * 0.15;
  const spanY1 = r.y + r.h * 0.85;
  const inward = (horizontal: boolean, edge: number, dir: 1 | -1, from: number, to: number) => {
    let last = -1;
    for (let d = -2; d < depth; d += 1) {
      if (inkFrac(horizontal, Math.round(edge + d * dir), from, to) >= 0.85) last = d;
    }
    return last >= 0 ? last + 1 : 0;
  };
  const top = inward(true, r.y, 1, spanX0, spanX1);
  const bottom = inward(true, r.y + r.h - 1, -1, spanX0, spanX1);
  const left = inward(false, r.x, 1, spanY0, spanY1);
  const right = inward(false, r.x + r.w - 1, -1, spanY0, spanY1);
  return { x: r.x + left, y: r.y + top, w: r.w - left - right, h: r.h - top - bottom };
}

// ── 2. piece recognition ─────────────────────────────────────────────────────

type ParsedTemplate = {
  piece: string;
  type: string;
  bits: Uint8Array;
  aspect: number;
  relHeight: number;
};

const parsedCache = new WeakMap<readonly DiagramPieceTemplate[], ParsedTemplate[]>();

function parseTemplates(templates: readonly DiagramPieceTemplate[]): ParsedTemplate[] {
  const cached = parsedCache.get(templates);
  if (cached) return cached;
  const parsed = templates.map((t) => ({
    piece: t.piece,
    type: t.piece.toLowerCase(),
    bits: hexToBits(t.mask, DIAGRAM_TEMPLATE_SIZE * DIAGRAM_TEMPLATE_SIZE),
    aspect: t.aspect,
    relHeight: t.relHeight,
  }));
  parsedCache.set(templates, parsed);
  return parsed;
}

function hexToBits(hex: string, n: number): Uint8Array {
  const bits = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) bits[i] = (parseInt(hex[i >> 2] ?? "0", 16) >> (3 - (i & 3))) & 1;
  return bits;
}

function bitsToHex(bits: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  }
  return hex;
}

type CellSample = { raw: Float32Array; blur: Float32Array; light: boolean };

function sampleCell(ii: Integral, g: Grid, row: number, col: number): CellSample {
  const N = CELL_SAMPLES;
  const cw = g.w / 8;
  const ch = g.h / 8;
  const x0 = g.x + col * cw + cw * CELL_INSET;
  const y0 = g.y + row * ch + ch * CELL_INSET;
  const sw = (cw * (1 - 2 * CELL_INSET)) / N;
  const sh = (ch * (1 - 2 * CELL_INSET)) / N;
  const raw = new Float32Array(N * N);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      raw[y * N + x] = ii.mean(x0 + x * sw, y0 + y * sh, x0 + (x + 1) * sw, y0 + (y + 1) * sh);
    }
  }
  const blur = new Float32Array(N * N);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          s += raw[yy * N + xx];
          n += 1;
        }
      }
      blur[y * N + x] = s / n;
    }
  }
  return { raw, blur, light: (row + col) % 2 === 0 };
}

function pixelMedian(cells: CellSample[]): Float32Array {
  const n = CELL_SAMPLES * CELL_SAMPLES;
  const out = new Float32Array(n);
  const vals: number[] = new Array(cells.length);
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < cells.length; k += 1) vals[k] = cells[k].blur[i];
    vals.sort((a, b) => a - b);
    const m = vals.length >> 1;
    out[i] = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  }
  return out;
}

function meanAbsDiff(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/**
 * An empty square of one shade: the per-pixel median of the squares that look
 * most alike (refined twice, so a crowded board doesn't drag it towards a
 * piece), plus how far empty squares stray from it — the piece threshold.
 */
function emptyModel(cells: CellSample[]): { bg: Float32Array; threshold: number; level: number } {
  let bg = pixelMedian(cells);
  for (let pass = 0; pass < 2; pass += 1) {
    const ranked = cells.map((c) => ({ c, d: meanAbsDiff(c.blur, bg) })).sort((a, b) => a.d - b.d);
    bg = pixelMedian(ranked.slice(0, Math.max(4, Math.round(cells.length * 0.4))).map((r) => r.c));
  }
  const ranked = cells.map((c) => ({ c, d: meanAbsDiff(c.blur, bg) })).sort((a, b) => a.d - b.d);
  const quiet = ranked.slice(0, Math.max(3, Math.round(cells.length * 0.3))).map((r) => r.c);
  const diffs: number[] = [];
  for (const c of quiet) for (let i = 0; i < bg.length; i += 1) diffs.push(Math.abs(c.blur[i] - bg[i]));
  diffs.sort((a, b) => a - b);
  const p97 = diffs[Math.floor(diffs.length * 0.97)] ?? 0;
  let level = 0;
  for (let i = 0; i < bg.length; i += 1) level += bg[i];
  return { bg, threshold: Math.max(30, p97 * 1.6), level: level / bg.length };
}

type Silhouette = {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  mask: Uint8Array;
};

/** Pixels that differ from the empty square, holes filled, largest blob kept. */
function silhouette(cell: CellSample, bg: Float32Array, threshold: number): Silhouette | null {
  const N = CELL_SAMPLES;
  const n = N * N;
  const diff = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) diff[i] = Math.abs(cell.blur[i] - bg[i]) > threshold ? 1 : 0;
  // Flood the background from the border; whatever it can't reach is enclosed
  // (a white piece on a white square is only an outline until this fills it).
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < N; i += 1) stack.push(i, n - 1 - i, i * N, i * N + N - 1);
  while (stack.length) {
    const p = stack.pop() as number;
    if (p < 0 || p >= n || outside[p] || diff[p]) continue;
    outside[p] = 1;
    const x = p % N;
    if (x > 0) stack.push(p - 1);
    if (x < N - 1) stack.push(p + 1);
    stack.push(p - N, p + N);
  }
  const seen = new Uint8Array(n);
  let best: Silhouette | null = null;
  for (let s = 0; s < n; s += 1) {
    if (outside[s] || seen[s]) continue;
    const pixels: number[] = [];
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop() as number;
      pixels.push(p);
      const x = p % N;
      const y = (p / N) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          const q = yy * N + xx;
          if (!outside[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (!best || pixels.length > best.area) {
      const mask = new Uint8Array(n);
      let minX = N;
      let minY = N;
      let maxX = -1;
      let maxY = -1;
      for (const p of pixels) {
        mask[p] = 1;
        const x = p % N;
        const y = (p / N) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      best = { area: pixels.length, minX, minY, maxX, maxY, mask };
    }
  }
  return best;
}

/** The silhouette cropped to its bounding box, resampled to the template grid. */
function silhouetteBits(s: Silhouette): Uint8Array {
  const T = DIAGRAM_TEMPLATE_SIZE;
  const N = CELL_SAMPLES;
  const w = s.maxX - s.minX + 1;
  const h = s.maxY - s.minY + 1;
  const bits = new Uint8Array(T * T);
  for (let ty = 0; ty < T; ty += 1) {
    for (let tx = 0; tx < T; tx += 1) {
      // Nearest sample under the template cell's centre.
      const x = Math.min(N - 1, Math.floor(s.minX + ((tx + 0.5) * w) / T));
      const y = Math.min(N - 1, Math.floor(s.minY + ((ty + 0.5) * h) / T));
      bits[ty * T + tx] = s.mask[y * N + x];
    }
  }
  return bits;
}

function iou(a: Uint8Array, b: Uint8Array, from = 0, to = a.length) {
  let inter = 0;
  let uni = 0;
  for (let i = from; i < to; i += 1) {
    if (a[i] && b[i]) inter += 1;
    if (a[i] || b[i]) uni += 1;
  }
  return uni ? inter / uni : 1;
}

/** One square's measurements — what the templates are built from, too. */
export type DiagramSquareFeatures = {
  row: number;
  col: number;
  light: boolean;
  /** Share of the square the silhouette covers (0 when empty). */
  areaFrac: number;
  /** Null when the square reads as empty. */
  shape: { mask: string; aspect: number; relHeight: number } | null;
  /** How dark the piece's core is, 0 (paper) – 1 (ink): high = a black piece. */
  inkFrac: number;
};

/**
 * Measures all 64 squares of a refined board. Exported for the template
 * generator (scripts/diagram-import), which builds DIAGRAM_PIECE_TEMPLATES by
 * running this very code over boards drawn with the vendored piece sets, so
 * templates and readings share every sampling and cropping quirk.
 */
export function extractDiagramSquareFeatures(img: GrayImage, rect: DiagramRect): DiagramSquareFeatures[] {
  const ox = clampInt(Math.floor(rect.x) - 2, 0, img.width - 1);
  const oy = clampInt(Math.floor(rect.y) - 2, 0, img.height - 1);
  const ex = clampInt(Math.ceil(rect.x + rect.w) + 2, ox + 1, img.width);
  const ey = clampInt(Math.ceil(rect.y + rect.h) + 2, oy + 1, img.height);
  const ii = new Integral(img, ox, oy, ex - ox, ey - oy);

  const cells: CellSample[] = [];
  for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) cells.push(sampleCell(ii, rect, r, c));
  const lightModel = emptyModel(cells.filter((c) => c.light));
  const darkModel = emptyModel(cells.filter((c) => !c.light));
  // Ink = clearly darker than the paper of a light square.
  const N = CELL_SAMPLES;
  const N2 = N * N;

  return cells.map((cell, i) => {
    const row = i >> 3;
    const col = i & 7;
    const model = cell.light ? lightModel : darkModel;
    const sil = silhouette(cell, model.bg, model.threshold);
    const areaFrac = sil ? sil.area / N2 : 0;
    const empty = { row, col, light: cell.light, areaFrac, shape: null, inkFrac: 0 };
    if (!sil) return empty;
    const w = (sil.maxX - sil.minX + 1) / N;
    const h = (sil.maxY - sil.minY + 1) / N;
    // Too small, or a thin sliver along an edge (a frame line, a neighbour's
    // hatching) — not a piece.
    if (areaFrac < 0.06 || h < 0.3 || w < 0.22) return empty;
    // Colour = how dark the piece's core is. The silhouette is eroded twice
    // first, so the outline every white piece has (Merida's queen is half
    // outline at book size) and the background along its edge don't count.
    let core = sil.mask;
    for (let pass = 0; pass < 2; pass += 1) {
      const next = new Uint8Array(N2);
      let kept = 0;
      for (let y = 1; y < N - 1; y += 1) {
        for (let x = 1; x < N - 1; x += 1) {
          const p = y * N + x;
          if (core[p] && core[p - 1] && core[p + 1] && core[p - N] && core[p + N]) {
            next[p] = 1;
            kept += 1;
          }
        }
      }
      if (kept < 12) break;
      core = next;
    }
    let sum = 0;
    let n = 0;
    for (let p = 0; p < N2; p += 1) {
      if (!core[p]) continue;
      sum += cell.raw[p];
      n += 1;
    }
    const darkness = n ? clamp01(1 - sum / n / Math.max(1, lightModel.level)) : 0.5;
    return {
      ...empty,
      shape: {
        mask: bitsToHex(silhouetteBits(sil)),
        aspect: w / h,
        // The samples cover the square minus its inset; report per full square.
        relHeight: h * (1 - 2 * CELL_INSET),
      },
      inkFrac: darkness,
    };
  });
}

/** Best distance per piece type (k, q, r, b, n, p), lower is closer. */
function classifyShape(
  shape: NonNullable<DiagramSquareFeatures["shape"]>,
  templates: ParsedTemplate[],
): { type: string; d: number }[] {
  const T = DIAGRAM_TEMPLATE_SIZE;
  const bits = hexToBits(shape.mask, T * T);
  const topEnd = Math.round(T / 3) * T;
  const best = new Map<string, number>();
  for (const t of templates) {
    // The top third carries most of what tells pieces apart (cross vs crown,
    // mitre vs pawn head), so it counts twice.
    const d =
      1 -
      iou(bits, t.bits) +
      (1 - iou(bits, t.bits, 0, topEnd)) +
      0.6 * Math.abs(Math.log(shape.aspect / t.aspect)) +
      1.0 * Math.abs(shape.relHeight - t.relHeight);
    const prev = best.get(t.type);
    if (prev === undefined || d < prev) best.set(t.type, d);
  }
  return [...best.entries()].map(([type, d]) => ({ type, d })).sort((a, b) => a.d - b.d);
}

/** Splits values into two groups (1-D 2-means); null when they don't separate. */
function twoMeansSplit(values: number[]): number | null {
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a - b);
  let lo = sorted[0];
  let hi = sorted[sorted.length - 1];
  if (hi - lo < 0.2) return null;
  for (let iter = 0; iter < 20; iter += 1) {
    const mid = (lo + hi) / 2;
    const a = sorted.filter((v) => v < mid);
    const b = sorted.filter((v) => v >= mid);
    if (!a.length || !b.length) break;
    lo = a.reduce((s, v) => s + v, 0) / a.length;
    hi = b.reduce((s, v) => s + v, 0) / b.length;
  }
  return hi - lo >= 0.2 ? (lo + hi) / 2 : null;
}

/** Most of each piece a side normally has; promotions make more possible but rare. */
const MATERIAL_LIMITS: Record<string, number> = { k: 1, q: 1, r: 2, b: 2, n: 2, p: 8 };

/**
 * Nudges close calls towards a normal army: one king a side, at most 8 pawns,
 * rarely three bishops. Only a square whose runner-up is nearly as good is
 * changed, and every change is reported so the square is flagged for review.
 * Mutates `choice` (index into each reading's ranking).
 */
function applyMaterialPrior(
  readings: { black: boolean; ranking: { type: string; d: number }[] }[],
  choice: number[],
): Set<number> {
  const nudged = new Set<number>();
  const typeAt = (i: number) => readings[i].ranking[choice[i]]?.type;
  for (const black of [false, true]) {
    const own = readings.map((_, i) => i).filter((i) => choice[i] >= 0 && readings[i].black === black);
    // No king: the square that fits a king best relative to its own pick becomes it.
    if (!own.some((i) => typeAt(i) === "k")) {
      let bestIdx = -1;
      let bestCost = 0.35;
      for (const i of own) {
        const k = readings[i].ranking.findIndex((x) => x.type === "k");
        const cost = k < 0 ? Infinity : readings[i].ranking[k].d - readings[i].ranking[choice[i]].d;
        if (cost < bestCost) {
          bestCost = cost;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        choice[bestIdx] = readings[bestIdx].ranking.findIndex((x) => x.type === "k");
        nudged.add(bestIdx);
      }
    }
    for (const type of ["k", "q", "r", "b", "n", "p"]) {
      const holders = own.filter((i) => typeAt(i) === type);
      const extra = holders.length - MATERIAL_LIMITS[type];
      if (extra <= 0) continue;
      // Cheapest switches first: the squares whose next-best type is closest.
      const moves = holders
        .map((i) => {
          const next = readings[i].ranking.findIndex(
            (x, k) => k !== choice[i] && own.filter((j) => typeAt(j) === x.type).length < MATERIAL_LIMITS[x.type],
          );
          const cost = next < 0 ? Infinity : readings[i].ranking[next].d - readings[i].ranking[choice[i]].d;
          return { i, next, cost };
        })
        .filter((m) => m.next >= 0 && m.cost < (type === "k" || type === "p" ? 0.5 : 0.15))
        .sort((a, b) => a.cost - b.cost)
        .slice(0, extra);
      for (const m of moves) {
        // An earlier switch in this batch may have filled the target type up.
        const target = readings[m.i].ranking[m.next].type;
        if (own.filter((j) => typeAt(j) === target).length >= MATERIAL_LIMITS[target]) continue;
        choice[m.i] = m.next;
        nudged.add(m.i);
      }
    }
  }
  return nudged;
}

/**
 * Reads the 64 squares of one board. `rect` is a refined grid (from
 * detectDiagramBoards or refineDiagramBoard). The result is as printed — call
 * diagramGridToPlacement with the confirmed orientation to get a FEN placement.
 */
export function recognizeDiagramBoard(
  img: GrayImage,
  rect: DiagramRect,
  templates: readonly DiagramPieceTemplate[] = DIAGRAM_PIECE_TEMPLATES,
): RecognizedDiagram {
  const parsed = parseTemplates(templates);
  const features = extractDiagramSquareFeatures(img, rect);
  // Colour: how much of the piece is ink, split into two clusters when the
  // board has both colours, else a fixed midpoint.
  const colorSplit = twoMeansSplit(features.filter((f) => f.shape).map((f) => f.inkFrac)) ?? 0.5;

  type Reading = { f: DiagramSquareFeatures; black: boolean; ranking: { type: string; d: number }[]; colorConf: number };
  const readings: Reading[] = features.map((f) => {
    if (!f.shape) return { f, black: false, ranking: [], colorConf: 1 };
    return {
      f,
      black: f.inkFrac >= colorSplit,
      ranking: classifyShape(f.shape, parsed),
      colorConf: clamp01(Math.abs(f.inkFrac - colorSplit) / 0.15),
    };
  });
  const choice = readings.map((r) => (r.ranking.length ? 0 : -1));
  const nudged = applyMaterialPrior(readings, choice);

  const squares: RecognizedSquare[] = readings.map((r, i) => {
    const { f } = r;
    const occConf = clamp01(Math.abs(f.areaFrac - 0.06) / 0.05);
    if (choice[i] < 0) return { row: f.row, col: f.col, piece: null, confidence: occConf, alternative: null };
    const letter = (t: string) => (r.black ? t : t.toUpperCase());
    const picked = r.ranking[choice[i]];
    const other = choice[i] === 0 ? r.ranking[1] : r.ranking[0];
    const typeConf = other ? clamp01((other.d - picked.d) / 0.15) : 1;
    // A reading the material prior overrode is always shown to the coach.
    const confidence = Math.min(occConf, r.colorConf, typeConf, nudged.has(i) ? 0.45 : 1);
    return {
      row: f.row,
      col: f.col,
      piece: letter(picked.type),
      confidence,
      alternative: other && confidence < 1 ? letter(other.type) : null,
    };
  });
  const grid: (string | null)[][] = Array.from({ length: 8 }, (_, r) =>
    squares.slice(r * 8, r * 8 + 8).map((s) => s.piece),
  );
  const meanConfidence = squares.reduce((s, q) => s + q.confidence, 0) / 64;
  const lowConfidenceCount = squares.filter((s) => s.confidence < DIAGRAM_LOW_CONFIDENCE).length;
  return { rect, squares, grid, meanConfidence, lowConfidenceCount };
}

// ── 3. grid → FEN, orientation, side to move ────────────────────────────────

/** The printed grid as a FEN placement, given which side is at the bottom. */
export function diagramGridToPlacement(grid: (string | null)[][], orientation: DiagramOrientation): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r += 1) {
    let out = "";
    let empty = 0;
    for (let c = 0; c < 8; c += 1) {
      const piece = orientation === "white" ? grid[r][c] : grid[7 - r][7 - c];
      if (!piece) empty += 1;
      else {
        if (empty) out += String(empty);
        empty = 0;
        out += piece;
      }
    }
    if (empty) out += String(empty);
    rows.push(out);
  }
  return rows.join("/");
}

/** Board square (e.g. "e4") of a printed cell, for messages to the coach. */
export function diagramSquareName(row: number, col: number, orientation: DiagramOrientation): string {
  const file = orientation === "white" ? col : 7 - col;
  const rank = orientation === "white" ? 8 - row : row + 1;
  return `${"abcdefgh"[file]}${rank}`;
}

export type OrientationEvidence = {
  orientation: DiagramOrientation;
  /** coordinates: printed a–h / 1–8 labels; pieces: a pawn/king heuristic; none: assumed. */
  source: "coordinates" | "pieces" | "none";
  /** True only when the coach still has to confirm it. */
  needsConfirmation: boolean;
};

/**
 * Guess from the pieces: pawns sit on their own half far more often than not,
 * and a pawn on the edge rank nearest its own side is impossible. A guess is
 * always marked for confirmation.
 */
export function inferOrientationFromPieces(grid: (string | null)[][]): OrientationEvidence {
  let vote = 0;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const p = grid[r][c];
      if (!p) continue;
      const bottomHalf = r >= 4;
      if (p === "P") vote += r === 7 ? -3 : r === 0 ? 3 : bottomHalf ? 1 : -1;
      else if (p === "p") vote += r === 0 ? -3 : r === 7 ? 3 : bottomHalf ? -1 : 1;
      else if (p === "K") vote += bottomHalf ? 1 : -1;
      else if (p === "k") vote += bottomHalf ? -1 : 1;
    }
  }
  if (vote >= 3) return { orientation: "white", source: "pieces", needsConfirmation: true };
  if (vote <= -3) return { orientation: "black", source: "pieces", needsConfirmation: true };
  return { orientation: "white", source: "none", needsConfirmation: true };
}

export type DiagramTextItem = {
  text: string;
  /** Centre of the text in image coordinates. */
  x: number;
  y: number;
};

/**
 * Reads printed board coordinates (a–h under/over the board, 1–8 beside it)
 * from the page's text layer. Returns null when there aren't enough labels to
 * be sure — scanned pages have no text layer at all.
 */
export function inferOrientationFromLabels(items: DiagramTextItem[], rect: DiagramRect): OrientationEvidence | null {
  const cw = rect.w / 8;
  const ch = rect.h / 8;
  const files: { idx: number; pos: number }[] = [];
  const ranks: { idx: number; pos: number }[] = [];
  for (const it of items) {
    const t = it.text.trim();
    if (t.length !== 1) continue;
    const insideX = it.x > rect.x && it.x < rect.x + rect.w;
    const insideY = it.y > rect.y && it.y < rect.y + rect.h;
    const nearRow = (it.y > rect.y + rect.h && it.y < rect.y + rect.h + ch * 1.2) || (it.y < rect.y && it.y > rect.y - ch * 1.2);
    const nearCol = (it.x < rect.x && it.x > rect.x - cw * 1.2) || (it.x > rect.x + rect.w && it.x < rect.x + rect.w + cw * 1.2);
    if (/^[a-h]$/.test(t) && insideX && nearRow) files.push({ idx: t.charCodeAt(0) - 97, pos: Math.floor((it.x - rect.x) / cw) });
    if (/^[1-8]$/.test(t) && insideY && nearCol) ranks.push({ idx: Number(t) - 1, pos: Math.floor((it.y - rect.y) / ch) });
  }
  let white = 0;
  let black = 0;
  for (const f of files) {
    if (f.pos === f.idx) white += 1;
    if (f.pos === 7 - f.idx) black += 1;
  }
  for (const r of ranks) {
    if (r.pos === 7 - r.idx) white += 1;
    if (r.pos === r.idx) black += 1;
  }
  if (white >= 4 && black <= white / 4) return { orientation: "white", source: "coordinates", needsConfirmation: false };
  if (black >= 4 && white <= black / 4) return { orientation: "black", source: "coordinates", needsConfirmation: false };
  return null;
}

/**
 * "White to move", "Black to play and win", "W to move"… in the text printed
 * next to a diagram. Null when nothing (or something contradictory) is there —
 * a diagram on its own never says whose turn it is.
 */
export function parseSideToMoveHint(text: string): { side: DiagramSide; phrase: string } | null {
  const re = /\b(white|black|w|b)\s+(to\s+(?:move|play)|moves|plays|wins|draws|mates|to\s+win|to\s+draw)\b/gi;
  const found = new Map<DiagramSide, string>();
  for (const m of text.matchAll(re)) {
    const who = m[1].toLowerCase();
    // A lone "w"/"b" only counts in the "W to move" form.
    if (who.length === 1 && !/^to\s/i.test(m[2])) continue;
    found.set(who.startsWith("w") ? "w" : "b", m[0]);
  }
  if (found.size !== 1) return null;
  const [side, phrase] = [...found.entries()][0];
  return { side, phrase };
}

/** Text items near a board (its caption), in reading order. */
export function textNearDiagram(items: DiagramTextItem[], rect: DiagramRect): string {
  const ch = rect.h / 8;
  return items
    .filter(
      (it) =>
        it.x > rect.x - rect.w * 0.25 &&
        it.x < rect.x + rect.w * 1.25 &&
        ((it.y > rect.y + rect.h && it.y < rect.y + rect.h + ch * 2.5) || (it.y < rect.y && it.y > rect.y - ch * 1.5)),
    )
    .sort((a, b) => (Math.abs(a.y - b.y) > ch * 0.3 ? a.y - b.y : a.x - b.x))
    .map((it) => it.text)
    .join(" ");
}
