import { useCallback, useMemo } from "react";
import { Chess } from "chess.js";
import { useBoardStore } from "../store/boardStore";
import { useBoardSync } from "./useBoardSync";
import { useAuthStore } from "@/stores/authStore";

export function useChessLogic() {
  const { fen, pushHistory, permissionMode, selectedStudentId } = useBoardStore();
  const { broadcastState } = useBoardSync();
  const user = useAuthStore((state) => state.user);
  
  const isCoach = user?.role === "COACH";
  
  // We maintain a local chess instance to validate moves based on the current FEN
  const chess = useMemo(() => new Chess(), []);
  
  // Ensure the local instance is in sync with the store's FEN
  useMemo(() => {
    try {
      if (fen !== chess.fen()) {
        chess.load(fen);
      }
    } catch (e) {
      console.warn("Invalid FEN loaded from store", fen);
    }
  }, [fen, chess]);

  const canMove = useCallback(() => {
    if (isCoach) return true; // Coach can always move
    
    switch (permissionMode) {
      case "EVERYONE": return true;
      case "SELECTED_STUDENT": return user?.id === selectedStudentId;
      case "VIEW_ONLY":
      case "COACH_ONLY":
      default: return false;
    }
  }, [isCoach, permissionMode, selectedStudentId, user?.id]);

  const makeMove = useCallback((move: { from: string; to: string; promotion?: string }) => {
    if (!canMove()) return false;
    
    try {
      const result = chess.move(move);
      if (result) {
        const newFen = chess.fen();
        const newPgn = chess.pgn();
        pushHistory(newFen, newPgn);
        
        // Broadcast to others
        setTimeout(() => broadcastState("MOVE"), 0);
        return true;
      }
    } catch (e) {
      return false; // Invalid move
    }
    return false;
  }, [canMove, chess, pushHistory, broadcastState]);
  
  const onDrop = useCallback((sourceSquare: string, targetSquare: string, piece: string) => {
    const promotion = piece[1].toLowerCase() ?? 'q';
    return makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion
    });
  }, [makeMove]);

  return {
    chess,
    makeMove,
    onDrop,
    canMove: canMove()
  };
}
