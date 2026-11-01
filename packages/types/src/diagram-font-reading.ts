// Some digital books set diagrams in a chess font: the "pieces" are letters in the
// PDF's text layer, so they can be read exactly instead of from pixels. Fonts in the
// widespread Alpha/Merida/Leipzig family share one mapping; a font with another one
// reads as nonsense here, which is why the caller only trusts this reading when it
// matches what the classifier saw on the page.

import type { DiagramRect, DiagramTextItem } from "./diagram-recognition";

/** Glyph → piece. Lower case is a piece on a light square, upper case on a dark one. */
const FONT_PIECES: Record<string, string> = {
  B: "B",
  K: "K",
  L: "k",
  M: "n",
  N: "N",
  O: "p",
  P: "P",
  Q: "Q",
  R: "R",
  T: "r",
  V: "b",
  W: "q",
  b: "B",
  k: "K",
  l: "k",
  m: "n",
  n: "N",
  o: "p",
  p: "P",
  q: "Q",
  r: "R",
  t: "r",
  v: "b",
  w: "q",
};
/** Empty squares in these fonts: a blank light square and a hatched dark one. */
const FONT_EMPTY = new Set([" ", "+", "*", "/", ".", "#", "x", "X", "_"]);
/** A diagram has a glyph on nearly every square; caption text near it doesn't. */
const MIN_SQUARES_READ = 56;
const MIN_AGREEMENT = 0.9;

/** The printed grid from a chess font's letters, or null when these aren't one. */
export function readChessFontBoard(items: DiagramTextItem[], rect: DiagramRect): (string | null)[][] | null {
  const cw = rect.w / 8;
  const ch = rect.h / 8;
  const grid: (string | null)[][] = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
  const seen = new Set<number>();
  for (const item of items) {
    if (item.y <= rect.y || item.y >= rect.y + rect.h) continue;
    const chars = [...item.text];
    const width = item.width ?? 0;
    const step = chars.length > 0 ? width / chars.length : 0;
    const left = item.x - width / 2;
    for (let i = 0; i < chars.length; i += 1) {
      const x = left + step * (i + 0.5);
      if (x <= rect.x || x >= rect.x + rect.w) continue;
      const row = Math.floor((item.y - rect.y) / ch);
      const col = Math.floor((x - rect.x) / cw);
      const char = chars[i];
      if (char in FONT_PIECES) grid[row][col] = FONT_PIECES[char];
      else if (!FONT_EMPTY.has(char)) return null;
      seen.add(row * 8 + col);
    }
  }
  return seen.size >= MIN_SQUARES_READ ? grid : null;
}

/** Whether a font reading and the image reading describe the same board. */
export function fontReadingAgrees(font: (string | null)[][], image: (string | null)[][]): boolean {
  let same = 0;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (font[r][c] === image[r][c]) same += 1;
    }
  }
  return same / 64 >= MIN_AGREEMENT;
}
