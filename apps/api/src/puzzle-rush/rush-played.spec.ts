import type { PuzzleRushPuzzle } from "@nexa-chess/types";
import { mergeRushPlayed, rebuildRushLine } from "./rush-played";

// Setup 1...e5, then the player: 2.Qh5 (expected) Nc6 (reply) 3.Qxf7?? (expected Bc4)…
// A tiny made-up "puzzle" is enough: the rules are the client's (expected move, or any mate).
const puzzle: PuzzleRushPuzzle = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  id: "p1",
  moves: ["e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"],
  rating: 900
};

describe("rebuildRushLine", () => {
  it("replays setup, the player's moves and the puzzle's replies, and solves on the last move", () => {
    const rebuilt = rebuildRushLine(puzzle, [{ uci: "d1h5" }, { uci: "f1c4" }, { uci: "h5f7" }]);
    expect(rebuilt?.solved).toBe(true);
    expect(rebuilt?.line.map((m) => `${m.by}:${m.uci}`)).toEqual([
      "SETUP:e7e5",
      "STUDENT:d1h5",
      "REPLY:b8c6",
      "STUDENT:f1c4",
      "REPLY:g8f6",
      "STUDENT:h5f7"
    ]);
  });

  it("ends a failed puzzle on the wrong move, with no reply after it", () => {
    const rebuilt = rebuildRushLine(puzzle, [{ uci: "d1h5" }, { uci: "h5f7" }, { uci: "e1e2" }]);
    expect(rebuilt?.solved).toBe(false);
    expect(rebuilt?.line.slice(-1)[0]).toMatchObject({ by: "STUDENT", correct: false, uci: "h5f7" });
    expect(rebuilt?.line).toHaveLength(4);
  });

  it("accepts a skip only for the expected move", () => {
    expect(rebuildRushLine(puzzle, [{ skipped: true, uci: "d1h5" }])?.line[1]).toMatchObject({ by: "SKIP", correct: true });
    expect(rebuildRushLine(puzzle, [{ skipped: true, uci: "g1f3" }])?.line).toHaveLength(1);
  });

  it("refuses an illegal move instead of recording it", () => {
    expect(rebuildRushLine(puzzle, [{ uci: "a1a8" }])?.line).toHaveLength(1);
  });
});

describe("mergeRushPlayed", () => {
  const puzzles = [puzzle, { ...puzzle, id: "p2" }];

  it("adds only finished puzzles of this run, never rewriting one already stored", () => {
    const first = mergeRushPlayed([], [{ i: 0, moves: [{ uci: "d1h5" }], solved: false }], puzzles, 1);
    expect(first?.map((r) => r.puzzleId)).toEqual(["p1"]);

    // i = 0 again with other moves is ignored; i = 1 isn't finished yet (index 1).
    expect(mergeRushPlayed(first as never, [{ i: 0, moves: [{ uci: "g1f3" }], solved: false }, { i: 1, moves: [{ uci: "d1h5" }], solved: true }], puzzles, 1)).toBeNull();

    const second = mergeRushPlayed(first as never, [{ i: 1, moves: [{ uci: "d1h5" }], solved: true }], puzzles, 2);
    expect(second?.map((r) => r.i)).toEqual([0, 1]);
    expect(second?.[0].line[1].uci).toBe("d1h5");
  });

  it("ignores an index outside the run and an entry with no move", () => {
    expect(mergeRushPlayed([], [{ i: 5, moves: [{ uci: "d1h5" }], solved: true }], puzzles, 10)).toBeNull();
    expect(mergeRushPlayed([], [{ i: 0, moves: [], solved: false }], puzzles, 1)).toBeNull();
    expect(mergeRushPlayed([], undefined, puzzles, 1)).toBeNull();
  });

  it("takes the server's verdict, not the client's", () => {
    const merged = mergeRushPlayed([], [{ i: 0, moves: [{ uci: "d1h5" }, { uci: "f1c4" }, { uci: "h5f7" }], solved: false }], puzzles, 1);
    expect(merged?.[0].solved).toBe(true);
  });
});
