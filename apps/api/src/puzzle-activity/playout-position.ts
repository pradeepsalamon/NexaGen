import {
  type PlayoutFacts,
  type PlayoutColor,
  type PlayoutMoveView
} from "@nexa-chess/types";
import { Chess } from "../common/chess/chess";

/** One stored move of a Playout game (movesJson). */
export type StoredPlayoutMove = PlayoutMoveView;

/**
 * Replay a game from its start, so threefold repetition sees the whole history.
 * The chess rules (castling, en passant, promotion, every draw) are chess.js's.
 */
export function replayPlayout(startFen: string, moves: readonly StoredPlayoutMove[]): Chess {
  const chess = new Chess(startFen);
  for (const move of moves) {
    chess.move({ from: move.uci.slice(0, 2), promotion: move.uci[4], to: move.uci.slice(2, 4) });
  }
  return chess;
}

/** What the pure goal rules need to know about the position `chess` is in. */
export function playoutFacts(
  chess: Chess,
  studentColor: PlayoutColor,
  moves: readonly StoredPlayoutMove[]
): PlayoutFacts {
  const last = moves[moves.length - 1];
  return {
    isCheckmate: chess.isCheckmate(),
    isOtherDraw: !chess.isCheckmate() && !chess.isStalemate() && (chess.isDraw() || chess.isThreefoldRepetition()),
    isStalemate: chess.isStalemate(),
    lastMover: last?.by ?? null,
    placement: chess.fen().split(" ")[0],
    promotions: moves.flatMap((m) => (m.by === "STUDENT" && m.uci[4] ? [m.uci[4]] : [])),
    studentColor,
    turn: chess.turn() === "w" ? "white" : "black"
  };
}

export function turnOfPlayout(fen: string, studentColor: PlayoutColor): "STUDENT" | "COMPUTER" {
  const side: PlayoutColor = fen.split(" ")[1] === "b" ? "black" : "white";
  return side === studentColor ? "STUDENT" : "COMPUTER";
}

/** The game's PGN. It names no student: the record travels with the class's history. */
export function playoutPgn(chess: Chess, studentColor: PlayoutColor, computerLabel: string): string {
  chess.setHeader("White", studentColor === "white" ? "Student" : `Computer (${computerLabel})`);
  chess.setHeader("Black", studentColor === "black" ? "Student" : `Computer (${computerLabel})`);
  return chess.pgn();
}
