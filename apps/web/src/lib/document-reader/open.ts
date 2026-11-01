// Opens whatever a user picked: a PDF, or a screenshot or photo as a one-page document.
// Like a PDF, an image is only read in the browser and never uploaded.

import { rgbaToGray } from "@nexa-chess/types";
import { openPdf, previewOf, readPdfFile, DocumentReadError, DOCUMENT_LIMITS, type OpenedDocument, type RenderedPage } from "./pdf";

/** The largest picture accepted, in pixels: a decoded bitmap costs 4 bytes each. */
const MAX_IMAGE_PIXELS = 50_000_000;

const MB = 1024 * 1024;

type Kind = "pdf" | "image" | "unknown";

/** Checks the bytes themselves, not the extension or the browser's MIME guess. */
function sniff(head: Uint8Array): Kind {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head[0] === 0x89 && ascii(1, 4) === "PNG") return "image";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image";
  if (new TextDecoder("latin1").decode(head).includes("%PDF-")) return "pdf";
  return "unknown";
}

/** Reads width and height from PNG and WebP headers before allocating an ImageBitmap. */
function sniffImageDimensions(head: Uint8Array): { width: number; height: number } | null {
  if (head.length >= 24 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
    if (head[12] === 0x49 && head[13] === 0x48 && head[14] === 0x44 && head[15] === 0x52) {
      const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
      return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
    }
  }
  if (head.length >= 30) {
    const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
      const chunk = ascii(12, 16);
      if (chunk === "VP8X") {
        const width = 1 + (head[24] | (head[25] << 8) | (head[26] << 16));
        const height = 1 + (head[27] | (head[28] << 8) | (head[29] << 16));
        return { width, height };
      }
      if (chunk === "VP8L" && head.length >= 25 && head[20] === 0x2f) {
        const b1 = head[21];
        const b2 = head[22];
        const b3 = head[23];
        const b4 = head[24];
        const width = 1 + (((b2 & 0x3f) << 8) | b1);
        const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
        return { width, height };
      }
      if (chunk === "VP8 " && head[23] === 0x9d && head[24] === 0x01 && head[25] === 0x2a) {
        const width = (head[26] | (head[27] << 8)) & 0x3fff;
        const height = (head[28] | (head[29] << 8)) & 0x3fff;
        return { width, height };
      }
    }
  }
  return null;
}

async function openImage(file: File, head?: Uint8Array): Promise<OpenedDocument> {
  if (head) {
    const declared = sniffImageDimensions(head);
    if (declared && declared.width * declared.height > MAX_IMAGE_PIXELS) {
      throw new DocumentReadError("too-large", "That image is too large to read. Crop it to the page you need.");
    }
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new DocumentReadError("malformed", "This image is damaged or uses a format we can't read. Try saving it as a PNG or JPEG.");
  }
  if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
    bitmap.close();
    throw new DocumentReadError("too-large", "That image is too large to read. Crop it to the page you need.");
  }

  const renderPage = async (pageNumber: number): Promise<RenderedPage> => {
    const scale = Math.min(1, DOCUMENT_LIMITS.renderMaxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.floor(bitmap.width * scale));
    const height = Math.max(1, Math.floor(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new DocumentReadError("render-failed", "Your browser could not create a drawing surface.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const image = rgbaToGray(ctx.getImageData(0, 0, width, height).data, width, height);
    const preview = previewOf(canvas, width, height);
    canvas.width = 0;
    canvas.height = 0;
    return { image, pageNumber, preview, text: [] };
  };

  return {
    destroy: async () => bitmap.close(),
    kind: "image",
    pageCount: 1,
    renderPage,
  };
}

/** Opens a PDF or an image, whichever the file's bytes say it is. */
export async function openDocument(file: File): Promise<OpenedDocument> {
  if (file.size === 0) throw new DocumentReadError("empty", "That file is empty.");
  if (file.size > DOCUMENT_LIMITS.maxBytes) {
    throw new DocumentReadError(
      "too-large",
      `That file is ${(file.size / MB).toFixed(1)} MB — the limit is ${DOCUMENT_LIMITS.maxBytes / MB} MB. Split the book or export just the chapter you need.`,
    );
  }
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const kind = sniff(head);
  if (kind === "image") return openImage(file, head);
  if (kind === "pdf") return openPdf(await readPdfFile(file));
  const looksLikePdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  throw new DocumentReadError(
    "not-pdf",
    looksLikePdf ? "That file is not a PDF, whatever its name says." : "That file isn't a PDF or a PNG, JPEG or WebP image.",
  );
}
