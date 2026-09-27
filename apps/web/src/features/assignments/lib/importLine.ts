import { Chess } from "chess.js";
import type { SolutionMove } from "@nexa-chess/types";

export type ImportedLine = { startFen: string; moves: SolutionMove[] };

const looksLikeFen = (text: string) => !text.includes("[") && /^[pnbrqkPNBRQK1-8/]+\s+[wb]\b/.test(text);

/**
 * Accepts a bare FEN (position only) or a PGN. A PGN's `[FEN]` header sets the
 * start position; its mainline becomes the solution (variations and comments
 * are dropped). Throws with a user-facing message on bad input.
 */
export function parsePgnOrFen(raw: string): ImportedLine {
  const text = raw.trim();
  if (!text) throw new Error("Paste a FEN or PGN first.");

  if (looksLikeFen(text)) {
    try {
      return { startFen: new Chess(text).fen(), moves: [] };
    } catch {
      throw new Error("That FEN isn't a legal position.");
    }
  }

  const game = new Chess();
  try {
    game.loadPgn(text);
  } catch {
    throw new Error("Couldn't read that PGN — check the moves are legal.");
  }

  const startFen = game.getHeaders().FEN ?? new Chess().fen();
  const moves = game.history({ verbose: true }).map((m) => ({
    uci: `${m.from}${m.to}${m.promotion ?? ""}`,
    san: m.san
  }));
  return { startFen, moves };
}
