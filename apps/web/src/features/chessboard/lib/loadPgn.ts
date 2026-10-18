import { Chess } from "@/lib/chess";

type PushHistory = (fen: string, pgn: string) => void;

export type LoadPgnResult =
  | { ok: true; moveCount: number }
  | { ok: false; error: string };

/**
 * Parse a PGN string and load it onto the board via the store's `pushHistory`
 * (which rebuilds `moveHistory` + `historyIndex`, so the Moves panel and
 * `BoardNavigation` light up immediately). Single implementation shared by the
 * sidebar "Paste PGN" button and the "Load Game" dialog tab.
 */
export function loadPgnIntoBoard(
  pgn: string,
  pushHistory: PushHistory
): LoadPgnResult {
  const trimmed = pgn.trim();
  if (!trimmed) {
    return { ok: false, error: "Paste a PGN first." };
  }

  const chess = new Chess();
  try {
    chess.loadPgn(trimmed);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? `Invalid PGN: ${err.message}`
          : "That does not look like a valid PGN."
    };
  }

  if (chess.history().length === 0 && chess.fen() === new Chess().fen()) {
    return { ok: false, error: "No moves or position found in that PGN." };
  }

  pushHistory(chess.fen(), chess.pgn());
  return { ok: true, moveCount: chess.history().length };
}
