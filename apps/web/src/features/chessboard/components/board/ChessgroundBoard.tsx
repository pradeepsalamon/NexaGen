import React, { useEffect, useRef, useState, useMemo } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import { Config } from "chessground/config";
import { useBoardStore } from "../../context/BoardProvider";
import { useAuthStore } from "@/stores/authStore";

// Chessground CSS
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";

export function ChessgroundBoard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cg, setCg] = useState<Api | null>(null);
  
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH";

  const { 
    chess, fen, turn, orientation, boardTheme, pieceTheme, showCoordinates, 
    makeMove, isGameOver, arrows, setAnnotations, permissionMode, selectedStudentId,
    isEditingPosition, setPendingPromotion
  } = useBoardStore();

  const canMove = useMemo(() => {
    if (isEditingPosition && isCoach) return true;
    if (isCoach) return true;
    switch (permissionMode) {
      case "EVERYONE": return true;
      case "SELECTED_STUDENT": return user?.id === selectedStudentId;
      case "VIEW_ONLY":
      case "COACH_ONLY":
      default: return false;
    }
  }, [isCoach, permissionMode, selectedStudentId, user?.id, isEditingPosition]);

  // Compute legal moves
  const dests = useMemo(() => {
    if (isEditingPosition) return undefined; // Free movement
    if (isGameOver || !canMove) return new Map();
    const moves = new Map();
    const legalMoves = chess.moves({ verbose: true });
    for (const move of legalMoves) {
      if (!moves.has(move.from)) {
        moves.set(move.from, []);
      }
      moves.get(move.from).push(move.to);
    }
    return moves;
  }, [fen, isGameOver, chess, canMove, isEditingPosition]);

  // Initialize Chessground
  useEffect(() => {
    if (!containerRef.current) return;
    
    const config: Config = {
      fen: fen,
      orientation: orientation,
      coordinates: showCoordinates,
      viewOnly: false,
      turnColor: turn,
      highlight: {
        lastMove: true,
        check: true
      },
      animation: {
        enabled: !isEditingPosition,
        duration: 200
      },
      movable: {
        color: isEditingPosition ? 'both' : turn,
        free: isEditingPosition,
        dests,
        events: {
          after: (orig, dest) => {
             if (isEditingPosition) {
                // In edit mode, we just update the FEN locally without strict chess.js rules
                // (Advanced FEN generation would be needed here for true free editing)
                return;
             }
             
             // Check for promotion
             const piece = chess.get(orig as any);
             if (piece && piece.type === 'p' && (dest[1] === '1' || dest[1] === '8')) {
                 setPendingPromotion({ from: orig, to: dest });
                 return;
             }
             
             // Normal move
             makeMove(orig, dest, 'q'); 
          }
        }
      },
      drawable: {
        enabled: true,
        visible: true,
        eraseOnClick: false,
        brushes: {
          green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
          red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 },
          blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
          yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
        },
        onChange: (shapes) => {
          // Convert chessground shapes back to our string[][] format
          const newArrows = shapes.map(s => [s.orig, s.dest || s.orig, s.brush || 'green']);
          // Only update if changed to prevent loops
          setAnnotations(newArrows, {});
        }
      }
    };
    
    const instance = Chessground(containerRef.current, config);
    setCg(instance);
    
    return () => {
      instance.destroy();
    };
  }, []); // Mount only

  // Sync state to Chessground
  useEffect(() => {
    if (!cg) return;
    cg.set({
      fen,
      turnColor: turn,
      orientation,
      coordinates: showCoordinates,
      animation: { enabled: !isEditingPosition },
      movable: {
        color: isEditingPosition ? 'both' : ((isGameOver || !canMove) ? undefined : turn),
        free: isEditingPosition,
        dests
      },
      drawable: {
        // Set the active brush for the user
        // Chessground defaults to green. To switch, we don't have a direct `activeBrush` API,
        // but we can rely on right-click + modifier keys natively, or just store it.
        // Actually, we can intercept drawing if needed, but for now we let chessground handle it.
      }
    });
  }, [cg, fen, turn, orientation, showCoordinates, isGameOver, dests, canMove, isEditingPosition]);
  
  // Sync annotations (arrows)
  useEffect(() => {
    if (!cg) return;
    const shapes = arrows.map(a => ({
      orig: a[0] as any,
      dest: (a[1] === a[0] ? undefined : a[1]) as any, // if orig==dest, it's a circle
      brush: a[2]
    }));
    cg.setShapes(shapes);
  }, [cg, arrows]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full"
      data-board={boardTheme}
      data-piece={pieceTheme}
    />
  );
}
