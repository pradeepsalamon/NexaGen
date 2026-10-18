import {
  comboBonus,
  PUZZLE_RACER_CONFIG,
  PUZZLE_STORM_CONFIG,
  type PuzzleRushMode,
  type PuzzleRushPuzzle,
  type PuzzleRushStanding,
} from "@nexa-chess/types";
import { Chess } from "@/lib/chess";

// ──────────────────────────────────────────────────────────────
// One player's Storm / Racer run, as Lichess plays it. Pure: the component
// owns the clock and feeds moves in.
//  - A puzzle opens with the opponent's setup move (moves[0]) already played.
//  - The expected move — or any move that mates — is correct: combo +1, and
//    the opponent's reply is played at once. The last move solves the puzzle.
//  - Any other move fails the puzzle: combo 0 and on to the next one
//    (Storm also takes 10 seconds off the clock).
//  - Combo levels add seconds (Storm) or points (Racer).
//  - Racer: once per race, Skip plays the expected move for you and keeps the combo.
// ──────────────────────────────────────────────────────────────

export type RushFeedback = { id: number; kind: "good" | "bad" | "bonus"; text: string };

export type RushResult = { puzzleId: string; rating: number; solved: boolean };

export type RushRun = {
  mode: PuzzleRushMode;
  puzzleIndex: number;
  /** Index into the current puzzle's moves of the next move to play. */
  ply: number;
  fen: string;
  lastMove: [string, string] | null;
  /** The side the player moves in this puzzle. */
  color: "white" | "black";
  combo: number;
  bestCombo: number;
  /** Correct moves played. */
  moves: number;
  errors: number;
  solved: number;
  /** Racer points (moves + combo bonus). Storm's score is `solved`. */
  points: number;
  highestRating: number | null;
  skipsUsed: number;
  /** Storm: seconds added (combo) minus seconds lost (mistakes) so far. */
  clockAdjustSeconds: number;
  results: RushResult[];
  feedback: RushFeedback | null;
  /** Ran out of puzzles. */
  exhausted: boolean;
};

let feedbackId = 0;
const feedback = (kind: RushFeedback["kind"], text: string): RushFeedback => ({ id: ++feedbackId, kind, text });

const square = (uci: string) => [uci.slice(0, 2), uci.slice(2, 4)] as [string, string];

function playUci(chess: Chess, uci: string): boolean {
  try {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    return true;
  } catch {
    return false;
  }
}

/** The run positioned at puzzle `index`, its setup move played. */
function openPuzzle(run: RushRun, puzzles: PuzzleRushPuzzle[], index: number): RushRun {
  const puzzle = puzzles[index];
  if (!puzzle) return { ...run, exhausted: true, puzzleIndex: Math.min(index, puzzles.length) };
  const chess = new Chess(puzzle.fen);
  const setup = puzzle.moves[0];
  playUci(chess, setup);
  return {
    ...run,
    color: chess.turn() === "w" ? "white" : "black",
    fen: chess.fen(),
    lastMove: square(setup),
    ply: 1,
    puzzleIndex: index,
  };
}

export function createRushRun(
  mode: PuzzleRushMode,
  puzzles: PuzzleRushPuzzle[],
  resume?: PuzzleRushStanding | null,
): RushRun {
  const base: RushRun = {
    bestCombo: resume?.bestCombo ?? 0,
    clockAdjustSeconds: 0,
    color: "white",
    combo: 0,
    errors: resume?.errors ?? 0,
    exhausted: false,
    feedback: null,
    fen: "",
    highestRating: resume?.highestRating ?? null,
    lastMove: null,
    mode,
    moves: resume?.moves ?? 0,
    ply: 0,
    points: resume?.score ?? 0,
    puzzleIndex: 0,
    results: [],
    skipsUsed: resume?.skipsUsed ?? 0,
    solved: resume?.solved ?? 0,
  };
  return openPuzzle(base, puzzles, resume?.puzzleIndex ?? 0);
}

const levelsOf = (mode: PuzzleRushMode) => (mode === "STORM" ? PUZZLE_STORM_CONFIG.combo : PUZZLE_RACER_CONFIG.combo);

/** A correct move (played or skipped-to): advance, reply, or finish the puzzle. */
function advance(run: RushRun, puzzles: PuzzleRushPuzzle[], chess: Chess, played: string, mated: boolean): RushRun {
  const puzzle = puzzles[run.puzzleIndex];
  let next: RushRun = { ...run, fen: chess.fen(), lastMove: square(played), ply: run.ply + 1 };
  if (mated || next.ply >= puzzle.moves.length) {
    next = {
      ...next,
      highestRating: Math.max(next.highestRating ?? 0, puzzle.rating),
      results: [...next.results, { puzzleId: puzzle.id, rating: puzzle.rating, solved: true }],
      solved: next.solved + 1,
    };
    return openPuzzle(next, puzzles, run.puzzleIndex + 1);
  }
  const reply = puzzle.moves[next.ply];
  playUci(chess, reply);
  return { ...next, fen: chess.fen(), lastMove: square(reply), ply: next.ply + 1 };
}

export function playRushMove(run: RushRun, puzzles: PuzzleRushPuzzle[], uci: string): RushRun {
  const puzzle = puzzles[run.puzzleIndex];
  if (!puzzle || run.exhausted) return run;
  const expected = puzzle.moves[run.ply];
  const chess = new Chess(run.fen);
  if (!playUci(chess, uci)) return run;
  const mated = chess.isCheckmate();

  if (uci === expected || mated) {
    const combo = run.combo + 1;
    const bonus = comboBonus(levelsOf(run.mode), combo);
    const scored: RushRun = {
      ...run,
      bestCombo: Math.max(run.bestCombo, combo),
      clockAdjustSeconds: run.clockAdjustSeconds + (run.mode === "STORM" ? bonus : 0),
      combo,
      feedback: bonus ? feedback("bonus", run.mode === "STORM" ? `+${bonus}s` : `+${bonus}`) : feedback("good", "✓"),
      moves: run.moves + 1,
      points: run.points + (run.mode === "RACER" ? 1 + bonus : 0),
    };
    return advance(scored, puzzles, chess, uci, mated);
  }

  const failed: RushRun = {
    ...run,
    clockAdjustSeconds: run.clockAdjustSeconds - (run.mode === "STORM" ? PUZZLE_STORM_CONFIG.malusSeconds : 0),
    combo: 0,
    errors: run.errors + 1,
    feedback: feedback("bad", run.mode === "STORM" ? `-${PUZZLE_STORM_CONFIG.malusSeconds}s` : "✗"),
    results: [...run.results, { puzzleId: puzzle.id, rating: puzzle.rating, solved: false }],
  };
  return openPuzzle(failed, puzzles, run.puzzleIndex + 1);
}

/** Racer: play the expected move for the player, keeping the combo (no point). */
export function skipRushMove(run: RushRun, puzzles: PuzzleRushPuzzle[]): RushRun {
  const puzzle = puzzles[run.puzzleIndex];
  if (!puzzle || run.exhausted || run.mode !== "RACER" || run.skipsUsed >= PUZZLE_RACER_CONFIG.skips) return run;
  const chess = new Chess(run.fen);
  const expected = puzzle.moves[run.ply];
  if (!playUci(chess, expected)) return run;
  return advance({ ...run, feedback: feedback("good", "Skipped"), skipsUsed: run.skipsUsed + 1 }, puzzles, chess, expected, false);
}

/** The run's score as the leaderboard counts it. */
export const rushScore = (run: RushRun) => (run.mode === "STORM" ? run.solved : run.points);

/** Accuracy as Lichess shows it: correct moves over all moves tried. */
export function rushAccuracy(moves: number, errors: number): number {
  const tried = moves + errors;
  return tried === 0 ? 100 : Math.round((moves / tried) * 100);
}
