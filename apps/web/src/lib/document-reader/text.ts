import { readTextInRegions } from "./ocr";
import type { DocumentTextItem, RenderedPage } from "./pdf";

export type PageText = {
  text: string;
  items: DocumentTextItem[];
  /** "ocr" text can contain mistakes; "none" means neither way found any. */
  source: "text-layer" | "ocr" | "none";
};

const OCR_PAGE_TIME_LIMIT_MS = 60_000;

/** A page's text in reading order: its text layer if it has one, otherwise OCR. */
export async function readPageText(page: RenderedPage): Promise<PageText> {
  if (page.text.length > 0) return { items: page.text, source: "text-layer", text: joinInReadingOrder(page.text) };
  const whole = { h: page.image.height, w: page.image.width, x: 0, y: 0 };
  const items = await readTextInRegions(page.image, [whole], OCR_PAGE_TIME_LIMIT_MS);
  return items.length > 0 ? { items, source: "ocr", text: joinInReadingOrder(items) } : { items: [], source: "none", text: "" };
}

function joinInReadingOrder(items: DocumentTextItem[]): string {
  const sorted = [...items].sort((a, b) => a.centerY - b.centerY);
  const lines: DocumentTextItem[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    // Same line: within half a typical line height of the line's first item.
    if (line && Math.abs(line[0].centerY - item.centerY) < 6) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => line.sort((a, b) => a.left - b.left).map((item) => item.text).join(" ")).join("\n");
}
