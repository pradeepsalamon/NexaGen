// PDFs for the document reader. Entirely in the browser: the file is never uploaded.
// pdf.js parses it in a Web Worker, pages are rendered onto an in-memory canvas, and
// closing the document destroys it, so nothing outlives the tab.
//
// A PDF is untrusted input, so every step is bounded: file size, the `%PDF-` signature,
// page count, render size and a per-page time limit. pdf.js runs without eval
// (`isEvalSupported: false`), without XFA forms, and, since we never mount its viewer
// or scripting sandbox, without executing any JavaScript embedded in the document.

import { rgbaToGray, type DiagramRect as PixelRect, type GrayImage } from "@nexa-chess/types";

export const DOCUMENT_LIMITS = {
  /** Largest file accepted. */
  maxBytes: 30 * 1024 * 1024,
  /** Documents longer than this are refused outright. */
  maxPages: 600,
  /** Longest side of a rendered page, in pixels (≈ 180 dpi on A4). */
  renderMaxSide: 2100,
  /** Render scale cap for small pages (pdf.js scale 1 = 72 dpi). */
  maxScale: 3,
  /** A page that takes longer than this to render is skipped with an error. */
  renderTimeoutMs: 20_000,
  /** Opening/parsing the document. */
  openTimeoutMs: 30_000,
} as const;

export type DocumentReadErrorCode =
  | "too-large"
  | "empty"
  | "not-pdf"
  | "encrypted"
  | "malformed"
  | "too-many-pages"
  | "timeout"
  | "render-failed"
  | "unavailable";

export class DocumentReadError extends Error {
  constructor(
    readonly code: DocumentReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DocumentReadError";
  }
}

const MB = 1024 * 1024;

/** Checks the bytes themselves, not the extension or the browser's MIME guess. */
export async function readPdfFile(file: File): Promise<Uint8Array> {
  if (file.size === 0) throw new DocumentReadError("empty", "That file is empty.");
  if (file.size > DOCUMENT_LIMITS.maxBytes) {
    throw new DocumentReadError(
      "too-large",
      `That file is ${(file.size / MB).toFixed(1)} MB — the limit is ${DOCUMENT_LIMITS.maxBytes / MB} MB. Split the book or export just the chapter you need.`,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The PDF header may follow up to 1 KB of junk (the spec allows it).
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) {
    throw new DocumentReadError("not-pdf", "That file is not a PDF, whatever its name says.");
  }
  return bytes;
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Served from public/ by scripts/copy-pdfjs.mjs — see there for why it isn't bundled. */
const PDFJS_URL = "/vendor/pdfjs/pdf.min.mjs";
const PDFJS_WORKER_URL = "/vendor/pdfjs/pdf.worker.min.mjs";
/**
 * pdf.js' image decoders. Without this, a JPEG2000 image (most archive and many
 * scanner PDFs) silently paints nothing and the page renders blank.
 */
const PDFJS_WASM_URL = "/vendor/pdfjs/wasm/";

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

function imagePaintOps({ OPS }: PdfJs): ReadonlySet<number> {
  return new Set<number>([
    OPS.paintImageMaskXObject,
    OPS.paintImageMaskXObjectGroup,
    OPS.paintImageMaskXObjectRepeat,
    OPS.paintImageXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintInlineImageXObject,
    OPS.paintInlineImageXObjectGroup,
  ]);
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new DocumentReadError("timeout", message));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export type OpenedDocument = {
  kind: "pdf" | "image";
  pageCount: number;
  renderPage: (pageNumber: number) => Promise<RenderedPage>;
  /** The same part of a page rendered sharper; absent where there's nothing sharper to get. */
  renderRegion?: (pageNumber: number, rect: PixelRect, targetSide: number) => Promise<RenderedRegion | null>;
  destroy: () => Promise<void>;
};

export type RenderedRegion = {
  image: GrayImage;
  /** Where `rect` falls in `image`. */
  rect: PixelRect;
};

/** One run of text on a page, in rendered pixels. */
export type DocumentTextItem = {
  text: string;
  left: number;
  centerY: number;
  width: number;
};

export type RenderedPage = {
  pageNumber: number;
  image: GrayImage;
  /** The page's text layer (empty for a scan, a screenshot or a photo). */
  text: DocumentTextItem[];
  /** A small JPEG of the page for previews. */
  preview: { url: string; width: number; height: number };
};

/** Opens a PDF already checked by readPdfFile. */
export async function openPdf(bytes: Uint8Array): Promise<OpenedDocument> {
  let pdfjs: PdfJs;
  try {
    pdfjs = await loadPdfJs();
  } catch {
    throw new DocumentReadError("unavailable", "The PDF reader could not be loaded. Check your connection and try again.");
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
    wasmUrl: PDFJS_WASM_URL,
  });
  let doc: PdfDocument;
  try {
    doc = await withTimeout(task.promise, DOCUMENT_LIMITS.openTimeoutMs, () => void task.destroy(), "The PDF took too long to open.");
  } catch (err) {
    await task.destroy().catch(() => undefined);
    if (err instanceof DocumentReadError) throw err;
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") {
      throw new DocumentReadError("encrypted", "This PDF is password-protected. Remove the password (or print it to a new PDF) and try again.");
    }
    throw new DocumentReadError("malformed", "This PDF is damaged or uses a format we can't read. Try re-saving or re-exporting it.");
  }
  if (doc.numPages > DOCUMENT_LIMITS.maxPages) {
    await doc.destroy();
    throw new DocumentReadError(
      "too-many-pages",
      `This PDF has ${doc.numPages} pages — the limit is ${DOCUMENT_LIMITS.maxPages}. Export the chapter you need as its own PDF.`,
    );
  }

  const renderPage = async (pageNumber: number): Promise<RenderedPage> => {
    let page: PdfPage | null = null;
    let renderTask: { cancel: () => void } | null = null;
    let timedOut = false;

    const run = async (): Promise<RenderedPage> => {
      const p = await doc.getPage(pageNumber);
      page = p;
      if (timedOut) {
        p.cleanup();
        throw new DocumentReadError("timeout", `Page ${pageNumber} took too long to render and was skipped.`);
      }
      const base = p.getViewport({ scale: 1 });
      const scale = Math.min(DOCUMENT_LIMITS.maxScale, DOCUMENT_LIMITS.renderMaxSide / Math.max(base.width, base.height));
      const viewport = p.getViewport({ scale });
      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new DocumentReadError("render-failed", "Your browser could not create a drawing surface.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      const render = p.render({ canvas, canvasContext: ctx, viewport });
      renderTask = render;
      await render.promise;
      const image = rgbaToGray(ctx.getImageData(0, 0, width, height).data, width, height);
      // pdf.js only warns when an image can't be decoded, and the page would
      // then read as "no diagrams here". Say what really happened.
      if (image.data.every((value) => value === 255)) {
        const { fnArray } = await p.getOperatorList();
        if (fnArray.some((fn) => imagePaintOps(pdfjs).has(fn))) {
          throw new DocumentReadError("render-failed", `Page ${pageNumber} has a scanned image that could not be decoded. Reload the page and try again.`);
        }
      }

      const text: DocumentTextItem[] = [];
      try {
        const content = await withTimeout(p.getTextContent(), 5_000, () => undefined, "text");
        for (const item of content.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          const t = pdfjs.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.hypot(t[2], t[3]);
          text.push({ centerY: t[5] - fontHeight / 2, left: t[4], text: item.str, width: item.width * scale });
        }
      } catch {
        // No text layer is fine: a scan has none.
      }

      const preview = previewOf(canvas, width, height);
      // Release the full-size bitmap right away.
      canvas.width = 0;
      canvas.height = 0;
      return { pageNumber, image, text, preview };
    };

    const cleanupPage = () => {
      const p = page as PdfPage | null;
      p?.cleanup();
    };

    try {
      return await withTimeout(
        run(),
        DOCUMENT_LIMITS.renderTimeoutMs,
        () => {
          timedOut = true;
          renderTask?.cancel();
          cleanupPage();
        },
        `Page ${pageNumber} took too long to render and was skipped.`,
      );
    } catch (err) {
      if (err instanceof DocumentReadError) throw err;
      throw new DocumentReadError("render-failed", `Page ${pageNumber} could not be rendered.`);
    } finally {
      cleanupPage();
    }
  };

  const renderRegion = async (pageNumber: number, rect: PixelRect, targetSide: number): Promise<RenderedRegion | null> => {
    let page: PdfPage | null = null;
    let renderTask: { cancel: () => void } | null = null;
    let timedOut = false;

    const run = async (): Promise<RenderedRegion | null> => {
      const p = await doc.getPage(pageNumber);
      page = p;
      if (timedOut) {
        p.cleanup();
        return null;
      }
      const base = p.getViewport({ scale: 1 });
      const pageScale = Math.min(DOCUMENT_LIMITS.maxScale, DOCUMENT_LIMITS.renderMaxSide / Math.max(base.width, base.height));
      const zoom = targetSide / Math.max(rect.w, rect.h);
      if (zoom <= 1.05) return null;
      const scale = pageScale * zoom;
      const margin = Math.max(rect.w, rect.h) * 0.06;
      const left = Math.max(0, rect.x - margin);
      const top = Math.max(0, rect.y - margin);
      const width = Math.ceil((rect.w + 2 * margin) * zoom);
      const height = Math.ceil((rect.h + 2 * margin) * zoom);
      const viewport = p.getViewport({ offsetX: -left * zoom, offsetY: -top * zoom, scale });
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      const render = p.render({ canvas, canvasContext: ctx, viewport });
      renderTask = render;
      await render.promise;
      const image = rgbaToGray(ctx.getImageData(0, 0, width, height).data, width, height);
      canvas.width = 0;
      canvas.height = 0;
      return { image, rect: { h: rect.h * zoom, w: rect.w * zoom, x: (rect.x - left) * zoom, y: (rect.y - top) * zoom } };
    };

    const cleanupPage = () => {
      const p = page as PdfPage | null;
      p?.cleanup();
    };

    try {
      return await withTimeout(
        run(),
        DOCUMENT_LIMITS.renderTimeoutMs,
        () => {
          timedOut = true;
          renderTask?.cancel();
          cleanupPage();
        },
        "region",
      );
    } catch {
      // The first reading stands.
      return null;
    } finally {
      cleanupPage();
    }
  };

  return {
    destroy: () => doc.destroy(),
    kind: "pdf",
    pageCount: doc.numPages,
    renderPage,
    renderRegion,
  };
}

/** A small JPEG of a rendered page. `width`/`height` stay the full-size page's. */
export function previewOf(canvas: HTMLCanvasElement, width: number, height: number): RenderedPage["preview"] {
  const previewScale = Math.min(1, 1000 / Math.max(width, height));
  const small = document.createElement("canvas");
  small.width = Math.round(width * previewScale);
  small.height = Math.round(height * previewScale);
  small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
  return { height, url: small.toDataURL("image/jpeg", 0.8), width };
}
