// Regenerates packages/types/src/diagram-piece-templates.ts — the silhouette
// templates the PDF diagram recognizer matches pieces against.
//
//   npx ts-node --transpile-only -O '{"module":"commonjs"}' scripts/diagram-import/generate-piece-templates.ts
//
// For every vendored piece set (apps/web/public/chess/pieces/<set>, all
// licensed for commercial use — see LICENSES.md there) headless Chromium draws
// plain light/gray boards at two square sizes, and the recognizer's own
// extractDiagramSquareFeatures measures each piece. Templates therefore share
// every sampling and cropping quirk of a real reading. Deterministic, so the
// output is committed. Templates are built on plain boards only; the hatched
// and noisy fixtures the spec reads are never seen here.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  detectDiagramBoards,
  extractDiagramSquareFeatures,
  type GrayImage,
} from "../../packages/types/src/diagram-recognition";
import { DIAGRAM_TEMPLATE_SIZE } from "../../packages/types/src/diagram-piece-templates";

const ROOT = join(__dirname, "../..");
const PIECE_DIR = join(ROOT, "apps/web/public/chess/pieces");
const OUT = join(ROOT, "packages/types/src/diagram-piece-templates.ts");
export const TEMPLATE_SETS = ["classic", "tournament", "modern", "minimal", "wooden", "bold"];
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
// Every piece one file to the right, so each one also lands on the other shade.
const SHIFTED = "1rnbqkbn/1ppppppp/8/8/8/8/1PPPPPPP/1RNBQKBN";
const SIZES = [30, 44];

function rows(placement: string): (string | null)[][] {
  return placement.split("/").map((r) => {
    const out: (string | null)[] = [];
    for (const ch of r) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i += 1) out.push(null);
      else out.push(ch);
    }
    return out;
  });
}

function boardHtml(set: string, placement: string, cell: number): string {
  const grid = rows(placement);
  const parts: string[] = [];
  for (let r = 0; r < 8; r += 1) {
    for (let f = 0; f < 8; f += 1) {
      parts.push(`<rect x="${f * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${(r + f) % 2 ? "#b8b8b8" : "#ffffff"}"/>`);
      const p = grid[r][f];
      if (p) {
        const file = `${p === p.toUpperCase() ? "w" : "b"}${p.toUpperCase()}.svg`;
        const uri = `data:image/svg+xml;base64,${readFileSync(join(PIECE_DIR, set, file)).toString("base64")}`;
        parts.push(`<image x="${f * cell}" y="${r * cell}" width="${cell}" height="${cell}" href="${uri}"/>`);
      }
    }
  }
  const size = cell * 8;
  return `<!doctype html><html><body style="margin:24px;background:#fff"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${parts.join("")}</svg></body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 420 } });
  type Entry = { set: string; piece: string; key: string; mask: string; aspect: number; relHeight: number };
  const entries: Entry[] = [];
  for (const set of TEMPLATE_SETS) {
    for (const cell of SIZES) {
      for (const placement of [START, SHIFTED]) {
        await page.setContent(boardHtml(set, placement, cell), { waitUntil: "load" });
        const shot = await page.screenshot();
        const gray = await page.evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d") as CanvasRenderingContext2D;
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          const out: number[] = [];
          for (let i = 0; i < d.length; i += 4) out.push(Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]));
          return { w: c.width, h: c.height, out };
        }, shot.toString("base64"));
        const img: GrayImage = { width: gray.w, height: gray.h, data: Uint8Array.from(gray.out) };
        const [board] = detectDiagramBoards(img);
        if (!board) throw new Error(`no board found for ${set} @${cell}px`);
        const grid = rows(placement);
        for (const f of extractDiagramSquareFeatures(img, board.rect)) {
          const piece = grid[f.row][f.col];
          if (!piece) continue;
          if (!f.shape) throw new Error(`${set} @${cell}px: ${piece} at ${f.row},${f.col} read as empty`);
          entries.push({
            set,
            piece,
            key: `${set}/${piece}/${cell}/${f.light ? "l" : "d"}`,
            mask: f.shape.mask,
            aspect: f.shape.aspect,
            relHeight: f.shape.relHeight,
          });
        }
      }
    }
  }
  await browser.close();

  // One exemplar per (set, piece, square size, square shade).
  const seen = new Set<string>();
  const unique = entries.filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)));
  const body = unique
    .map(
      (t) =>
        `  { set: "${t.set}", piece: "${t.piece}", aspect: ${t.aspect.toFixed(3)}, relHeight: ${t.relHeight.toFixed(3)}, mask: "${t.mask}" },`,
    )
    .join("\n");
  writeFileSync(
    OUT,
    `// GENERATED by scripts/diagram-import/generate-piece-templates.ts — do not edit.
// Silhouettes of the vendored piece sets (apps/web/public/chess/pieces, see
// LICENSES.md there) as measured by extractDiagramSquareFeatures on plain
// boards: one exemplar per set × piece × square size × square shade. Each mask
// is the silhouette's bounding box resampled to ${DIAGRAM_TEMPLATE_SIZE}×${DIAGRAM_TEMPLATE_SIZE} bits
// (hex, row-major, most significant bit first).

export const DIAGRAM_TEMPLATE_SIZE = ${DIAGRAM_TEMPLATE_SIZE};

export type DiagramPieceTemplate = {
  set: string;
  /** FEN letter: upper case = white. */
  piece: string;
  /** Bounding-box width / height. */
  aspect: number;
  /** Bounding-box height / square size. */
  relHeight: number;
  mask: string;
};

export const DIAGRAM_PIECE_TEMPLATES: readonly DiagramPieceTemplate[] = [
${body}
];
`,
  );
  console.log(`wrote ${unique.length} templates to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
