"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { DrawShape } from "chessground/draw";
import type { Color, Key } from "chessground/types";
import { type Square } from "chess.js";
import { Chess } from "@/lib/chess";
import { cn } from "@/lib/utils";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";
import { arrowBrushes, brushForGesture, isDrawGesture, stampGestureBrush } from "../../lib/drawBrushes";

export interface PracticeBoardMove {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
  san: string;
  uci: string;
  /** FEN after the move. */
  fen: string;
}

export interface PracticeBoardProps {
  /** Current position (controlled). */
  fen: string;
  orientation?: Color;
  /** Side the viewer may move. `undefined` = whichever side is to move. */
  playerColor?: Color;
  /** When false the board is view-only. */
  interactive?: boolean;
  lastMove?: [string, string] | null;
  /** Hint overlay: circles the origin, and draws an arrow when `to` is known. */
  hintSquares?: { from?: string | null; to?: string | null } | null;
  onMove?: (move: PracticeBoardMove) => void;
  /** Change it to snap the board back to `fen` (e.g. after a rejected move) without remounting. */
  resetKey?: number | string;
  /**
   * Let `playerColor` queue a move while the other side is to move (lichess
   * premove). It is played the moment `fen` turns back to them, if legal.
   * Needs `playerColor` and `interactive`.
   */
  premove?: boolean;
  className?: string;
}

/**
 * Layouts for a PracticeBoard beside its panel (moves, feedback, buttons).
 * From tablet width (md) up the two sit side by side, so a student never
 * scrolls between the board and what just happened; the board is also capped
 * by the visible height so it fits whole on a landscape tablet, and never
 * drops below a usable 300px.
 */
export const PRACTICE_BOARD_GRID =
  "grid gap-5 md:grid-cols-[minmax(0,min(440px,max(300px,calc(100dvh-15rem))))_minmax(0,1fr)] md:items-start";
/** The same sizing for a flex row: put it on the board (`className`). */
export const PRACTICE_BOARD_BESIDE =
  "md:w-[min(440px,max(300px,calc(100dvh-15rem)),55%)] md:max-w-none md:shrink-0";

// A LiveKit-free interactive board. Legal-move generation and validation run
// through chess.js; the parent owns the FEN. Reused by every evaluated
// assignment activity (SOLVE_LINE, PLAY_VS_ENGINE, FREE_ANALYSIS).
export function PracticeBoard({
  fen,
  orientation = "white",
  playerColor,
  interactive = true,
  lastMove,
  hintSquares,
  onMove,
  resetKey,
  premove = false,
  className
}: PracticeBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const {
    currentBoardTheme, currentPieceSet, showCoordinates, animationEnabled, highlightSettings,
    hasCustomPieceColors
  } = useChessAppearance();

  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);

  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const gameRef = useRef(game);
  gameRef.current = game;

  const turnColor: Color = game?.turn() === "b" ? "black" : "white";
  const movableColor = interactive ? playerColor ?? turnColor : undefined;
  const canMove = interactive && (!playerColor || playerColor === turnColor);
  const premoveEnabled = premove && interactive && !!playerColor;

  const dests = useMemo(() => {
    const map = new Map<Key, Key[]>();
    if (!game || !canMove) return map;
    for (const sq of game.moves({ verbose: true })) {
      const arr = map.get(sq.from as Key) ?? [];
      arr.push(sq.to as Key);
      map.set(sq.from as Key, arr);
    }
    return map;
  }, [game, canMove]);

  const commitMove = useCallback((from: Square, to: Square, promo?: "q" | "r" | "b" | "n") => {
    const current = gameRef.current;
    if (!current) return;
    const probe = new Chess(current.fen());
    let result;
    try {
      result = probe.move({ from, to, promotion: promo });
    } catch {
      result = null;
    }
    if (!result) {
      // Illegal (or needs promotion) — snap back.
      apiRef.current?.set({ fen: current.fen() });
      return;
    }
    onMoveRef.current?.({
      from,
      to,
      promotion: promo,
      san: result.san,
      uci: `${result.from}${result.to}${result.promotion ?? ""}`,
      fen: probe.fen()
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    apiRef.current = Chessground(containerRef.current, {
      fen,
      orientation,
      turnColor,
      coordinates: showCoordinates,
      // Right-click (or Shift + click) arrows and circles, the same gesture and
      // colours as the live-class board. Local only; a move clears them.
      drawable: { enabled: true, eraseOnClick: true, brushes: arrowBrushes() },
      animation: { enabled: animationEnabled, duration: 150 },
      highlight: {
        lastMove: highlightSettings.highlightEnabled,
        check: highlightSettings.checkIndicatorEnabled,
      },
      // chessground premoves by default; a queued move nobody plays just
      // leaves a stuck highlight, so only boards that play them enable it.
      premovable: { enabled: premoveEnabled },
      movable: {
        free: false,
        color: movableColor,
        dests,
        showDests: highlightSettings.legalMovesEnabled,
        events: {
          after: (orig, dest) => {
            const from = orig as Square;
            const to = dest as Square;
            const current = gameRef.current;
            if (!current) return;
            const needsPromotion = current
              .moves({ verbose: true })
              .some((m) => m.from === from && m.to === to && m.promotion);
            if (needsPromotion) {
              setPromotion({ from, to });
              return;
            }
            commitMove(from, to);
          }
        }
      }
    });
    const el = containerRef.current;
    // chessground measures the board once and caches it. A board that mounts
    // inside an opening dialog is measured mid zoom-in (95% scale), so taps
    // near the right and bottom edges hit the wrong square until something
    // re-measures. Re-measure before every touch / click, and once the open
    // animation is over.
    const refreshBounds = () => {
      const state = apiRef.current?.state;
      if (!state) return;
      const before = state.dom.bounds();
      state.dom.bounds.clear();
      const after = state.dom.bounds();
      const moved =
        Math.abs(before.width - after.width) > 0.5 ||
        Math.abs(before.left - after.left) > 0.5 ||
        Math.abs(before.top - after.top) > 0.5;
      if (moved) state.dom.redraw();
    };
    const onPointerStart = (e: MouseEvent | TouchEvent) => {
      refreshBounds();
      // Colour a drawing gesture by its modifier (Ctrl red, Alt blue, Shift
      // yellow), exactly like the live-class board.
      if (e instanceof MouseEvent && isDrawGesture(e)) {
        stampGestureBrush(() => apiRef.current?.state, brushForGesture(e));
      }
    };
    // Android Chrome can cancel a touch (system gesture, notification shade)
    // without a touchend. chessground never hears about it, keeps the drag
    // open, and spends the next tap cancelling it instead of selecting.
    const onTouchCancel = () => {
      if (apiRef.current?.state.draggable.current) apiRef.current.cancelMove();
    };
    const settle = window.setTimeout(refreshBounds, 350);
    el.addEventListener("mousedown", onPointerStart, { capture: true });
    el.addEventListener("touchstart", onPointerStart, { capture: true, passive: true });
    el.addEventListener("touchcancel", onTouchCancel);
    return () => {
      window.clearTimeout(settle);
      el.removeEventListener("mousedown", onPointerStart, { capture: true });
      el.removeEventListener("touchstart", onPointerStart, { capture: true });
      el.removeEventListener("touchcancel", onTouchCancel);
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // Mount once; updates are pushed via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sending an unchanged `fen` replaces every piece, animates, and wipes
  // drawn arrows — and a parent re-renders often (a ticking clock, a poll), so
  // doing it every time cancels a piece the user just tapped or is dragging.
  // Only send the position when the board shows something else, or when the
  // parent asks for a snap-back with `resetKey`.
  const lastMoveKey = lastMove ? `${lastMove[0]}${lastMove[1]}` : "";
  const appliedResetKey = useRef(resetKey);
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const resetRequested = appliedResetKey.current !== resetKey;
    appliedResetKey.current = resetKey;
    const positionChanged = api.getFen() !== fen.split(" ")[0];
    api.set({
      ...(positionChanged || resetRequested ? { fen, drawable: { shapes: [] } } : {}),
      orientation,
      turnColor,
      coordinates: showCoordinates,
      animation: { enabled: animationEnabled, duration: 150 },
      lastMove: lastMoveKey ? ([lastMoveKey.slice(0, 2), lastMoveKey.slice(2, 4)] as Key[]) : undefined,
      check: game?.inCheck() ?? false,
      highlight: {
        lastMove: highlightSettings.highlightEnabled,
        check: highlightSettings.checkIndicatorEnabled,
      },
      premovable: { enabled: premoveEnabled },
      movable: { free: false, color: movableColor, dests, showDests: highlightSettings.legalMovesEnabled }
    });
    // Our turn again: play the queued premove at once (it goes through the
    // same `after` handler as a normal move). Off the board: drop it.
    if (!premoveEnabled) api.cancelPremove();
    else if (canMove) api.playPremove();
  }, [
    fen, orientation, turnColor, lastMoveKey, movableColor, dests, game, canMove, premoveEnabled,
    showCoordinates, animationEnabled, highlightSettings, resetKey
  ]);

  useEffect(() => {
    const shapes: DrawShape[] = [];
    if (hintSquares?.from) {
      shapes.push({ orig: hintSquares.from as Key, brush: "green" });
      if (hintSquares.to) {
        shapes.push({ orig: hintSquares.from as Key, dest: hintSquares.to as Key, brush: "green" });
      }
    }
    apiRef.current?.setAutoShapes(shapes);
  }, [hintSquares, fen]);

  return (
    <div className={cn("relative w-full max-w-[440px]", className)}>
      <div
        ref={containerRef}
        className="aspect-square w-full rounded-app border border-app-border"
        data-nexa-board-theme={currentBoardTheme}
        data-nexa-piece-set={currentPieceSet}
        data-nexa-piece-recolor={hasCustomPieceColors ? "on" : undefined}
        data-nexa-highlights={highlightSettings.highlightEnabled ? undefined : "off"}
      />
      {promotion && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-app bg-black/60 backdrop-blur-sm">
          <div className="rounded-panel border border-app-border bg-app-surface p-4 shadow-card">
            <p className="mb-3 text-center text-sm font-semibold text-app-text">Promote to</p>
            <div className="flex gap-2">
              {(["q", "r", "b", "n"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className="size-12 rounded-control border border-app-border bg-app-background text-lg font-bold uppercase text-app-text transition-colors hover:bg-primary hover:text-white"
                  onClick={() => {
                    const { from, to } = promotion;
                    setPromotion(null);
                    commitMove(from, to, p);
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 w-full text-center text-xs text-app-muted hover:text-app-text"
              onClick={() => {
                setPromotion(null);
                if (game) apiRef.current?.set({ fen: game.fen() });
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
