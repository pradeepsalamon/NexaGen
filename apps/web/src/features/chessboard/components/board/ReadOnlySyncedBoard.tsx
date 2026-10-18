"use client";

import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import { useEffect, useRef } from "react";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";
import type { ReadOnlyBoardState } from "../../lib/readOnlyBoard";

/**
 * View-only chessground driven purely by a synced FEN and annotations — the
 * recorder template and the admin spectator seat. Chessground sizes itself
 * from its container, so `className` must give the host a size.
 */
export function ReadOnlySyncedBoard({ state, className }: { state: ReadOnlyBoardState; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const { currentBoardTheme, currentPieceSet, showCoordinates, animationEnabled, hasCustomPieceColors } =
    useChessAppearance();

  useEffect(() => {
    if (!hostRef.current || apiRef.current) return;
    apiRef.current = Chessground(hostRef.current, {
      fen: state.fen,
      orientation: state.orientation,
      viewOnly: true,
      coordinates: showCoordinates,
      animation: { enabled: animationEnabled, duration: 200 },
      drawable: { enabled: false, visible: true },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cg = apiRef.current;
    if (!cg) return;
    cg.set({
      fen: state.fen,
      orientation: state.orientation,
      drawable: {
        autoShapes: [
          ...state.arrows.map(([orig, dest, brush]) => ({
            orig,
            dest,
            brush: brush || "green",
          })),
          ...Object.entries(state.squares).map(([orig, brush]) => ({
            orig,
            brush: brush || "green",
          })),
        ],
      },
    } as Parameters<Api["set"]>[0]);
  }, [state]);

  return (
    <div
      className={className}
      ref={hostRef}
      data-nexa-board-theme={currentBoardTheme}
      data-nexa-piece-set={currentPieceSet}
      data-nexa-piece-recolor={hasCustomPieceColors ? "on" : undefined}
    />
  );
}
