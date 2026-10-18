#!/usr/bin/env node
// Captures pages of the PDF fixtures exactly as the browser pipeline sees them
// (pdf.js, same render size as apps/web/src/features/diagram-import/lib/pdf.ts)
// and stores them as gzipped PGMs for the Jest recognizer spec.
//
//   node apps/web/scripts/copy-pdfjs.mjs        # once, provides the pdf.js build
//   node scripts/diagram-import/capture-pdf-renders.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PDFS = join(ROOT, "e2e/fixtures/diagram-import");
const VENDOR = join(ROOT, "apps/web/public/vendor/pdfjs");
const OUT = join(ROOT, "apps/api/src/common/chess/__fixtures__/diagram");
// Keep in step with PDF_IMPORT_LIMITS in lib/pdf.ts.
const RENDER_MAX_SIDE = 2100;
const MAX_SCALE = 3;

const expectedPdfs = JSON.parse(readFileSync(join(PDFS, "expected.json"), "utf8"));
// [pdf, page, fixture name, piece set + square style of each diagram on that page]
const PAGES = [
  ["book-two-diagrams.pdf", 1, "pdfjs-book-p1", [["tournament", "hatched"], ["tournament", "hatched"]]],
  ["flipped-gray.pdf", 1, "pdfjs-flipped", [["classic", "gray"]]],
  // The scan's noise doesn't compress: keep the top of the page (board + caption) only.
  ["scanned-page.pdf", 1, "pdfjs-scan", [["tournament", "hatched"]], 1000],
];
const manifest = [];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("http://fixture.local/**", (route) => {
  const name = route.request().url().split("/").pop();
  if (name === "index.html") return route.fulfill({ body: "<!doctype html><html><body></body></html>", contentType: "text/html" });
  const body = name.endsWith(".pdf") ? readFileSync(join(PDFS, name)) : readFileSync(join(VENDOR, name));
  return route.fulfill({ body, contentType: name.endsWith(".pdf") ? "application/pdf" : "text/javascript" });
});
// Same-origin page, so the module import and the worker load without CORS.
await page.goto("http://fixture.local/index.html");
for (const [file, pageNumber, name, styles, keepRows] of PAGES) {
  const { width, height, gray } = await page.evaluate(
    async ({ file, pageNumber, maxSide, maxScale }) => {
      const pdfjs = await import("http://fixture.local/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "http://fixture.local/pdf.worker.min.mjs";
      const data = new Uint8Array(await (await fetch(`http://fixture.local/${file}`)).arrayBuffer());
      const doc = await pdfjs.getDocument({ data, isEvalSupported: false, enableXfa: false, useSystemFonts: true }).promise;
      const p = await doc.getPage(pageNumber);
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: Math.min(maxScale, maxSide / Math.max(base.width, base.height)) });
      const c = document.createElement("canvas");
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      await p.render({ canvas: c, canvasContext: ctx, viewport }).promise;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const gray = [];
      for (let i = 0; i < d.length; i += 4) gray.push(Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]));
      return { width: c.width, height: c.height, gray };
    },
    { file, pageNumber, maxSide: RENDER_MAX_SIDE, maxScale: MAX_SCALE },
  );
  const rows = Math.min(height, keepRows ?? height);
  const header = Buffer.from(`P5\n${width} ${rows}\n255\n`);
  const pixels = Buffer.from(gray.slice(0, width * rows));
  writeFileSync(join(OUT, `${name}.pgm.gz`), gzipSync(Buffer.concat([header, pixels]), { level: 9 }));
  console.log(`${name}: ${width}×${height}`);
  manifest.push({
    file: `${name}.pgm.gz`,
    diagrams: expectedPdfs[file].diagrams
      .filter((d) => d.page === pageNumber)
      .map((d, i) => ({ set: styles[i][0], style: styles[i][1], fen: d.fen, ...(d.orientation === "black" ? { flipped: true } : {}) })),
  });
}
writeFileSync(join(OUT, "pdfjs-expected.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
