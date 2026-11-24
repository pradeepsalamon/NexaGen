import type { PuzzleRushPuzzle, RushPlayedPuzzle, RushPlayedRecord } from "@nexa-chess/types";
import type { Prisma } from "@prisma/client";
import { Chess } from "../common/chess/chess";

// ──────────────────────────────────────────────────────────────
// Each finished Storm / Racer puzzle's line, for the play feed
// (docs/AI_PLAY_REVIEW.md gap A). The client says which moves it tried in
// which puzzle; the server rebuilds the line from the run's OWN puzzle (its
// position, setup move and replies) with the same rules the client plays by
// (the expected move, or any mate, is correct; anything else ends the
// puzzle), so a report can't invent a position or a reply.
// ──────────────────────────────────────────────────────────────

function play(chess: Chess, uci: string): string | null {
  try {
    return chess.move({ from: uci.slice(0, 2), promotion: uci[4], to: uci.slice(2, 4) }).san;
  } catch {
    return null;
  }
}

/** The puzzle's line as played; null when not even the setup move plays. */
export function rebuildRushLine(puzzle: PuzzleRushPuzzle, tried: RushPlayedPuzzle["moves"]): Omit<RushPlayedRecord, "i"> | null {
  let chess: Chess;
  try {
    chess = new Chess(puzzle.fen);
  } catch {
    return null;
  }
  const setup = puzzle.moves[0];
  const setupSan = setup ? play(chess, setup) : null;
  if (!setup || !setupSan) return null;

  const line: RushPlayedRecord["line"] = [{ by: "SETUP", correct: null, san: setupSan, uci: setup }];
  let ply = 1;
  let solved = false;
  for (const move of tried) {
    const expected = puzzle.moves[ply];
    if (!expected) break;
    // A Racer skip plays the expected move for the player, nothing else.
    if (move.skipped && move.uci !== expected) break;
    const san = play(chess, move.uci);
    if (!san) break;
    const mated = chess.isCheckmate();
    const correct = move.uci === expected || mated;
    line.push({ by: move.skipped ? "SKIP" : "STUDENT", correct, san, uci: move.uci });
    if (!correct) break;
    ply += 1;
    if (mated || ply >= puzzle.moves.length) {
      solved = true;
      break;
    }
    const reply = puzzle.moves[ply];
    const replySan = play(chess, reply);
    if (!replySan) break;
    line.push({ by: "REPLY", correct: null, san: replySan, uci: reply });
    ply += 1;
  }
  return { fen: puzzle.fen, line, puzzleId: puzzle.id, rating: puzzle.rating, solved };
}

/** The stored records of a run / entry (`movesJson`), tolerant of old or odd rows. */
export function storedRushPlayed(json: Prisma.JsonValue | null | undefined): RushPlayedRecord[] {
  return Array.isArray(json)
    ? (json as unknown as RushPlayedRecord[]).filter((r) => !!r && typeof r === "object" && typeof r.i === "number" && Array.isArray(r.line))
    : []
}

/**
 * Add the reported puzzles the run hasn't recorded yet. Only puzzles before
 * `finishedBefore` (the clamped puzzle index: those are over) and inside the
 * run count; a puzzle already recorded is never rewritten. Null when nothing
 * is new, so the caller writes nothing.
 */
export function mergeRushPlayed(
  stored: Prisma.JsonValue | null | undefined,
  reported: RushPlayedPuzzle[] | undefined,
  puzzles: PuzzleRushPuzzle[],
  finishedBefore: number
): RushPlayedRecord[] | null {
  if (!reported?.length) return null;
  const records = storedRushPlayed(stored);
  const known = new Set(records.map((r) => r.i));
  let added = false;
  for (const entry of reported) {
    if (known.has(entry.i) || entry.i >= finishedBefore || entry.i >= puzzles.length || entry.moves.length === 0) continue;
    const rebuilt = rebuildRushLine(puzzles[entry.i], entry.moves);
    if (!rebuilt || !rebuilt.line.some((m) => m.by === "STUDENT")) continue;
    records.push({ i: entry.i, ...rebuilt });
    known.add(entry.i);
    added = true;
  }
  return added ? records.sort((a, b) => a.i - b.i) : null;
}
