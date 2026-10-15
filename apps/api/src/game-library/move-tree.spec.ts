import {
  addMoveToTree,
  createMoveTree,
  deleteFromPath,
  fenAtPath,
  lineThroughPath,
  mainlineNodes,
  moveNumberLabel,
  moveTreeHasVariations,
  moveTreeToPgn,
  parsePgnToMoveTree,
  PgnParseError,
  promoteToMainline,
  promoteVariationOneLevel,
  setMoveComment,
  STANDARD_START_FEN,
  type MoveTree,
  type MoveTreePath,
} from "@nexa-chess/types";
import { Chess } from "../common/chess/chess";
import { createMoveTreeChess } from "../common/chess/move-tree-chess";

/** Plays SAN moves from `path` on `tree`, validating with chess.js. */
function play(tree: MoveTree, path: MoveTreePath, sans: string[]) {
  let current = { tree, path };
  for (const san of sans) {
    const chess = new Chess(fenAtPath(current.tree, current.path));
    const move = chess.move(san);
    const next = addMoveToTree(current.tree, current.path, {
      fen: chess.fen(),
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    });
    current = { tree: next.tree, path: next.path };
  }
  return current;
}

const sans = (tree: MoveTree, path: MoveTreePath = []) => lineThroughPath(tree, path).nodes.map((n) => n.san);

describe("move tree", () => {
  const ruyLopez = () => play(createMoveTree(), [], ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);

  it("keeps the mainline when an alternative is played mid-game", () => {
    const main = ruyLopez();
    const variation = play(main.tree, [0, 0, 0, 0, 0], ["Nf6"]);

    expect(sans(variation.tree)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
    expect(sans(variation.tree, variation.path)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6"]);
    expect(variation.path).toEqual([0, 0, 0, 0, 0, 1]);
    // The original tree object is untouched (copy-on-write).
    expect(moveTreeHasVariations(main.tree)).toBe(false);
    expect(moveTreeHasVariations(variation.tree)).toBe(true);
  });

  it("supports several alternatives at one position and nested sub-variations", () => {
    const main = ruyLopez();
    const v1 = play(main.tree, [0, 0, 0, 0, 0], ["Nf6", "O-O"]);
    const v2 = play(v1.tree, [0, 0, 0, 0, 0], ["d6"]);
    // A sub-variation inside variation 1: 4.d3 instead of 4.O-O
    const nested = play(v2.tree, [0, 0, 0, 0, 0, 1], ["d3"]);

    const atBranch = lineThroughPath(nested.tree, [0, 0, 0, 0, 0]).nodes[4];
    expect(atBranch.children.map((n) => n.san)).toEqual(["a6", "Nf6", "d6"]);
    expect(atBranch.children[1].children.map((n) => n.san)).toEqual(["O-O", "d3"]);
    expect(sans(nested.tree, nested.path)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6", "d3"]);
    expect(sans(nested.tree)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  });

  it("re-playing an existing move navigates instead of duplicating it", () => {
    const main = ruyLopez();
    const again = play(main.tree, [0, 0, 0, 0, 0], ["a6"]);
    expect(again.tree).toBe(main.tree);
    expect(again.path).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("computes the right position (side to move, castling, en passant) on every branch", () => {
    const main = play(createMoveTree(), [], ["e4", "d5", "e5", "f5"]);
    // After 3...f5 white may capture en passant on f6.
    expect(fenAtPath(main.tree, main.path)).toBe("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
    const alt = play(main.tree, [0, 0, 0], ["Kd7"]);
    expect(fenAtPath(alt.tree, alt.path)).toBe("rnbq1bnr/pppkpppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQ - 1 3");
  });

  it("promotes a variation to mainline only when asked, keeping the old mainline", () => {
    const main = ruyLopez();
    const variation = play(main.tree, [0, 0, 0, 0, 0], ["Nf6", "O-O"]);
    const withNested = play(variation.tree, [0, 0, 0, 0, 0, 0], ["Ba4"]);
    const commented = setMoveComment(withNested.tree, [0, 0, 0, 0, 0, 1], "Berlin");

    const promoted = promoteToMainline(commented, [0, 0, 0, 0, 0, 1, 0]);
    expect(promoted.path).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(sans(promoted.tree)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6", "O-O"]);
    const branch = lineThroughPath(promoted.tree, [0, 0, 0, 0, 0]).nodes[4];
    expect(branch.children.map((n) => n.san)).toEqual(["Nf6", "a6"]);
    // Former mainline and its nested variation survive intact.
    expect(branch.children[1].children.map((n) => n.san)).toEqual(["Ba4"]);
    expect(branch.children[0].comment).toBe("Berlin");
  });

  it("promotes one level at a time", () => {
    const main = ruyLopez();
    const v1 = play(main.tree, [0, 0, 0, 0, 0], ["Nf6"]);
    const v2 = play(v1.tree, [0, 0, 0, 0, 0], ["d6"]);
    const up = promoteVariationOneLevel(v2.tree, [0, 0, 0, 0, 0, 2]);
    expect(up.path).toEqual([0, 0, 0, 0, 0, 1]);
    expect(lineThroughPath(up.tree, [0, 0, 0, 0, 0]).nodes[4].children.map((n) => n.san)).toEqual(["a6", "d6", "Nf6"]);
  });

  it("deletes a variation without touching the mainline", () => {
    const v = play(ruyLopez().tree, [0, 0, 0, 0, 0], ["Nf6"]);
    const removed = deleteFromPath(v.tree, v.path);
    expect(moveTreeHasVariations(removed.tree)).toBe(false);
    expect(sans(removed.tree)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  });

  it("labels move numbers from any starting position", () => {
    expect(moveNumberLabel(STANDARD_START_FEN, 0)).toBe("1.");
    expect(moveNumberLabel(STANDARD_START_FEN, 1)).toBe("1...");
    expect(moveNumberLabel("8/8/8/8/8/8/k7/K7 b - - 0 40", 0)).toBe("40...");
    expect(moveNumberLabel("8/8/8/8/8/8/k7/K7 b - - 0 40", 1)).toBe("41.");
  });
});

describe("PGN with variations", () => {
  it("exports variations with correct numbering and round-trips them", () => {
    const main = play(createMoveTree(), [], ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
    const black = play(main.tree, [0, 0, 0, 0, 0], ["Nf6", "O-O"]);
    const white = play(black.tree, [0, 0, 0, 0], ["Bc4", "Bc5"]);
    const nested = play(white.tree, [0, 0, 0, 0, 0, 1], ["d3"]);
    const tree = setMoveComment(nested.tree, [0, 0, 0, 0, 0, 1], "Berlin");

    const pgn = moveTreeToPgn(tree, { Event: "Class", Result: "*" });
    expect(pgn).toContain('[Event "Class"]');
    expect(pgn).toContain(
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) 3... a6 (3... Nf6 {Berlin} 4. O-O (4. d3)) *",
    );

    const parsed = parsePgnToMoveTree(pgn, createMoveTreeChess);
    expect(moveTreeToPgn(parsed.tree, parsed.headers)).toBe(pgn);
    expect(parsed.result).toBe("*");
  });

  it("parses comments, NAG symbols, numbered black moves and a FEN start", () => {
    const pgn = [
      '[Event "Endgame"]',
      '[SetUp "1"]',
      '[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 40"]',
      '[Result "1-0"]',
      "",
      "{Start} 40... Kd7!? 41. e4 (41. Kd2 $2 {slow}) 41... Ke6 1-0",
    ].join("\n");
    const { tree, result, headers } = parsePgnToMoveTree(pgn, createMoveTreeChess);
    expect(result).toBe("1-0");
    expect(headers.Event).toBe("Endgame");
    expect(tree.rootComment).toBe("Start");
    expect(mainlineNodes(tree).map((n) => n.san)).toEqual(["Kd7", "e4", "Ke6"]);
    expect(tree.children[0].nags).toEqual([5]);
    const alt = tree.children[0].children[1];
    expect(alt.san).toBe("Kd2");
    expect(alt.nags).toEqual([2]);
    expect(alt.comment).toBe("slow");
    expect(moveTreeToPgn(tree, headers)).toContain("40... Kd7 $5 41. e4 (41. Kd2 $2 {slow}) 41... Ke6 1-0");
  });

  it("accepts 0-0 castling and moves glued to their numbers", () => {
    const { tree } = parsePgnToMoveTree("1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.0-0 *", createMoveTreeChess);
    expect(mainlineNodes(tree).map((n) => n.san).pop()).toBe("O-O");
  });

  it("rejects an illegal move with a readable message", () => {
    expect(() => parsePgnToMoveTree("1. e4 e5 2. Ke3 *", createMoveTreeChess)).toThrow(PgnParseError);
    expect(() => parsePgnToMoveTree("1. e4 e5 2. Ke3 *", createMoveTreeChess)).toThrow(/Illegal move "Ke3" at 2\./);
  });

  it("rejects unbalanced variations", () => {
    expect(() => parsePgnToMoveTree("1. e4 (1. d4 e5 *", createMoveTreeChess)).toThrow(/never closed/);
    expect(() => parsePgnToMoveTree("1. e4 ) e5 *", createMoveTreeChess)).toThrow(/Unmatched/);
  });

  it("reads only the first game of a multi-game file", () => {
    const pgn = '[Event "A"]\n\n1. e4 e5 1-0\n\n[Event "B"]\n\n1. d4 d5 0-1\n';
    const parsed = parsePgnToMoveTree(pgn, createMoveTreeChess);
    expect(parsed.headers.Event).toBe("A");
    expect(mainlineNodes(parsed.tree).map((n) => n.san)).toEqual(["e4", "e5"]);
    expect(parsed.result).toBe("1-0");
  });
});
