// Piece images for train-square-classifier.py's synthetic squares, 64×64 RGBA, one
// row of 12 per set, in the order below.
//
//   node scripts/diagram-import/export-piece-images.mjs <data-dir>
//
// Only the vendored sets (apps/web/public/chess/pieces/LICENSES.md), whose licences
// allow use in a paid product. Never add Lichess's CC BY-NC-SA sets. Adding six more
// permissive sets and free fonts' chess glyphs was tried and read no better.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const sharp = createRequire(join(root, "package.json"))("sharp");

const [out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const PIECES = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"];
const SETS = ["classic", "tournament", "modern", "minimal", "wooden", "bold"];

const rows = [];
for (const set of SETS) {
  const dir = join(root, "apps/web/public/chess/pieces", set);
  for (const piece of PIECES) {
    const svg = readFileSync(join(dir, readdirSync(dir).find((f) => f.startsWith(piece))));
    rows.push(await sharp(svg, { density: 300 }).resize(64, 64, { background: { alpha: 0, b: 0, g: 0, r: 0 }, fit: "contain" }).ensureAlpha().raw().toBuffer());
  }
}
writeFileSync(join(out, "pieces.bin"), Buffer.concat(rows));
console.log(`${rows.length / 12} sets`);
