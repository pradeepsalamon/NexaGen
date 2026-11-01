#!/usr/bin/env node
// Writes to e2e/fixtures/diagram-import: board-screenshot.png, a screenshot-style
// picture of a board on a coloured theme, with a caption and moves printed under it, so
// the image path, OCR and the suggested solution all have something to read; and
// board-annotated.png, the same picture with a line drawn across the board.
//
//   node scripts/diagram-import/generate-image-fixture.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = new URL("../../", import.meta.url).pathname;
const sharp = createRequire(join(root, "package.json"))("sharp");

const PLACEMENT = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PP1/R1BQK2R";
const CELL = 50;
const MARGIN = 60;
const pieces = { b: "bB", B: "wB", k: "bK", K: "wK", n: "bN", N: "wN", p: "bP", P: "wP", q: "bQ", Q: "wQ", r: "bR", R: "wR" };
const squares = PLACEMENT.split("/").map((rank) => rank.replace(/\d/g, (n) => ".".repeat(Number(n))));
const layers = [];
for (let r = 0; r < 8; r += 1) {
  for (let c = 0; c < 8; c += 1) {
    layers.push({
      input: { create: { background: (r + c) % 2 ? "#8ca2ad" : "#dee3e6", channels: 4, height: CELL, width: CELL } },
      left: MARGIN + c * CELL,
      top: MARGIN + r * CELL,
    });
    const piece = squares[r][c];
    if (piece === ".") continue;
    const svg = readFileSync(join(root, "apps/web/public/chess/pieces/classic", `${pieces[piece]}.svg`));
    layers.push({ input: await sharp(svg, { density: 300 }).resize(CELL, CELL).png().toBuffer(), left: MARGIN + c * CELL, top: MARGIN + r * CELL });
  }
}
const width = CELL * 8 + MARGIN * 2;
const height = CELL * 8 + MARGIN + 90;
const caption = `<svg width="${width}" height="90"><text x="${width / 2}" y="30" font-family="serif" font-size="22" text-anchor="middle">White to move</text><text x="${width / 2}" y="66" font-family="serif" font-size="22" text-anchor="middle">1. d3 d6 2. Bg5</text></svg>`;
layers.push({ input: Buffer.from(caption), left: 0, top: MARGIN + CELL * 8 });
const out = join(root, "e2e/fixtures/diagram-import");
const picture = await sharp({ create: { background: "#ffffff", channels: 4, height, width } })
  .composite(layers)
  .png()
  .toBuffer();
await sharp(picture).toFile(join(out, "board-screenshot.png"));
// Along the fifth rank, whose light squares are empty, with a slight slope like a hand-drawn arrow.
const y = MARGIN + CELL * 3.3;
const line = `<svg width="${width}" height="${height}"><line x1="${MARGIN}" y1="${y}" x2="${MARGIN + CELL * 8}" y2="${y + 16}" stroke="#000" stroke-width="2"/></svg>`;
await sharp(picture)
  .composite([{ input: Buffer.from(line), left: 0, top: 0 }])
  .toFile(join(out, "board-annotated.png"));
console.log("board-screenshot.png, board-annotated.png");
