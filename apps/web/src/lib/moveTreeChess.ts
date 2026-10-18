import type { MoveTreeChessFactory } from "@nexa-chess/types";
import { Chess } from "@/lib/chess";

/** `MoveTreeChessFactory` backed by the castling-sanitised chess.js wrapper. */
export const createMoveTreeChess: MoveTreeChessFactory = (fen) => {
  const chess = new Chess(fen);
  return {
    fen: () => chess.fen(),
    move: (san) => {
      try {
        const move = chess.move(san);
        return { from: move.from, promotion: move.promotion, san: move.san, to: move.to };
      } catch {
        return null;
      }
    },
  };
};
