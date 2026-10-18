"use client";

import { useEffect, useRef } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";

/** Read-only mini board driven purely by a `fen` prop — no board store, no moves. */
export function PuzzleBoardTile({
  fen,
  orientation,
  lastMove,
  wrongMove
}: {
  fen: string;
  orientation: "white" | "black";
  /** UCI of a move to highlight, e.g. a catalogue puzzle's setup move. */
  lastMove?: string;
  /** UCI of a mistaken move, drawn as a red arrow. */
  wrongMove?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const { currentBoardTheme, currentPieceSet, animationEnabled, hasCustomPieceColors } = useChessAppearance();

  useEffect(() => {
    if (!containerRef.current) return;
    apiRef.current = Chessground(containerRef.current, {
      fen,
      orientation,
      lastMove: toLastMove(lastMove),
      viewOnly: true,
      // Deliberately no coordinates on this tiny multi-board grid tile,
      // regardless of the user's global preference — they'd be unreadable.
      coordinates: false,
      drawable: { enabled: false, autoShapes: toWrongArrow(wrongMove) },
      animation: { enabled: animationEnabled, duration: 150 }
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // Mount once; fen/orientation changes are pushed via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiRef.current?.set({
      fen,
      orientation,
      lastMove: toLastMove(lastMove),
      animation: { enabled: animationEnabled, duration: 150 }
    });
    apiRef.current?.setAutoShapes(toWrongArrow(wrongMove));
  }, [fen, orientation, lastMove, wrongMove, animationEnabled]);

  return (
    <div
      ref={containerRef}
      className="aspect-square w-full overflow-hidden rounded-app border border-app-border"
      data-nexa-board-theme={currentBoardTheme}
      data-nexa-piece-set={currentPieceSet}
      data-nexa-piece-recolor={hasCustomPieceColors ? "on" : undefined}
    />
  );
}

function toWrongArrow(uci: string | undefined): DrawShape[] {
  return uci && uci.length >= 4
    ? [{ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: "red" }]
    : [];
}

function toLastMove(uci: string | undefined): Key[] | undefined {
  return uci && uci.length >= 4 ? [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key] : undefined;
}
