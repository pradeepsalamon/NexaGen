// ─────────────────────────────────────────────────────────────────────────────
// Server-authoritative two-player game rules — pure, no Prisma, no Nest.
//
// Extracted from `LiveClassMatchService` (Phase 0 of docs/TOURNAMENTS.md) so
// live-class matches and tournament games share one set of rules. Callers own
// persistence and the concurrency claim (`updateMany` on `ply` + status); this
// module only answers "what does the position / clock say".
//
// Clock model: each side's clock is "remaining ms at `turnSince`". The side to
// move loses wall-clock time from `turnSince`; nobody's clock runs before
// `clockStartPly` half-moves have been played, and the increment is only added
// to a move made at or after that ply.
// ─────────────────────────────────────────────────────────────────────────────
import type { MatchColor, MatchEndReason, MatchGameResult, MatchMove } from "@nexa-chess/types";
import { Chess } from "./chess";

export type GameOutcome = { result: MatchGameResult | null; endReason: MatchEndReason };

/** The fields of a stored game the clock rules read. */
export type GameClockState = {
  fen: string;
  ongoing: boolean;
  ply: number;
  turnSince: Date;
  whiteClockMs: number | null;
  blackClockMs: number | null;
};

const opposite = (color: MatchColor): MatchColor => (color === "white" ? "black" : "white");

const winFor = (color: MatchColor): MatchGameResult => (color === "white" ? "WHITE_WON" : "BLACK_WON");

/** Side to move, or null once the game is over. */
export function sideToMove(game: { fen: string; ongoing: boolean }): MatchColor | null {
  if (!game.ongoing) return null;
  return game.fen.split(" ")[1] === "b" ? "black" : "white";
}

/** Remaining ms for `color` right now, or null for an untimed game. */
export function remainingClockMs(
  game: GameClockState,
  color: MatchColor,
  now: Date,
  clockStartPly: number
): number | null {
  const base = color === "white" ? game.whiteClockMs : game.blackClockMs;
  if (base === null) return null;
  if (game.ply < clockStartPly || sideToMove(game) !== color) return base;
  return base - (now.getTime() - game.turnSince.getTime());
}

/**
 * The mover's clock after a move made with `remainingMs` left at ply `ply`
 * (before the move). Null for an untimed game.
 */
export function clockAfterMove(
  remainingMs: number | null,
  ply: number,
  incrementMs: number,
  clockStartPly: number
): number | null {
  if (remainingMs === null) return null;
  return remainingMs + (ply >= clockStartPly ? incrementMs : 0);
}

/** Whether `color` still has enough material to ever deliver mate. */
export function hasMatingMaterial(fen: string, color: MatchColor): boolean {
  const board = fen.split(" ")[0];
  const pieces = color === "white" ? board.replace(/[^A-Z]/g, "") : board.replace(/[^a-z]/g, "").toUpperCase();
  if (/[PRQ]/.test(pieces)) return true;
  return pieces.replace(/K/g, "").length >= 2;
}

/** The flagged side loses — unless the other side has no mating material (draw). */
export function timeoutOutcome(fen: string, flagged: MatchColor): GameOutcome {
  const winner = opposite(flagged);
  if (!hasMatingMaterial(fen, winner)) return { endReason: "TIMEOUT", result: "DRAW" };
  return { endReason: "TIMEOUT", result: winFor(winner) };
}

export function resignationOutcome(resigning: MatchColor): GameOutcome {
  return { endReason: "RESIGNATION", result: winFor(opposite(resigning)) };
}

/**
 * Rebuilds the game from `startFen` so threefold repetition sees the whole
 * history. Falls back to the stored position when the history does not replay
 * to `currentFen` (or is unreadable).
 */
export function replayGame(startFen: string, moves: readonly MatchMove[], currentFen: string): Chess {
  try {
    const chess = new Chess(startFen);
    for (const m of moves) {
      chess.move({ from: m.uci.slice(0, 2), promotion: m.uci.slice(4) || undefined, to: m.uci.slice(2, 4) });
    }
    if (chess.fen() === currentFen) return chess;
  } catch {
    // Fall through to the stored position.
  }
  return new Chess(currentFen);
}

/** Plays a UCI move on `chess` (mutating it). Null when the move is illegal or malformed. */
export function playUciMove(chess: Chess, uci: string): MatchMove | null {
  let played;
  try {
    played = chess.move({ from: uci.slice(0, 2), promotion: uci.slice(4) || undefined, to: uci.slice(2, 4) });
  } catch {
    played = null;
  }
  if (!played) return null;
  return { san: played.san, uci: `${played.from}${played.to}${played.promotion ?? ""}` };
}

/** How the game ends after `mover` just moved, or null when it goes on. */
export function outcomeAfterMove(chess: Chess, mover: MatchColor): GameOutcome | null {
  if (chess.isCheckmate()) return { endReason: "CHECKMATE", result: winFor(mover) };
  const draw = (endReason: MatchEndReason): GameOutcome => ({ endReason, result: "DRAW" });
  if (chess.isStalemate()) return draw("STALEMATE");
  if (chess.isInsufficientMaterial()) return draw("INSUFFICIENT_MATERIAL");
  if (chess.isThreefoldRepetition()) return draw("THREEFOLD_REPETITION");
  if (chess.isDraw()) return draw("FIFTY_MOVE_RULE");
  return null;
}
