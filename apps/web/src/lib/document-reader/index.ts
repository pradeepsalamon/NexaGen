// Reads PDFs and images in the browser, for any feature. Nothing is uploaded or stored.
//
//   const doc = await openDocument(file);        // PDF, PNG, JPEG or WebP
//   const page = await doc.renderPage(1);        // grayscale pixels + the text layer
//   const { text, source } = await readPageText(page);   // text layer, or OCR if none
//   await doc.destroy();

export { openDocument } from "./open";
export { readTextInRegions } from "./ocr";
export { readPageText, type PageText } from "./text";
export {
  DOCUMENT_LIMITS,
  DocumentReadError,
  type DocumentReadErrorCode,
  type DocumentTextItem,
  type OpenedDocument,
  type RenderedPage,
  type RenderedRegion,
} from "./pdf";
