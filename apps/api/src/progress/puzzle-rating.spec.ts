import {
  MIN_PUZZLE_RATING,
  nextPuzzleRating,
  PUZZLE_DIFFICULTY_RATINGS,
  puzzleOpponentRating,
  puzzleResultScore
} from "@nexa-chess/types";

// Spec §9 (docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md). Pure maths only —
// ProgressRecorderService still scores with the difficulty bucket and
// wrongMoves 0 until the switch-over (PR 5b).

describe("puzzleResultScore", () => {
  it.each([
    // solved, hintsUsed, wrongMoves, score
    [true, 0, 0, 1],
    [true, 1, 0, 0.5],
    [true, 3, 0, 0.5],
    [true, 0, 1, 0], // D1: a solve that needed a wrong move scores 0
    [true, 2, 4, 0],
    [false, 0, 0, 0],
    [false, 2, 3, 0]
  ])("solved=%s hints=%i wrong=%i scores %d", (solved, hints, wrong, score) => {
    expect(puzzleResultScore(solved, hints, wrong)).toBe(score);
  });
});

describe("puzzleOpponentRating", () => {
  it("uses the puzzle's own rating when it has one", () => {
    expect(puzzleOpponentRating({ difficulty: "EASY", rating: 1450 })).toBe(1450);
  });

  it.each([null, undefined])("falls back to the difficulty bucket for rating %s", (rating) => {
    expect(puzzleOpponentRating({ difficulty: "ADVANCED", rating })).toBe(PUZZLE_DIFFICULTY_RATINGS.ADVANCED);
  });
});

describe("nextPuzzleRating", () => {
  // The §9 worked example: a student rated 1200 with 30 rated puzzles (K = 20)
  // against a 1450 puzzle.
  it.each([
    ["clean", puzzleResultScore(true, 0, 0), 1216],
    ["with hints", puzzleResultScore(true, 1, 0), 1206],
    ["after a wrong move", puzzleResultScore(true, 0, 1), 1196],
    ["failed", puzzleResultScore(false, 0, 0), 1196]
  ])("worked example: %s", (_outcome, score, after) => {
    expect(nextPuzzleRating({ opponentRating: 1450, rating: 1200, ratedPuzzles: 30, score })).toBe(after);
  });

  it.each([
    // ratedPuzzles, K: an even match moves the rating by K / 2
    [0, 40],
    [19, 40],
    [20, 20],
    [500, 20]
  ])("ratedPuzzles=%i uses K=%i", (ratedPuzzles, k) => {
    const base = { opponentRating: 1500, rating: 1500, ratedPuzzles };
    expect(nextPuzzleRating({ ...base, score: 1 })).toBe(1500 + k / 2);
    expect(nextPuzzleRating({ ...base, score: 0 })).toBe(1500 - k / 2);
  });

  it.each([
    // rating, ratedPuzzles, opponentRating
    [100, 50, 100],
    [110, 0, 110],
    [115, 0, 115]
  ])("never drops below the floor (rating %i, %i rated, vs %i)", (rating, ratedPuzzles, opponentRating) => {
    expect(nextPuzzleRating({ opponentRating, rating, ratedPuzzles, score: 0 })).toBe(MIN_PUZZLE_RATING);
  });

  it.each([
    // rating, opponentRating, score, after — K = 20
    [800, 2800, 1, 820], // beating a far stronger puzzle earns the whole K
    [800, 2800, 0, 800], // failing it costs nothing
    [2800, 800, 0, 2780], // failing a far weaker puzzle costs the whole K
    [2800, 800, 1, 2800] // solving it earns nothing
  ])("large gap: %i vs %i scoring %d gives %i", (rating, opponentRating, score, after) => {
    expect(nextPuzzleRating({ opponentRating, rating, ratedPuzzles: 100, score })).toBe(after);
  });

  it("scores a null puzzle rating against its bucket", () => {
    const base = { rating: 1200, ratedPuzzles: 30, score: 1 };
    expect(
      nextPuzzleRating({ ...base, opponentRating: puzzleOpponentRating({ difficulty: "INTERMEDIATE", rating: null }) })
    ).toBe(nextPuzzleRating({ ...base, opponentRating: PUZZLE_DIFFICULTY_RATINGS.INTERMEDIATE }));
  });
});
