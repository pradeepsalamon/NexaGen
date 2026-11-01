import type { GrayImage } from "@nexa-chess/types";

/** A crop of the page around a board, as a data URL, for side-by-side review. */
export function cropToDataUrl(image: GrayImage, rect: { x: number; y: number; w: number; h: number }, maxSide = 360): string {
  const pad = Math.round(Math.max(rect.w, rect.h) * 0.08);
  const x0 = Math.max(0, Math.floor(rect.x - pad));
  const y0 = Math.max(0, Math.floor(rect.y - pad));
  const x1 = Math.min(image.width, Math.ceil(rect.x + rect.w + pad));
  const y1 = Math.min(image.height, Math.ceil(rect.y + rect.h + pad));
  const w = x1 - x0;
  const h = y1 - y0;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const ctx = src.getContext("2d");
  if (!ctx) return "";
  const data = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = image.data[(y0 + y) * image.width + x0 + x];
      const p = (y * w + x) * 4;
      data.data[p] = v;
      data.data[p + 1] = v;
      data.data[p + 2] = v;
      data.data[p + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  const s = Math.min(1, maxSide / Math.max(w, h));
  const out = document.createElement("canvas");
  out.width = Math.round(w * s);
  out.height = Math.round(h * s);
  out.getContext("2d")?.drawImage(src, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
