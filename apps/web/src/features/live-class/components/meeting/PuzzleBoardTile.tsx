"use client";

import { useEffect, useRef } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";

/** Read-only mini board driven purely by a `fen` prop — no board store, no moves. */
export function PuzzleBoardTile({
  fen,
  orientation
}: {
  fen: string;
  orientation: "white" | "black";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const { currentBoardTheme, currentPieceSet, animationEnabled, hasCustomPieceColors } = useChessAppearance();

  useEffect(() => {
    if (!containerRef.current) return;
    apiRef.current = Chessground(containerRef.current, {
      fen,
      orientation,
      viewOnly: true,
      // Deliberately no coordinates on this tiny multi-board grid tile,
      // regardless of the user's global preference — they'd be unreadable.
      coordinates: false,
      drawable: { enabled: false },
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
    apiRef.current?.set({ fen, orientation, animation: { enabled: animationEnabled, duration: 150 } });
  }, [fen, orientation, animationEnabled]);

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
