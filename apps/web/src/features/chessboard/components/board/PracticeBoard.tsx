"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { DrawShape } from "chessground/draw";
import type { Color, Key } from "chessground/types";
import { Chess, type Square } from "chess.js";
import { cn } from "@/lib/utils";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";

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
  className?: string;
}

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
      drawable: { enabled: false },
      animation: { enabled: animationEnabled, duration: 150 },
      highlight: {
        lastMove: highlightSettings.highlightEnabled,
        check: highlightSettings.checkIndicatorEnabled,
      },
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
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // Mount once; updates are pushed via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiRef.current?.set({
      fen,
      orientation,
      turnColor,
      coordinates: showCoordinates,
      animation: { enabled: animationEnabled, duration: 150 },
      lastMove: lastMove ? (lastMove as Key[]) : undefined,
      check: game?.inCheck() ?? false,
      highlight: {
        lastMove: highlightSettings.highlightEnabled,
        check: highlightSettings.checkIndicatorEnabled,
      },
      movable: { free: false, color: movableColor, dests, showDests: highlightSettings.legalMovesEnabled }
    });
  }, [
    fen, orientation, turnColor, lastMove, movableColor, dests, game,
    showCoordinates, animationEnabled, highlightSettings
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
