#!/usr/bin/env node
// Builds the chessboard along the foot of the auth pages (`AuthFrame`'s `PageBoard`).
// Run it only to rebuild the two files:
//
//   node apps/web/scripts/build-auth-board.mjs
//
// It writes `public/auth/board-dark.webp` and `board-light.webp`:
// a chessboard in perspective with embers rising off it, drawn here from noise (no
// source picture); in dark its seams glow and a soft warm light sits in the bottom-right.
// Both have an alpha channel and sit over the page colour (`--rgb-login-page`); the
// hero's curve covers their left end. Commit both. Tune the glow in `renderBoard`
// (hotspot `HS`, `ramp`). The image optimizer caches by URL: a deploy starts with a
// fresh cache, but a running dev server keeps serving the old picture until
// `apps/web/.next/cache/images` is cleared.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(WEB_ROOT, "public/auth");
const W = 1600, H = 1000;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(seed) {
  const r = rng(seed);
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const X = xi & 255, Y = yi & 255; const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = g(aa, xf, yf) + u * (g(ba, xf - 1, yf) - g(aa, xf, yf));
    const x2 = g(ab, xf, yf - 1) + u * (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 0.7; // ~[-1,1]
  };
  const fbm = (x, y, oct = 5) => { let a = 0.5, f = 1, s = 0; for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; };
  return { noise, fbm };
}
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/** The glowing board for one theme, as straight-alpha RGBA. */
function renderBoard(theme) {
  const dark = theme === "dark";
  const { noise, fbm } = makeNoise(7);

  // Camera
  const f = 1000, camH = 1, yh = 0.2 * H, cx = 0.62 * W, theta = (34 * Math.PI) / 180, s = 0.34;
  const ct = Math.cos(theta), st = Math.sin(theta);
  const world = (x, y) => { const z = (f * camH) / (y - yh); const X = ((x - cx) * z) / f; return [X * ct - z * st, X * st + z * ct, z]; };
  // Fire hotspot (screen) -> world
  const HS = [0.78 * W, 0.82 * H];
  const [hu, hv] = world(HS[0], HS[1]);

  // Fire ramp: heat 0..1 -> rgb
  function ramp(t) {
    t = clamp(t);
    const stops = dark
      ? [[0, [60, 6, 2]], [0.3, [170, 34, 6]], [0.55, [245, 100, 18]], [0.78, [255, 172, 52]], [1, [255, 238, 176]]]
      : [[0, [205, 45, 10]], [0.35, [235, 85, 15]], [0.6, [248, 130, 25]], [0.85, [255, 180, 50]], [1, [255, 225, 130]]];
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; const k = (t - a) / (b - a); return ca.map((c, j) => mix(c, cb[j], k)); }
    return stops.at(-1)[1];
  }

  // Premultiplied buffer
  const P = new Float32Array(W * H * 4);
  const over = (i, r, g, b, a) => { if (a <= 0) return; a = Math.min(1, a); const k = 1 - a; P[i] = r * a + P[i] * k; P[i + 1] = g * a + P[i + 1] * k; P[i + 2] = b * a + P[i + 2] * k; P[i + 3] = a + P[i + 3] * k; };
  const add = (i, r, g, b, a) => { // light added on top (dark theme): premult add
    P[i] += r * a; P[i + 1] += g * a; P[i + 2] += b * a; P[i + 3] = Math.max(P[i + 3], Math.min(1, Math.max(P[i], P[i + 1], P[i + 2]) / 255));
  };
  const glow = dark ? add : over;

  const SS = 3;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // --- board coverage mask (fades to the top and to the left) ---
      const ny = (y - yh) / (H - yh);
      const dx = (W - x) / W, dy = (H - y) / H;
      const corner = Math.sqrt((dx * 0.42) ** 2 + (dy * 1.25) ** 2);
      const mask = smooth(0.05, 0.3, ny) * (1 - smooth(0.4, 0.95, corner));
      let heatHere = 0;
      if (mask > 0.002) {
        // Squares, supersampled
        let cr = 0, cg = 0, cb = 0, seam = 0, seamWide = 0, lightSum = 0;
        for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          const [u, v, z] = world(px, py);
          const iu = Math.floor(u / s), iv = Math.floor(v / s);
          const lightSq = ((iu + iv) & 1) === 0;
          const d2 = (u - hu) ** 2 + (v - hv) ** 2;
          const lit = Math.exp(-d2 / 0.7) * 0.8 + Math.exp(-d2 / 5) * 0.3;
          lightSum += lit;
          // per-square variation + sheen toward the light
          const varr = 0.85 + 0.3 * (0.5 + 0.5 * noise(iu * 1.7 + 3.1, iv * 1.3 - 2.2));
          const sheen = 0.5 + 0.5 * fbm(u * 2.2, v * 0.6, 3);
          let c;
          if (dark) c = lightSq ? [30 * varr + 14 * sheen, 30 * varr + 12 * sheen, 40 * varr + 12 * sheen] : [5, 7, 14];
          else { const g = 0.96 + 0.08 * (varr - 0.85) / 0.3; c = lightSq ? [253, 249, 240] : [233 * g - 6 * sheen, 173 * g - 6 * sheen, 67 * g - 4 * sheen]; } // brand gold (--rgb-login-gold) on cream
          const fc = ramp(0.3 + 0.3 * lit);
          // Light theme: no fire tint, only the sparks. Dark: the glow eases off along the very
          // bottom (owner 2026-11-24: less fiery there).
          const k = dark ? (lightSq ? 0.4 : 0.15) * lit * (1 - 0.35 * smooth(0.8 * H, H, py)) : 0;
          c = dark ? c.map((ch, j) => ch + fc[j] * k) : c.map((ch, j) => mix(ch, fc[j], Math.min(0.75, k)));
          cr += c[0]; cg += c[1]; cb += c[2];
          // seams: distance to grid lines in screen px
          const fu = u / s - iu, fv = v / s - iv;
          const dw = Math.min(fu, 1 - fu, fv, 1 - fv) * s; // world units
          const dpx = (dw * f) / z;
          seam += Math.exp(-dpx / 0.9);
          seamWide += Math.exp(-dpx / 7);
        }
        const n = SS * SS; cr /= n; cg /= n; cb /= n; seam /= n; seamWide /= n; const lit = lightSum / n;
        const ccol = dark ? [Math.min(255, cr), Math.min(255, cg), Math.min(255, cb)] : [cr, cg, cb];
        const boardA = mask * (dark ? 0.96 : 0.9);
        over(i, ccol[0], ccol[1], ccol[2], boardA);
        // molten seams
        const [u, v] = world(x + 0.5, y + 0.5);
        const lava = 0.5 + 0.5 * fbm(u * 1.6 + 11, v * 1.6 - 4, 4);
        heatHere = clamp(lit * 1.1 + smooth(0.5, 0.8, lava) * 0.6);
        const seamI = clamp(seam * (0.06 + heatHere * heatHere * 1.5)) * mask;
        const seamB = clamp(seamWide * heatHere * 0.6) * mask;
        const sc = ramp(0.45 + heatHere * 0.55);
        if (dark) glow(i, ...ramp(0.35 + heatHere * 0.4), seamB * 0.3);
        if (dark) glow(i, ...sc, seamI * 0.6);
      }
    }
  }

  // --- warm haze around the fire ---
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const d = Math.hypot((x - HS[0]) / (W * 0.42), (y - HS[1] + 0.12 * H) / (H * 0.5));
    const a = dark ? Math.exp(-d * d * 2.4) * 0.1 : 0;
    const c = dark ? [230, 80, 20] : [240, 140, 50];
    glow(i, c[0], c[1], c[2], a);
  }

  // --- embers / sparks ---
  const spark = (ex, ey, rad, len, ang, c, alpha) => {
    const ext = Math.ceil(rad * 3 + len * 2);
    for (let yy = Math.max(0, Math.floor(ey - ext)); yy < Math.min(H, ey + ext); yy++) for (let xx = Math.max(0, Math.floor(ex - ext)); xx < Math.min(W, ex + ext); xx++) {
      const ox = xx - ex, oy = yy - ey;
      const along = ox * Math.cos(ang) + oy * Math.sin(ang), across = -ox * Math.sin(ang) + oy * Math.cos(ang);
      const d = Math.hypot(across / rad, along / (rad * len));
      const a = (Math.exp(-d * d * 2.2) + Math.exp(-d * 0.9) * 0.25) * alpha;
      if (a < 0.004) continue;
      glow((yy * W + xx) * 4, c[0], c[1], c[2], a);
    }
  };
  const R = rng(42);
  // Embers rising off the board, around the warm light.
  const embers = dark ? 360 : 240;
  for (let k = 0; k < embers; k++) {
    const ex = W * (1.02 - Math.pow(R(), 1.3) * 0.95);
    const ey = HS[1] - Math.pow(R(), 1.6) * H * 0.85 + 0.06 * H;
    const rad = 0.8 + Math.pow(R(), 3) * 3.2;
    const len = 1 + R() * 5; // vertical streak
    const ang = -Math.PI / 2 + (R() - 0.5) * 0.9;
    const heat = 0.55 + R() * 0.45;
    if (ex < 0 || ex >= W || ey < 0 || ey >= H) continue;
    spark(ex, ey, rad, len, ang, ramp(heat), 1 - clamp((HS[1] - ey) / (H * 0.85)) * 0.6);
  }
  // Fine sparkles along the bottom, the whole width: pale gold, not fire colours
  // (owner 2026-11-24), so the foot of the board twinkles without glowing orange.
  const R2 = rng(7);
  const sparkles = dark ? 220 : 150;
  const gold = dark ? [255, 222, 160] : [214, 150, 50];
  for (let k = 0; k < sparkles; k++) {
    const ex = W * (0.12 + R2() * 0.9);
    const ey = H * (0.74 + Math.pow(R2(), 0.7) * 0.26);
    const rad = 0.6 + Math.pow(R2(), 3) * 2;
    const len = 1 + R2() * 3;
    const ang = -Math.PI / 2 + (R2() - 0.5) * 0.8;
    spark(ex, ey, rad, len, ang, gold, (dark ? 0.55 : 0.6) + R2() * 0.4);
  }

  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const a = Math.min(1, P[i * 4 + 3]);
    buf[i * 4 + 3] = Math.round(a * 255);
    for (let j = 0; j < 3; j++) buf[i * 4 + j] = a > 0 ? Math.round(clamp(P[i * 4 + j] / a, 0, 255)) : 0;
  }
  return buf;
}

const webp = { alphaQuality: 100, effort: 6, quality: 88 };
for (const theme of ["dark", "light"]) {
  await sharp(renderBoard(theme), { raw: { channels: 4, height: H, width: W } })
    .webp(webp)
    .toFile(path.join(OUT_DIR, `board-${theme}.webp`));
}
console.log(`wrote board-{dark,light}.webp to ${OUT_DIR}`);
