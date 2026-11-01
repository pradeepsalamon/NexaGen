// Real scanned books for the diagram recognizer: downloads them, renders their
// pages the way lib/pdf.ts does, then measures the recognizer or exports labelled
// squares for train-square-classifier.py. Nothing downloaded is ever committed.
//
//   npx tsx scripts/diagram-import/real-books/real-books.mts measure <work-dir> [extra-labels.json]
//   npx tsx scripts/diagram-import/real-books/real-books.mts export  <work-dir> <out-dir> [extra-labels.json]
//
// <work-dir> keeps the PDFs and rendered pages between runs; keep it outside the
// repo. extra-labels.json is { "<archive.org id>": { "p40-1": "<placement>" } } for
// a private held-out book, with its PDF at <work-dir>/<id>/book.pdf.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  DIAGRAM_LOW_CONFIDENCE,
  DIAGRAM_SQUARE_SIZE,
  detectDiagramBoards,
  diagramGridToPlacement,
  recognizeDiagramBoard,
  sampleDiagramSquares,
  type GrayImage,
} from "../../../packages/types/src/diagram-recognition";

type Book = { id: string; sha256?: string; boards: Record<string, string>; annotated?: string[] };

const here = dirname(new URL(import.meta.url).pathname);
const root = join(here, "../../..");
const require = createRequire(join(root, "package.json"));

// Keep in step with DOCUMENT_LIMITS in apps/web/src/lib/document-reader/pdf.ts.
const RENDER_MAX_SIDE = 2100;
const MAX_SCALE = 3;

function loadBooks(extra?: string): Book[] {
  const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8")) as { books: Book[] };
  const books = [...manifest.books];
  if (extra) {
    for (const [id, boards] of Object.entries(JSON.parse(readFileSync(extra, "utf8")) as Record<string, Record<string, string>>)) {
      books.push({ boards, id });
    }
  }
  return books;
}

async function fetchBook(work: string, book: Book): Promise<string> {
  const path = join(work, book.id, "book.pdf");
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    const response = await fetch(`https://archive.org/download/${book.id}/${book.id}.pdf`);
    if (!response.ok) throw new Error(`${book.id}: HTTP ${response.status}`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  if (book.sha256) {
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (actual !== book.sha256) throw new Error(`${book.id}: checksum mismatch, the labels may not fit this scan`);
  }
  return path;
}

/** Pages this book's labels name, rendered once and kept as PGM. */
async function pagesOf(work: string, book: Book): Promise<Map<number, GrayImage>> {
  const pdfPath = await fetchBook(work, book);
  const wanted = [...new Set([...Object.keys(book.boards), ...(book.annotated ?? [])].map(pageOf))];
  const pgmDir = join(work, book.id, "pgm");
  mkdirSync(pgmDir, { recursive: true });
  const missing = wanted.filter((n) => !existsSync(join(pgmDir, `${n}.pgm`)));
  if (missing.length > 0) {
    const pdfjs = await import(join(root, "node_modules/pdfjs-dist/legacy/build/pdf.mjs"));
    const { createCanvas } = require("@napi-rs/canvas");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(readFileSync(pdfPath)),
      enableXfa: false,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
      wasmUrl: join(root, "node_modules/pdfjs-dist/wasm/"),
    }).promise;
    for (const n of missing) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(MAX_SCALE, RENDER_MAX_SIDE / Math.max(base.width, base.height)) });
      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const gray = Buffer.alloc(width * height);
      for (let i = 0; i < gray.length; i += 1) gray[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
      writeFileSync(join(pgmDir, `${n}.pgm`), Buffer.concat([Buffer.from(`P5 ${width} ${height} 255\n`), gray]));
      page.cleanup();
    }
    await doc.destroy();
  }
  return new Map(wanted.map((n) => [n, readPgm(join(pgmDir, `${n}.pgm`))]));
}

function readPgm(path: string): GrayImage {
  const buffer = readFileSync(path);
  const header = buffer.toString("latin1", 0, 30).match(/^P5 (\d+) (\d+) 255\n/);
  if (!header) throw new Error(`${path} is not a PGM`);
  return { data: new Uint8Array(buffer.subarray(header[0].length)), height: Number(header[2]), width: Number(header[1]) };
}

const pageOf = (name: string) => Number((name.match(/^p(\d+)-/) as RegExpMatchArray)[1]);
const indexOf = (name: string) => Number((name.match(/-(\d+)$/) as RegExpMatchArray)[1]) - 1;
const expand = (placement: string) => placement.split("/").map((r) => r.replace(/\d/g, (n) => ".".repeat(Number(n)))).join("");

async function measure(work: string, extra?: string) {
  const total = { boards: 0, flagged: 0, perfect: 0, pieces: 0, piecesRight: 0, right: 0, squares: 0, wrong: 0 };
  for (const book of loadBooks(extra)) {
    const pages = await pagesOf(work, book);
    const sum = { boards: 0, flagged: 0, perfect: 0, pieces: 0, piecesRight: 0, right: 0, squares: 0, wrong: 0 };
    for (const [name, placement] of Object.entries(book.boards)) {
      const image = pages.get(pageOf(name)) as GrayImage;
      const board = detectDiagramBoards(image)[indexOf(name)];
      const want = expand(placement);
      sum.boards += 1;
      sum.squares += 64;
      if (!board) {
        for (const c of want) if (c !== ".") sum.pieces += 1;
        sum.wrong += 64;
        console.log(`  ${book.id} ${name}: board not found`);
        continue;
      }
      const reading = recognizeDiagramBoard(image, board.rect);
      const got = expand(diagramGridToPlacement(reading.grid, "white"));
      let bad = 0;
      for (let i = 0; i < 64; i += 1) {
        if (want[i] !== ".") sum.pieces += 1;
        if (got[i] === want[i]) {
          sum.right += 1;
          if (want[i] !== ".") sum.piecesRight += 1;
        } else {
          bad += 1;
          sum.wrong += 1;
          if (reading.squares[i].confidence < DIAGRAM_LOW_CONFIDENCE) sum.flagged += 1;
        }
      }
      if (bad === 0) sum.perfect += 1;
    }
    report(book.id, sum);
    // Printed arrows and lines: found on these boards, and not on the ordinary ones.
    let marked = 0;
    for (const name of book.annotated ?? []) {
      const image = pages.get(pageOf(name)) as GrayImage;
      const board = detectDiagramBoards(image)[indexOf(name)];
      if (board && recognizeDiagramBoard(image, board.rect).annotated) marked += 1;
    }
    let falseAlarms = 0;
    for (const name of Object.keys(book.boards)) {
      const image = pages.get(pageOf(name)) as GrayImage;
      const board = detectDiagramBoards(image)[indexOf(name)];
      if (board && recognizeDiagramBoard(image, board.rect).annotated) falseAlarms += 1;
    }
    console.log(`  annotated: ${marked}/${(book.annotated ?? []).length} found, ${falseAlarms}/${Object.keys(book.boards).length} false alarms`);
    for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += sum[key];
  }
  report("ALL", total);
}

function report(name: string, s: { boards: number; flagged: number; perfect: number; pieces: number; piecesRight: number; right: number; squares: number; wrong: number }) {
  const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
  console.log(
    `${name.slice(0, 26).padEnd(27)} boards ${s.boards}  squares ${pct(s.right, s.squares)}  pieces ${pct(s.piecesRight, s.pieces)}  perfect ${s.perfect}/${s.boards}  misreads ${s.wrong} (${s.flagged} flagged)`,
  );
}

async function exportSquares(work: string, out: string, extra?: string) {
  mkdirSync(out, { recursive: true });
  for (const book of loadBooks(extra)) {
    const pages = await pagesOf(work, book);
    const chunks: Buffer[] = [];
    const names: string[] = [];
    let labels = "";
    for (const [name, placement] of Object.entries(book.boards)) {
      const image = pages.get(pageOf(name)) as GrayImage;
      const board = detectDiagramBoards(image)[indexOf(name)];
      if (!board) throw new Error(`${book.id} ${name}: board not found`);
      for (const patch of sampleDiagramSquares(image, board.rect)) chunks.push(Buffer.from(patch.buffer, patch.byteOffset, patch.byteLength));
      labels += expand(placement);
      names.push(name);
    }
    writeFileSync(join(out, `${book.id}.bin`), Buffer.concat(chunks));
    writeFileSync(join(out, `${book.id}.json`), JSON.stringify({ labels, names, size: DIAGRAM_SQUARE_SIZE }));
    console.log(`${book.id}: ${names.length} boards`);
  }
}

const [command, work, a, b] = process.argv.slice(2);
if (command === "measure" && work) await measure(work, a);
else if (command === "export" && work && a) await exportSquares(work, a, b);
else throw new Error("usage: real-books.ts measure <work-dir> [extra] | export <work-dir> <out-dir> [extra]");
