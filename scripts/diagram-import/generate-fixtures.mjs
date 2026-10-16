#!/usr/bin/env node
// Regenerates the PDF diagram-import test fixtures. Deterministic (no Math.random
// — the "scan" noise uses a seeded generator), so the outputs are committed.
//
//   node scripts/diagram-import/generate-fixtures.mjs
//
// Writes:
//   e2e/fixtures/diagram-import/*.pdf         — browser (Playwright) fixtures
//   e2e/fixtures/diagram-import/expected.json — what each PDF contains
//   apps/api/src/common/chess/__fixtures__/diagram/*.pgm.gz + expected.json
//                                             — grayscale page images for the
//                                               Jest recognizer spec
//
// The diagrams use the vendored piece sets (apps/web/public/chess/pieces). The
// recognizer's templates come from the same sets, so these fixtures measure the
// pipeline, not recognition of an arbitrary book font — the Jest spec's
// leave-one-set-out test is the honest number for an unseen font.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import PDFDocument from "pdfkit";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PIECE_DIR = join(ROOT, "apps/web/public/chess/pieces");
const PDF_OUT = join(ROOT, "e2e/fixtures/diagram-import");
const IMG_OUT = join(ROOT, "apps/api/src/common/chess/__fixtures__/diagram");
mkdirSync(PDF_OUT, { recursive: true });
mkdirSync(IMG_OUT, { recursive: true });

const SETS = ["classic", "tournament", "modern", "minimal", "wooden", "bold"];

const pieceUri = new Map();
for (const set of SETS) {
  for (const c of ["w", "b"]) {
    for (const p of ["P", "N", "B", "R", "Q", "K"]) {
      const svg = readFileSync(join(PIECE_DIR, set, `${c}${p}.svg`));
      pieceUri.set(`${set}/${c === "w" ? p : p.toLowerCase()}`, `data:image/svg+xml;base64,${svg.toString("base64")}`);
    }
  }
}

/** Inline SVG of one diagram. `style`: hatched (book), gray (digital), green (screen). */
function boardSvg({ fen, set, cell, style, flipped = false, coords = true, frame = true }) {
  const placement = fen.split(" ")[0];
  const rows = placement.split("/").map((r) => {
    const out = [];
    for (const ch of r) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i += 1) out.push(null);
      else out.push(ch);
    }
    return out;
  });
  const pad = coords ? Math.round(cell * 0.6) : 4;
  const size = cell * 8;
  const parts = [];
  const light = style === "green" ? "#eeeed2" : "#ffffff";
  const dark = style === "gray" ? "#b8b8b8" : style === "green" ? "#769656" : "url(#hatch)";
  parts.push(
    `<defs><pattern id="hatch" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3.2" height="3.2" fill="#fff"/><line x1="0" y1="0" x2="0" y2="3.2" stroke="#000" stroke-width="1.1"/></pattern></defs>`,
  );
  for (let r = 0; r < 8; r += 1) {
    for (let f = 0; f < 8; f += 1) {
      const isDark = (r + f) % 2 === 1;
      parts.push(`<rect x="${pad + f * cell}" y="${pad + r * cell}" width="${cell}" height="${cell}" fill="${isDark ? dark : light}"/>`);
      const piece = flipped ? rows[7 - r][7 - f] : rows[r][f];
      if (piece) {
        parts.push(`<image x="${pad + f * cell}" y="${pad + r * cell}" width="${cell}" height="${cell}" href="${pieceUri.get(`${set}/${piece}`)}"/>`);
      }
    }
  }
  if (frame) parts.push(`<rect x="${pad - 1}" y="${pad - 1}" width="${size + 2}" height="${size + 2}" fill="none" stroke="#000" stroke-width="2"/>`);
  if (coords) {
    const files = flipped ? "hgfedcba" : "abcdefgh";
    const ranks = flipped ? "12345678" : "87654321";
    for (let i = 0; i < 8; i += 1) {
      parts.push(`<text x="${pad + i * cell + cell / 2}" y="${pad + size + pad * 0.75}" font-size="${cell * 0.32}" text-anchor="middle" font-family="serif">${files[i]}</text>`);
      parts.push(`<text x="${pad * 0.45}" y="${pad + i * cell + cell * 0.62}" font-size="${cell * 0.32}" text-anchor="middle" font-family="serif">${ranks[i]}</text>`);
    }
  }
  const total = size + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}">${parts.join("")}</svg>`;
}

const LOREM =
  "The bishop pair is a long-term asset. In the following position White has completed development and must decide how to open the centre before Black castles. Note how the knight on f3 supports the advance of the d-pawn, and how the rook can follow along the e-file once the pawns are exchanged.";

const POSITIONS = {
  italian: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1",
  tactic: "r4rk1/ppp2ppp/2n5/3q4/3P4/2N5/PP3PPP/R2QR1K1 b - - 0 1",
  flipped: "2kr3r/ppp2ppp/2n1b3/8/2B5/2N2N2/PPP2PPP/R4RK1 w - - 0 1",
  endgame: "8/5pk1/6p1/3R4/8/6P1/r4PK1/8 w - - 0 1",
  scan: "r2q1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 1",
};

function bookPage(diagrams) {
  return `<!doctype html><html><head><style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Georgia, serif; font-size: 11pt; color: #111; }
    h1 { font-size: 16pt; }
    .dia { margin: 10px 0 4px; }
    .cap { font-style: italic; margin: 0 0 14px; }
    table.grid { border-collapse: collapse; margin-top: 12px; }
    table.grid td { border: 1px solid #000; width: 22px; height: 22px; font-size: 8pt; text-align: center; }
  </style></head><body>${diagrams}</body></html>`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();
const expected = {};

// 1. Two book-style (hatched, Merida-like "tournament") diagrams + a text-only page
//    with an 8×8 table that must NOT be detected as a board.
{
  const html = bookPage(`
    <h1>Chapter 3 — Opening the centre</h1>
    <p>${LOREM}</p>
    <div class="dia">${boardSvg({ fen: POSITIONS.italian, set: "tournament", cell: 26, style: "hatched" })}</div>
    <p class="cap">Diagram 12 — White to move</p>
    <p>${LOREM}</p>
    <div class="dia">${boardSvg({ fen: POSITIONS.tactic, set: "tournament", cell: 26, style: "hatched" })}</div>
    <p class="cap">Diagram 13 — Black to play and win</p>
    <div style="page-break-before: always"></div>
    <h1>Exercises — answers</h1>
    <p>${LOREM}</p><p>${LOREM}</p>
    <table class="grid">${Array.from({ length: 8 }, (_, r) => `<tr>${Array.from({ length: 8 }, (_, c) => `<td>${r * 8 + c + 1}</td>`).join("")}</tr>`).join("")}</table>
    <p>${LOREM}</p>`);
  await page.setContent(html, { waitUntil: "load" });
  writeFileSync(join(PDF_OUT, "book-two-diagrams.pdf"), await page.pdf({ format: "A4", printBackground: true }));
  expected["book-two-diagrams.pdf"] = {
    pages: 2,
    diagrams: [
      { page: 1, fen: POSITIONS.italian, orientation: "white", sideToMove: "w" },
      { page: 1, fen: POSITIONS.tactic, orientation: "white", sideToMove: "b" },
    ],
  };
}

// 2. A digital diagram printed from Black's side (coordinates h..a), gray squares, cburnett.
{
  const html = bookPage(`
    <h1>Model game</h1><p>${LOREM}</p>
    <div class="dia">${boardSvg({ fen: POSITIONS.flipped, set: "classic", cell: 30, style: "gray", flipped: true })}</div>
    <p class="cap">Position after 14.O-O</p>`);
  await page.setContent(html, { waitUntil: "load" });
  writeFileSync(join(PDF_OUT, "flipped-gray.pdf"), await page.pdf({ format: "A4", printBackground: true }));
  expected["flipped-gray.pdf"] = {
    pages: 1,
    diagrams: [{ page: 1, fen: POSITIONS.flipped, orientation: "black", sideToMove: null }],
  };
}

// 3. A "scanned" page: rasterized at ~120 dpi, blurred, noised, JPEG, embedded as an image.
//    No text layer, so orientation and side to move cannot be read from the PDF.
{
  const html = bookPage(`
    <h1>Endgame technique</h1><p>${LOREM}</p>
    <div class="dia">${boardSvg({ fen: POSITIONS.scan, set: "tournament", cell: 26, style: "hatched", coords: false })}</div>
    <p class="cap">White to move</p><p>${LOREM}</p>`);
  const scanCtx = await browser.newContext({ deviceScaleFactor: 1.25, viewport: { width: 794, height: 1123 } });
  const scanPage = await scanCtx.newPage();
  await scanPage.setContent(html.replace("@page { size: A4; margin: 18mm; }", "body { margin: 68px; }"), { waitUntil: "load" });
  const png = await scanPage.screenshot({ fullPage: false });
  const jpegDataUrl = await scanPage.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.filter = "blur(0.7px) contrast(0.85) brightness(0.97)";
    g.drawImage(img, 0, 0);
    g.filter = "none";
    const d = g.getImageData(0, 0, c.width, c.height);
    let seed = 1234567;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < d.data.length; i += 4) {
      const n = (rand() - 0.5) * 36;
      const v = Math.max(0, Math.min(255, 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2] + n));
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    }
    g.putImageData(d, 0, 0);
    return c.toDataURL("image/jpeg", 0.72);
  }, png.toString("base64"));
  await scanCtx.close();
  await page.setContent(
    `<!doctype html><html><head><style>@page { size: A4; margin: 0; } body { margin: 0; } img { width: 210mm; height: 297mm; display: block; }</style></head><body><img src="${jpegDataUrl}"></body></html>`,
    { waitUntil: "load" },
  );
  writeFileSync(join(PDF_OUT, "scanned-page.pdf"), await page.pdf({ format: "A4", printBackground: true }));
  expected["scanned-page.pdf"] = {
    pages: 1,
    diagrams: [{ page: 1, fen: POSITIONS.scan, orientation: "white", sideToMove: null }],
  };
}

// 4. No diagrams at all.
{
  await page.setContent(bookPage(`<h1>Preface</h1><p>${LOREM}</p><p>${LOREM}</p>`), { waitUntil: "load" });
  writeFileSync(join(PDF_OUT, "no-diagrams.pdf"), await page.pdf({ format: "A4", printBackground: true }));
  expected["no-diagrams.pdf"] = { pages: 1, diagrams: [] };
}

// 5. Rejection cases: a password-protected PDF, a truncated one, and a non-PDF.
await new Promise((resolve) => {
  const doc = new PDFDocument({ userPassword: "secret", ownerPassword: "owner" });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  doc.on("end", () => {
    writeFileSync(join(PDF_OUT, "encrypted.pdf"), Buffer.concat(chunks));
    resolve();
  });
  doc.text("Locked");
  doc.end();
});
writeFileSync(join(PDF_OUT, "malformed.pdf"), "%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer garbage");
writeFileSync(join(PDF_OUT, "not-a-pdf.pdf"), "This is a plain text file with a .pdf name.\n");
expected["encrypted.pdf"] = { error: "encrypted" };
expected["malformed.pdf"] = { error: "malformed" };
expected["not-a-pdf.pdf"] = { error: "not-pdf" };
writeFileSync(join(PDF_OUT, "expected.json"), `${JSON.stringify(expected, null, 2)}\n`);

// ── Jest images: one page per piece set, two diagrams each (hatched + gray),
//    grayscale, gzipped binary PGM. Plus the "scan" style page.
const imgExpected = [];
async function grabGray(html, name, diagrams, scale = 1) {
  const c = await browser.newContext({ deviceScaleFactor: scale, viewport: { width: 760, height: 520 } });
  const p = await c.newPage();
  await p.setContent(html, { waitUntil: "load" });
  const png = await p.screenshot({ fullPage: true });
  const { width, height, gray } = await p.evaluate(async ({ b64, blur }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    const g = cv.getContext("2d");
    if (blur) g.filter = "blur(0.8px)";
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const out = [];
    for (let i = 0; i < d.length; i += 4) {
      const n = blur ? (rand() - 0.5) * 30 : 0;
      out.push(Math.max(0, Math.min(255, Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] + n))));
    }
    return { width: cv.width, height: cv.height, gray: out };
  }, { b64: png.toString("base64"), blur: name.includes("noisy") });
  await c.close();
  const header = Buffer.from(`P5\n${width} ${height}\n255\n`);
  writeFileSync(join(IMG_OUT, `${name}.pgm.gz`), gzipSync(Buffer.concat([header, Buffer.from(gray)]), { level: 9 }));
  imgExpected.push({ file: `${name}.pgm.gz`, diagrams });
}

const pageHtml = (body) =>
  `<!doctype html><html><head><style>body{margin:16px;font-family:Georgia,serif;font-size:13px;color:#111;background:#fff} .row{display:flex;gap:28px;align-items:flex-start} p{width:700px}</style></head><body>${body}</body></html>`;

for (const set of SETS) {
  await grabGray(
    pageHtml(`<p>${LOREM}</p><div class="row">
      <div>${boardSvg({ fen: POSITIONS.italian, set, cell: 40, style: "hatched" })}<p style="width:auto">White to move</p></div>
      <div>${boardSvg({ fen: POSITIONS.endgame, set, cell: 40, style: "gray", coords: false, frame: false })}</div></div>`),
    `set-${set}`,
    [
      { set, fen: POSITIONS.italian, style: "hatched" },
      { set, fen: POSITIONS.endgame, style: "gray" },
    ],
  );
}
await grabGray(
  pageHtml(`<p>${LOREM}</p><div class="row">
    <div>${boardSvg({ fen: POSITIONS.tactic, set: "tournament", cell: 34, style: "hatched", coords: false })}</div>
    <div>${boardSvg({ fen: POSITIONS.flipped, set: "classic", cell: 34, style: "green", flipped: true })}</div></div>`),
  "noisy-scan",
  [
    { set: "tournament", fen: POSITIONS.tactic, style: "hatched" },
    { set: "classic", fen: POSITIONS.flipped, style: "green", flipped: true },
  ],
);
await grabGray(
  pageHtml(`<p>${LOREM}</p><p>${LOREM}</p><table style="border-collapse:collapse">${Array.from({ length: 8 }, (_, r) => `<tr>${Array.from({ length: 8 }, (_, c) => `<td style="border:1px solid #000;width:30px;height:30px;text-align:center">${r * 8 + c}</td>`).join("")}</tr>`).join("")}</table>`),
  "no-board",
  [],
);
writeFileSync(join(IMG_OUT, "expected.json"), `${JSON.stringify(imgExpected, null, 2)}\n`);

await browser.close();
console.log(`fixtures written to ${PDF_OUT} and ${IMG_OUT}`);
