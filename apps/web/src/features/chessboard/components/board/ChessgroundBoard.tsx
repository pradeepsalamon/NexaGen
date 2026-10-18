import React, { useEffect, useRef, useState, useMemo } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import { Config } from "chessground/config";
import { useLocalParticipant } from "@livekit/components-react";
import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { controlSideForIdentity } from "../../lib/boardSyncRules";
import type { BoardControlSide } from "../../types/sync";
import { preloadSounds } from "../../audio/sounds";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";
import {
  arrowBrushes,
  brushForGesture,
  isDrawGesture,
  paletteBrush,
  stampGestureBrush
} from "../../lib/drawBrushes";

export function ChessgroundBoard({ readOnly = false }: { readOnly?: boolean } = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cg, setCg] = useState<Api | null>(null);
  const cgRef = useRef<any>(null);

  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { localParticipant } = useLocalParticipant();
  const {
    currentBoardTheme,
    currentPieceSet,
    showCoordinates,
    animationEnabled,
    highlightSettings,
    hasCustomPieceColors,
  } = useChessAppearance();

  // Warm the move-sound buffer cache so the first move isn't silent while the
  // asset downloads (AUDIT H5).
  useEffect(() => {
    preloadSounds();
  }, []);

  const {
    chess, fen, turn, orientation, moveHistory, historyIndex,
    makeMove, isGameOver, arrows, setAnnotations, permissionMode, selectedStudentIds,
    selectedStudentSides, isEditingPosition, setPendingPromotion, activeBrush, isDrawingMode,
    isDetached, localFlip, overlayArrows
  } = useBoardStore(
    useShallow((s) => ({
      chess: s.chess,
      fen: s.fen,
      turn: s.turn,
      orientation: s.orientation,
      moveHistory: s.moveHistory,
      historyIndex: s.historyIndex,
      makeMove: s.makeMove,
      isGameOver: s.isGameOver,
      arrows: s.arrows,
      setAnnotations: s.setAnnotations,
      permissionMode: s.permissionMode,
      selectedStudentIds: s.selectedStudentIds,
      selectedStudentSides: s.selectedStudentSides,
      isEditingPosition: s.isEditingPosition,
      setPendingPromotion: s.setPendingPromotion,
      activeBrush: s.activeBrush,
      isDrawingMode: s.isDrawingMode,
      isDetached: s.isDetached,
      localFlip: s.localFlip,
      overlayArrows: s.overlayArrows,
    })),
  );
  // Everyone may draw arrows on an interactive board. A student's marks stay on
  // their own screen: `useBoardSync` only broadcasts the coach's annotations,
  // and receivers reject a non-coach UPDATE_ANNOTATIONS anyway.
  const canDraw = !readOnly;
  const viewOrientation = localFlip ? (orientation === "white" ? "black" : "white") : orientation;

  // Squares of the last played move, for the last-move highlight — derived
  // from move history rather than tracked separately.
  const lastMoveSquares = useMemo(() => {
    const last = moveHistory[historyIndex];
    return last ? [last.from, last.to] : undefined;
  }, [moveHistory, historyIndex]);

  // Which colour this client may move: "both" for the coach, for position
  // editing and for a detached student exploring their own line; otherwise
  // whatever the coach granted this student — white only, black only, or both.
  const controlSide = useMemo<BoardControlSide | null>(() => {
    if (readOnly) return null;
    if (isCoach) return "both";
    // A detached student explores their own line locally.
    if (isDetached) return "both";
    return controlSideForIdentity({
      identity: localParticipant?.identity,
      permissionMode,
      selectedStudentIds,
      selectedStudentSides,
    });
  }, [isCoach, permissionMode, selectedStudentIds, selectedStudentSides, localParticipant, isDetached, readOnly]);

  const canMove = controlSide !== null;
  // A single-colour grant only unlocks the board on that colour's turn.
  const isMyTurn = canMove && (controlSide === "both" || controlSide === turn);
  const movableColor = isEditingPosition
    ? "both"
    : isGameOver || !isMyTurn
      ? undefined
      : controlSide === "both"
        ? turn
        : controlSide ?? undefined;

  // Compute legal moves
  const dests = useMemo(() => {
    if (isEditingPosition) return undefined; // Free movement
    if (isGameOver || !movableColor) return new Map();
    const moves = new Map();
    const legalMoves = chess.moves({ verbose: true });
    for (const move of legalMoves) {
      if (!moves.has(move.from)) {
        moves.set(move.from, []);
      }
      moves.get(move.from).push(move.to);
    }
    return moves;
  }, [fen, isGameOver, chess, movableColor, isEditingPosition]);

  // Use a ref to access the latest state in the onChange callback without triggering infinite loops
  const stateRef = useRef({ arrows, activeBrush });
  useEffect(() => {
    stateRef.current = { arrows, activeBrush };
  }, [arrows, activeBrush]);

  const isDrawingModeRef = useRef(isDrawingMode);

  useEffect(() => {
    isDrawingModeRef.current = isDrawingMode;
  }, [isDrawingMode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleDown = (e: MouseEvent | TouchEvent) => {
      const isMouse = "button" in e;

      // A drawing gesture: pick the colour from the held modifier (Ctrl red,
      // Alt blue, Shift yellow, else the palette colour).
      if (isDrawGesture(e)) {
        stampGestureBrush(
          () => cgRef.current?.state,
          brushForGesture(e, stateRef.current.activeBrush)
        );
        return;
      }

      if (isMouse && (e as MouseEvent).button !== 0) return;

      // Invalidate chessground's cached board bounds so square hit-testing uses
      // the current geometry (the board can be moved/resized by layout shifts
      // and CSS transforms that ResizeObserver does not report).
      cgRef.current?.state?.dom?.bounds?.clear?.();

      // If we are in 1-click drawing mode, convert left-click/touch into a right-click
      if (isDrawingModeRef.current) {
        e.stopPropagation();
        e.preventDefault();
        
        const target = e.target as HTMLElement;
        let clientX = 0, clientY = 0;
        
        if (e.type.startsWith('touch')) {
           const touch = (e as TouchEvent).touches[0];
           if (touch) {
             clientX = touch.clientX;
             clientY = touch.clientY;
           }
        } else {
           clientX = (e as MouseEvent).clientX;
           clientY = (e as MouseEvent).clientY;
        }

        const syntheticEvent = new MouseEvent('mousedown', {
           bubbles: true,
           cancelable: true,
           view: window,
           button: 2, // Right click button
           buttons: 2,
           clientX,
           clientY
        });
        
        target.dispatchEvent(syntheticEvent);
      }
    };

    el.addEventListener('mousedown', handleDown as EventListener, { capture: true, passive: false });
    el.addEventListener('touchstart', handleDown as EventListener, { capture: true, passive: false });
    return () => {
      el.removeEventListener('mousedown', handleDown as EventListener, { capture: true });
      el.removeEventListener('touchstart', handleDown as EventListener, { capture: true });
    };
  }, []);

  // Initialize Chessground
  useEffect(() => {
    if (!containerRef.current) return;
    
    let instance: any;

    const config: Config = {
      fen,
      turnColor: turn,
      orientation: viewOrientation,
      coordinates: showCoordinates,
      animation: { enabled: animationEnabled && !isEditingPosition },
      check: chess.inCheck(),
      lastMove: lastMoveSquares as any,
      highlight: {
        lastMove: highlightSettings.highlightEnabled,
        check: highlightSettings.checkIndicatorEnabled,
      },
      viewOnly: false,
      movable: {
        color: movableColor,
        free: isEditingPosition,
        showDests: highlightSettings.legalMovesEnabled,
        dests,
        events: {
          after: (orig, dest) => {
             if (isEditingPosition) {
                return;
             }
             const piece = chess.get(orig as any);
             if (piece && piece.type === 'p' && (dest[1] === '1' || dest[1] === '8')) {
                 setPendingPromotion({ from: orig, to: dest });
                 return;
             }
             makeMove(orig, dest, 'q'); 
          }
        }
      },
      drawable: {
        enabled: canDraw,
        visible: true,
        // Lichess style: a left click anywhere on the board clears every mark.
        eraseOnClick: true,
        brushes: arrowBrushes(activeBrush),
        onChange: (shapes) => {
          const { activeBrush: currentActiveBrush } = stateRef.current;
          const newArrows = shapes.map(s => [
            s.orig,
            s.dest || s.orig,
            s.brush === 'green' ? paletteBrush(currentActiveBrush) : s.brush,
          ]);
          setAnnotations(newArrows as any, {});
          // Broadcasting is handled by the store subscription in useBoardSync;
          // calling broadcastAnnotations here races it with a stale closure.
        }
      }
    };
    
    instance = Chessground(containerRef.current, config);
    cgRef.current = instance;
    const boardEl = containerRef.current;
    setCg(instance);

    return () => {
      instance.destroy();
      cgRef.current = null;
      // chessground's destroy() only unbinds its listeners and does not remove
      // the rendered board; clear it so re-initialization doesn't stack wraps.
      while (boardEl && boardEl.firstChild) boardEl.removeChild(boardEl.firstChild);
    };
  }, [showCoordinates]); // Re-create on coordinate toggle: chessground v9 renders rank/file labels only at construction (renderWrap)

  // Update brushes dynamically when activeBrush changes
  useEffect(() => {
    if (!cg) return;
    cg.set({
      drawable: { brushes: arrowBrushes(activeBrush) }
    });
  }, [cg, activeBrush]);

  // Sync state to Chessground
  useEffect(() => {
    if (!cg) return;
    cg.set({
      fen,
      turnColor: turn,
      orientation: viewOrientation,
      coordinates: showCoordinates,
      animation: { enabled: animationEnabled && !isEditingPosition },
      check: chess.inCheck(),
      lastMove: lastMoveSquares as any,
      highlight: {
        lastMove: highlightSettings.highlightEnabled,
        check: highlightSettings.checkIndicatorEnabled,
      },
      viewOnly: !canMove,
      drawable: { enabled: canDraw },
      movable: {
        color: movableColor,
        free: isEditingPosition,
        showDests: highlightSettings.legalMovesEnabled,
        dests
      }
    });
  }, [
    cg, fen, turn, viewOrientation, showCoordinates, animationEnabled, highlightSettings, chess,
    lastMoveSquares, isGameOver, dests, canMove, movableColor, isEditingPosition, canDraw
  ]);
  
  // Sync annotations (arrows)
  useEffect(() => {
    if (!cg) return;
    const shapes = arrows.map(a => {
      // Map any legacy 'green' brushes to 'primaryGreen'
      const brushColor = a[2] === 'green' ? 'primaryGreen' : a[2];
      return {
        orig: a[0] as any,
        dest: (a[1] === a[0] ? undefined : a[1]) as any,
        brush: brushColor
      };
    });
    cg.setShapes(shapes);
  }, [cg, arrows]);

  useEffect(() => {
    if (!cg) return;
    cg.setAutoShapes(
      overlayArrows.map((a) => ({
        orig: a.orig as any,
        dest: a.dest as any,
        brush: a.brush,
        modifiers: { lineWidth: Math.round(4 + a.weight * 10) }
      }))
    );
  }, [cg, overlayArrows]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      data-nexa-board-theme={currentBoardTheme}
      data-nexa-piece-set={currentPieceSet}
      data-nexa-piece-recolor={hasCustomPieceColors ? "on" : undefined}
      data-nexa-highlights={highlightSettings.highlightEnabled ? undefined : "off"}
    />
  );
}
