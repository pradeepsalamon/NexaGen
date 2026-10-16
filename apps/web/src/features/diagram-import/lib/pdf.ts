// PDF handling for the diagram import — entirely in the coach's browser.
//
// The file is never uploaded: pdf.js parses it in a Web Worker, pages are
// rendered onto an in-memory canvas, and only the grayscale pixels and the
// page's text positions are handed to the recognizer. Closing the page (or
// loading another file) destroys the document, so nothing outlives the tab.
//
// The PDF is still untrusted input, so every step is bounded: file size, the
// `%PDF-` signature, page count, render size and a per-page time limit. pdf.js
// runs without eval (`isEvalSupported: false`), without XFA forms, and — since
// we never mount pdf.js' viewer or its scripting sandbox — without executing
// any JavaScript embedded in the document.

import { rgbaToGray, type DiagramTextItem, type GrayImage } from "@nexa-chess/types";

export const PDF_IMPORT_LIMITS = {
  /** Largest file accepted. */
  maxBytes: 30 * 1024 * 1024,
  /** Documents longer than this are refused outright. */
  maxPages: 600,
  /** Pages one scan may cover; the coach picks the range. */
  maxPagesPerScan: 20,
  /** Longest side of a rendered page, in pixels (≈ 180 dpi on A4). */
  renderMaxSide: 2100,
  /** Render scale cap for small pages (pdf.js scale 1 = 72 dpi). */
  maxScale: 3,
  /** A page that takes longer than this to render is skipped with an error. */
  renderTimeoutMs: 20_000,
  /** Opening/parsing the document. */
  openTimeoutMs: 30_000,
} as const;

export type PdfImportErrorCode =
  | "too-large"
  | "empty"
  | "not-pdf"
  | "encrypted"
  | "malformed"
  | "too-many-pages"
  | "timeout"
  | "render-failed"
  | "unavailable";

export class PdfImportError extends Error {
  constructor(
    readonly code: PdfImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PdfImportError";
  }
}

const MB = 1024 * 1024;

/** Checks the bytes themselves, not the extension or the browser's MIME guess. */
export async function readPdfFile(file: File): Promise<Uint8Array> {
  if (file.size === 0) throw new PdfImportError("empty", "That file is empty.");
  if (file.size > PDF_IMPORT_LIMITS.maxBytes) {
    throw new PdfImportError(
      "too-large",
      `That file is ${(file.size / MB).toFixed(1)} MB — the limit is ${PDF_IMPORT_LIMITS.maxBytes / MB} MB. Split the book or export just the chapter you need.`,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The PDF header may follow up to 1 KB of junk (the spec allows it).
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) {
    throw new PdfImportError("not-pdf", "That file is not a PDF, whatever its name says.");
  }
  return bytes;
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Served from public/ by scripts/copy-pdfjs.mjs — see there for why it isn't bundled. */
const PDFJS_URL = "/vendor/pdfjs/pdf.min.mjs";
const PDFJS_WORKER_URL = "/vendor/pdfjs/pdf.worker.min.mjs";

/** pdf.js (~1.5 MB with its worker) is only fetched when a coach opens a PDF. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (import(/* webpackIgnore: true */ PDFJS_URL) as Promise<PdfJs>).then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return pdfjs;
  });
  // A failed fetch (offline, blocked) may be retried by the next file.
  pdfjsPromise.catch(() => {
    pdfjsPromise = null;
  });
  return pdfjsPromise;
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new PdfImportError("timeout", message));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export type OpenedPdf = {
  pageCount: number;
  renderPage: (pageNumber: number) => Promise<RenderedPage>;
  destroy: () => Promise<void>;
};

export type RenderedPage = {
  pageNumber: number;
  image: GrayImage;
  /** Text items with their centres in image pixels (empty for a scan). */
  text: DiagramTextItem[];
  /** A small JPEG of the page for the preview / manual selection. */
  preview: { url: string; width: number; height: number };
};

/** Opens a PDF already checked by readPdfFile. */
export async function openPdf(bytes: Uint8Array): Promise<OpenedPdf> {
  let pdfjs: PdfJs;
  try {
    pdfjs = await loadPdfJs();
  } catch {
    throw new PdfImportError("unavailable", "The PDF reader could not be loaded. Check your connection and try again.");
  }
  const task = pdfjs.getDocument({
    // pdf.js transfers the buffer to its worker; keep the caller's copy intact.
    data: bytes.slice(),
    disableAutoFetch: true,
    disableStream: true,
    enableXfa: false,
    isEvalSupported: false,
    // Raster images inside the PDF: refuse anything above ~50 megapixels.
    maxImageSize: 50_000_000,
    stopAtErrors: false,
    useSystemFonts: true,
  });
  let doc: PdfDocument;
  try {
    doc = await withTimeout(task.promise, PDF_IMPORT_LIMITS.openTimeoutMs, () => void task.destroy(), "The PDF took too long to open.");
  } catch (err) {
    await task.destroy().catch(() => undefined);
    if (err instanceof PdfImportError) throw err;
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") {
      throw new PdfImportError("encrypted", "This PDF is password-protected. Remove the password (or print it to a new PDF) and try again.");
    }
    throw new PdfImportError("malformed", "This PDF is damaged or uses a format we can't read. Try re-saving or re-exporting it.");
  }
  if (doc.numPages > PDF_IMPORT_LIMITS.maxPages) {
    await doc.destroy();
    throw new PdfImportError(
      "too-many-pages",
      `This PDF has ${doc.numPages} pages — the limit is ${PDF_IMPORT_LIMITS.maxPages}. Export the chapter you need as its own PDF.`,
    );
  }

  const renderPage = async (pageNumber: number): Promise<RenderedPage> => {
    const page = await doc.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(PDF_IMPORT_LIMITS.maxScale, PDF_IMPORT_LIMITS.renderMaxSide / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new PdfImportError("render-failed", "Your browser could not create a drawing surface.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      const render = page.render({ canvas, canvasContext: ctx, viewport });
      await withTimeout(
        render.promise,
        PDF_IMPORT_LIMITS.renderTimeoutMs,
        () => render.cancel(),
        `Page ${pageNumber} took too long to render and was skipped.`,
      );
      const image = rgbaToGray(ctx.getImageData(0, 0, width, height).data, width, height);

      const text: DiagramTextItem[] = [];
      try {
        const content = await withTimeout(page.getTextContent(), 5_000, () => undefined, "text");
        for (const item of content.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          const t = pdfjs.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.hypot(t[2], t[3]);
          const itemWidth = item.width * scale;
          text.push(...splitTextItem(item.str, t[4], t[5] - fontHeight / 2, itemWidth));
        }
      } catch {
        // No text layer is fine: a scan has none, and orientation then needs the coach.
      }

      const previewScale = Math.min(1, 1000 / Math.max(width, height));
      const pc = document.createElement("canvas");
      pc.width = Math.round(width * previewScale);
      pc.height = Math.round(height * previewScale);
      pc.getContext("2d")?.drawImage(canvas, 0, 0, pc.width, pc.height);
      const preview = { url: pc.toDataURL("image/jpeg", 0.8), width, height };
      // Release the full-size bitmap right away.
      canvas.width = 0;
      canvas.height = 0;
      return { pageNumber, image, text, preview };
    } catch (err) {
      if (err instanceof PdfImportError) throw err;
      throw new PdfImportError("render-failed", `Page ${pageNumber} could not be rendered.`);
    } finally {
      page.cleanup();
    }
  };

  return {
    pageCount: doc.numPages,
    renderPage,
    destroy: () => doc.destroy(),
  };
}

/**
 * One text run → items with centres. A run of board coordinates printed as a
 * single string ("a b c d e f g h") is spread evenly across its width so each
 * letter can be matched to a file.
 */
function splitTextItem(str: string, left: number, centerY: number, width: number): DiagramTextItem[] {
  const compact = str.replace(/\s+/g, "");
  if (compact.length > 1 && compact.length <= 8 && (/^[a-h]+$/.test(compact) || /^[1-8]+$/.test(compact))) {
    const step = width / compact.length;
    return [...compact].map((ch, i) => ({ text: ch, x: left + step * (i + 0.5), y: centerY }));
  }
  return [{ text: str, x: left + width / 2, y: centerY }];
}

/** A crop of the page around one board, as a data URL, for side-by-side review. */
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
