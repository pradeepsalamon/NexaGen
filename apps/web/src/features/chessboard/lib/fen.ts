import { readSetupFen, sanitizeCastlingRights, setPlacementSquare, type SetupFenRead } from "@nexa-chess/types";
import { Chess } from "@/lib/chess";

// FEN helpers shared by the reusable position editor and its consumers.
// Pure — no React, no chessground, no LiveKit.

export const START_PLACEMENT = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
export const EMPTY_PLACEMENT = "8/8/8/8/8/8/8/8";
export const START_FEN = `${START_PLACEMENT} w KQkq - 0 1`;
export const EMPTY_FEN = `${EMPTY_PLACEMENT} w - - 0 1`;

export interface FenParts {
  placement: string;
  turn: "w" | "b";
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean };
  enPassant: string;
  halfMove: string;
  fullMove: string;
}

const PLACEMENT_RE = /^([pnbrqkPNBRQK1-8]+\/){7}[pnbrqkPNBRQK1-8]+$/;

// True for any well-formed piece-placement field, even if the full position is
// not yet legal (mid-edit, cleared board, missing kings...).
export function isPlacementWellFormed(placement: string): boolean {
  return PLACEMENT_RE.test(placement);
}

export function parseFen(fen: string): FenParts {
  const [placement = START_PLACEMENT, turn = "w", castling = "-", ep = "-", half = "0", full = "1"] =
    fen.trim().split(/\s+/);

  return {
    placement,
    turn: turn === "b" ? "b" : "w",
    castling: {
      K: castling.includes("K"),
      Q: castling.includes("Q"),
      k: castling.includes("k"),
      q: castling.includes("q"),
    },
    enPassant: ep || "-",
    halfMove: /^\d+$/.test(half) ? half : "0",
    fullMove: /^[1-9]\d*$/.test(full) ? full : "1",
  };
}

// Drops any castling flag whose king or rook is off its home square, so the
// editor's FEN never claims a right the placement can't support (a king
// dragged from e1 to e4 must not keep "K" and be offered O-O from there).
export function composeFen(parts: FenParts): string {
  const castling =
    (parts.castling.K ? "K" : "") +
    (parts.castling.Q ? "Q" : "") +
    (parts.castling.k ? "k" : "") +
    (parts.castling.q ? "q" : "");

  return sanitizeCastlingRights(
    [
      parts.placement,
      parts.turn,
      castling || "-",
      parts.enPassant || "-",
      parts.halfMove || "0",
      parts.fullMove || "1",
    ].join(" "),
  );
}

export type FenInspection = SetupFenRead;

/**
 * `readSetupFen` (the shared, chess.js-free reader), plus chess.js's own
 * verdict when that found nothing: anything chess.js still refuses becomes an
 * issue, so a position with no issues always loads into the game store.
 * Board position and chess legality stay separate: the board store shows a
 * position with issues as set-up only (no moves, no engine) and plays one
 * without them as usual.
 */
export function inspectFen(input: string): FenInspection {
  const read = readSetupFen(input);
  if (!read.ok || read.issues.length > 0) return read;
  try {
    new Chess(read.fen);
    return read;
  } catch (e) {
    const reason = e instanceof Error && e.message ? e.message.replace(/^Invalid FEN:\s*/i, "") : "not a legal position";
    return { ...read, issues: [reason] };
  }
}

export { setPlacementSquare };
