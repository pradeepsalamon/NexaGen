import React, { useEffect, useRef, useState, useMemo } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import { Config } from "chessground/config";
import { useLocalParticipant } from "@livekit/components-react";
import { useBoardStore } from "../../context/BoardProvider";
import { controlSideForIdentity } from "../../lib/boardSyncRules";
import type { BoardControlSide } from "../../types/sync";
import { preloadSounds } from "../../audio/sounds";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";

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
    isDetached
  } = useBoardStore();

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

  const isAutoClearing = useRef(false);
  const isDrawingModeRef = useRef(isDrawingMode);
  
  useEffect(() => {
    isDrawingModeRef.current = isDrawingMode;
  }, [isDrawingMode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    
    const handleDown = (e: MouseEvent | TouchEvent) => {
      // Ignore if it's already a right or middle click
      if ('button' in e && e.button !== 0) return;

      // Invalidate chessground's cached board bounds so square hit-testing uses
      // the current geometry (the board can be moved/resized by layout shifts
      // and CSS transforms that ResizeObserver does not report).
      cgRef.current?.state?.dom?.bounds?.clear?.();

      isAutoClearing.current = true;
      setTimeout(() => {
        isAutoClearing.current = false;
      }, 0);

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

  const brushColors: Record<string, string> = {
    green: '#15781B',
    red: '#882020',
    blue: '#003088',
    yellow: '#e68f00'
  };

  const getBrushConfig = (colorId: string) => {
    return { key: colorId.charAt(0), color: brushColors[colorId] || brushColors.green, opacity: 1, lineWidth: 10 };
  };

  // Initialize Chessground
  useEffect(() => {
    if (!containerRef.current) return;
    
    let instance: any;

    const config: Config = {
      fen,
      turnColor: turn,
      orientation,
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
        enabled: isCoach && !readOnly,
        visible: true,
        eraseOnClick: false,
        brushes: {
          green: getBrushConfig(activeBrush),
          primaryGreen: getBrushConfig('green'),
          red: getBrushConfig('red'),
          blue: getBrushConfig('blue'),
          yellow: getBrushConfig('yellow'),
        },
        onChange: (shapes) => {
          const { arrows: currentArrows, activeBrush: currentActiveBrush } = stateRef.current;
          
          if (isAutoClearing.current && shapes.length === 0) {
            // Chessground is attempting to natively auto-clear annotations on click.
            // We reject this and restore the arrows immediately.
            setTimeout(() => {
              if (containerRef.current && instance) {
                const mappedShapes = currentArrows.map(a => ({
                  orig: a[0] as any,
                  dest: (a[1] === a[0] ? undefined : a[1]) as any,
                  brush: a[2] === 'green' ? 'primaryGreen' : a[2]
                }));
                instance.setShapes(mappedShapes);
              }
            }, 0);
            return;
          }

          const newArrows = shapes.map(s => {
            const orig = s.orig;
            const dest = s.dest || s.orig;
            const existing = currentArrows.find(a => a[0] === orig && a[1] === dest);
            if (existing) {
               return [orig, dest, existing[2]];
            }
            const brush = currentActiveBrush === 'green' ? 'primaryGreen' : currentActiveBrush;
            return [orig, dest, brush];
          });
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
      drawable: {
        brushes: {
          green: getBrushConfig(activeBrush),
          primaryGreen: getBrushConfig('green'),
          red: getBrushConfig('red'),
          blue: getBrushConfig('blue'),
          yellow: getBrushConfig('yellow'),
        }
      }
    });
  }, [cg, activeBrush]);

  // Sync state to Chessground
  useEffect(() => {
    if (!cg) return;
    cg.set({
      fen,
      turnColor: turn,
      orientation,
      coordinates: showCoordinates,
      animation: { enabled: animationEnabled && !isEditingPosition },
      check: chess.inCheck(),
      lastMove: lastMoveSquares as any,
      highlight: {
        lastMove: highlightSettings.highlightEnabled,
        check: highlightSettings.checkIndicatorEnabled,
      },
      viewOnly: !canMove,
      drawable: { enabled: isCoach && !readOnly },
      movable: {
        color: movableColor,
        free: isEditingPosition,
        showDests: highlightSettings.legalMovesEnabled,
        dests
      }
    });
  }, [
    cg, fen, turn, orientation, showCoordinates, animationEnabled, highlightSettings, chess,
    lastMoveSquares, isGameOver, dests, canMove, movableColor, isEditingPosition, isCoach, readOnly
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
