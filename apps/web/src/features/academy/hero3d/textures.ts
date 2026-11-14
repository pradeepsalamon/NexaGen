import { CanvasTexture, SRGBColorSpace } from "three";
import { BOARD_PAINT } from "./palette";

/** Small seeded generator, so the stone looks the same on every visit. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The playing surface as one painted texture: 64 polished stone squares, each
 * with its own clouding and veins, and a fine groove between them. One texture
 * on one plane, instead of 64 meshes that would all share the same grain.
 */
export function createBoardTexture(size: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const random = seeded(7);
  const cell = size / 8;
  const unit = size / 1024;

  for (let file = 0; file < 8; file += 1) {
    for (let rank = 0; rank < 8; rank += 1) {
      const dark = (file + rank) % 2 === 0;
      const x = file * cell;
      const y = rank * cell;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cell, cell);
      ctx.clip();

      ctx.fillStyle = dark ? BOARD_PAINT.dark : BOARD_PAINT.light;
      ctx.fillRect(x, y, cell, cell);

      // Clouding: a few broad soft patches, lighter and darker.
      for (let i = 0; i < 5; i += 1) {
        const cx = x + random() * cell;
        const cy = y + random() * cell;
        const radius = cell * (0.35 + random() * 0.5);
        const cloud = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        const lighter = random() > 0.5;
        const alpha = (dark ? 0.22 : 0.12) * random();
        cloud.addColorStop(0, lighter ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`);
        cloud.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = cloud;
        ctx.fillRect(x, y, cell, cell);
      }

      // Veins: wandering lines that cross the square, some forking.
      ctx.strokeStyle = dark ? BOARD_PAINT.darkVein : BOARD_PAINT.lightVein;
      ctx.lineCap = "round";
      const veins = 2 + Math.floor(random() * 3);
      for (let v = 0; v < veins; v += 1) {
        let px = x + random() * cell;
        let py = y - cell * 0.1;
        let heading = Math.PI / 2 + (random() - 0.5) * 1.6;
        ctx.globalAlpha = 0.16 + random() * 0.3;
        ctx.lineWidth = unit * (0.5 + random() * 1.6);
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let step = 0; step < 14; step += 1) {
          heading += (random() - 0.5) * 0.9;
          px += Math.cos(heading) * cell * 0.11;
          py += Math.sin(heading) * cell * 0.11;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Fine speckle so the polish never looks like flat plastic.
      for (let i = 0; i < 90; i += 1) {
        ctx.fillStyle = random() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
        ctx.fillRect(x + random() * cell, y + random() * cell, unit * 1.5, unit * 1.5);
      }
      ctx.restore();
    }
  }

  ctx.strokeStyle = BOARD_PAINT.groove;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, unit * 1.6);
  for (let i = 0; i <= 8; i += 1) {
    const at = Math.min(size - ctx.lineWidth / 2, Math.max(ctx.lineWidth / 2, i * cell));
    ctx.beginPath();
    ctx.moveTo(at, 0);
    ctx.lineTo(at, size);
    ctx.moveTo(0, at);
    ctx.lineTo(size, at);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A soft round falloff, for the dust motes and the shadow under the board. */
export function createGlowTexture(size: number, mid: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(mid, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}
