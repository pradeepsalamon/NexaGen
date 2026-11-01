// OCR for pages with no text layer (a scan without OCR, a screenshot, a photo). Runs in
// the browser with Tesseract, self-hosted from public/vendor/tesseract
// (apps/web/scripts/copy-pdfjs.mjs), so the page never leaves the tab. About 7 MB, so
// it loads on first use. OCR makes mistakes: show what it read as a suggestion.

import { paperLevel, type DiagramRect as PixelRect, type GrayImage } from "@nexa-chess/types";
import type { DocumentTextItem } from "./pdf";

const BASE = "/vendor/tesseract";
const LOAD_LIMIT_MS = 30_000;
/** Tesseract's page segmentation mode 7. */
const SINGLE_LINE = "7";
const TIME_LIMIT_MS = 8_000;
const INK_RATIO = 0.6;
const MIN_INK_PIXELS = 2;
const MAX_LINE_GAP = 1;
const MIN_LINE_HEIGHT = 6;
/** Taller than this is a picture or a board, not a line. */
const MAX_LINE_SHARE = 0.1;
const LINE_PADDING = 6;
const TARGET_LINE_HEIGHT = 96;
const MAX_SCALE = 4;

type OcrWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };
type OcrResult = { data: { blocks?: { paragraphs: { lines: { words: OcrWord[] }[] }[] }[] | null } };
type OcrWorker = {
  recognize: (image: HTMLCanvasElement, options?: object, output?: object) => Promise<OcrResult>;
  setParameters: (parameters: Record<string, string>) => Promise<unknown>;
};
type TesseractModule = {
  default: { createWorker: (lang: string, oem: number, options: object) => Promise<OcrWorker> };
};

let workerPromise: Promise<OcrWorker> | null = null;

function getWorker(): Promise<OcrWorker> {
  workerPromise ??= (import(/* webpackIgnore: true */ `${BASE}/tesseract.esm.min.js`) as Promise<TesseractModule>).then(({ default: tesseract }) =>
    tesseract.createWorker("eng", 1, {
      cacheMethod: "none",
      corePath: `${BASE}/core`,
      gzip: true,
      langPath: `${BASE}/lang`,
      workerBlobURL: false,
      workerPath: `${BASE}/worker.min.js`,
    }).then(async (worker) => {
      await worker.setParameters({ tessedit_pageseg_mode: SINGLE_LINE });
      return worker;
    }),
  );
  // A failed load (offline, blocked) may be retried by the next page.
  workerPromise.catch(() => {
    workerPromise = null;
  });
  return workerPromise;
}

const after = <T,>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

function bandCanvas(image: GrayImage, x0: number, y0: number, x1: number, y1: number, scale: number): HTMLCanvasElement | null {
  const width = x1 - x0;
  const height = y1 - y0;
  if (width < 8 || height < 8) return null;
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const ctx = source.getContext("2d");
  if (!ctx) return null;
  const pixels = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = image.data[(y0 + y) * image.width + x0 + x];
      const p = (y * width + x) * 4;
      pixels.data[p] = v;
      pixels.data[p + 1] = v;
      pixels.data[p + 2] = v;
      pixels.data[p + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  if (scale === 1) return source;
  const out = document.createElement("canvas");
  out.width = Math.round(width * scale);
  out.height = Math.round(height * scale);
  out.getContext("2d")?.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/**
 * The rows of a band that hold a line of text. Tesseract reads a line alone and enlarged
 * far better than a block (a whole caption read "Bg5" as "Bgs").
 */
function textLines(image: GrayImage, left: number, top: number, right: number, bottom: number): { top: number; bottom: number }[] {
  const ink = paperLevel(image) * INK_RATIO;
  const lines: { top: number; bottom: number }[] = [];
  let start = -1;
  let lastInk = -1;
  for (let y = top; y < bottom; y += 1) {
    let count = 0;
    for (let x = left; x < right; x += 1) if (image.data[y * image.width + x] < ink) count += 1;
    if (count >= MIN_INK_PIXELS) {
      if (start < 0) start = y;
      lastInk = y;
    } else if (start >= 0 && y - lastInk > MAX_LINE_GAP) {
      lines.push({ bottom: lastInk + 1, top: start });
      start = -1;
    }
  }
  if (start >= 0) lines.push({ bottom: lastInk + 1, top: start });
  const tallest = image.height * MAX_LINE_SHARE;
  return lines.filter((line) => line.bottom - line.top >= MIN_LINE_HEIGHT && line.bottom - line.top <= tallest);
}

async function readLine(worker: OcrWorker, image: GrayImage, left: number, right: number, line: { top: number; bottom: number }): Promise<DocumentTextItem[]> {
  const top = Math.max(0, line.top - LINE_PADDING);
  const bottom = Math.min(image.height, line.bottom + LINE_PADDING);
  const scale = Math.max(1, Math.min(MAX_SCALE, TARGET_LINE_HEIGHT / (bottom - top)));
  const canvas = bandCanvas(image, left, top, right, bottom, scale);
  if (!canvas) return [];
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
  const items: DocumentTextItem[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const textLine of paragraph.lines) {
        for (const word of textLine.words) {
          const text = word.text.trim();
          if (!text) continue;
          items.push({
            centerY: top + (word.bbox.y0 + word.bbox.y1) / (2 * scale),
            left: left + word.bbox.x0 / scale,
            text,
            width: (word.bbox.x1 - word.bbox.x0) / scale,
          });
        }
      }
    }
  }
  return items;
}

/**
 * The words inside regions of a rendered page, in page pixels. Regions are read in
 * order, line by line. Never throws: a failed load, or one over 30 s, gives [] (a slow
 * load carries on, for the next page), and past `timeLimitMs` you get what was read so far.
 */
export async function readTextInRegions(image: GrayImage, regions: PixelRect[], timeLimitMs = TIME_LIMIT_MS): Promise<DocumentTextItem[]> {
  const items: DocumentTextItem[] = [];
  let expired = false;
  try {
    const worker = await Promise.race([getWorker(), after(LOAD_LIMIT_MS, null)]);
    if (!worker) return [];
    const reading = (async () => {
      for (const region of regions) {
        const left = Math.max(0, Math.floor(region.x));
        const right = Math.min(image.width, Math.ceil(region.x + region.w));
        const top = Math.max(0, Math.floor(region.y));
        const bottom = Math.min(image.height, Math.ceil(region.y + region.h));
        for (const line of textLines(image, left, top, right, bottom)) {
          if (expired) return;
          items.push(...(await readLine(worker, image, left, right, line)));
        }
      }
    })();
    await Promise.race([reading, after(timeLimitMs, undefined)]);
    expired = true;
    return [...items];
  } catch {
    return [...items];
  }
}
