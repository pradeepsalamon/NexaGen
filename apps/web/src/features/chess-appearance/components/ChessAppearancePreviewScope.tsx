"use client";

import { useMemo, type ReactNode } from "react";
import type { ChessAppearance } from "@nexa-chess/types";
import { ChessAppearanceContext } from "../context/ChessAppearanceProvider";

interface ChessAppearancePreviewScopeProps {
  config: ChessAppearance;
  children: ReactNode;
}

/**
 * Shadows the app-wide `ChessAppearanceContext` with unsaved draft values for
 * its subtree, so a settings page's live preview board updates immediately
 * as the user edits a form — without saving, and without any board
 * component needing to know it's in "preview mode" (it just reads
 * `useChessAppearance()`, and gets whichever provider is nearest).
 */
export function ChessAppearancePreviewScope({ config, children }: ChessAppearancePreviewScopeProps) {
  const value = useMemo(
    () => ({
      currentBoardTheme: config.boardThemeId,
      currentPieceSet: config.pieceSetId,
      showCoordinates: config.showCoordinates,
      boardOrientation: config.boardOrientation,
      animationEnabled: config.animationEnabled,
      highlightSettings: {
        highlightEnabled: config.highlightEnabled,
        legalMovesEnabled: config.legalMovesEnabled,
        checkIndicatorEnabled: config.checkIndicatorEnabled,
      },
      isLoading: false,
      updatePreference: () => {},
      resetPreference: () => {},
    }),
    [config],
  );

  return <ChessAppearanceContext.Provider value={value}>{children}</ChessAppearanceContext.Provider>;
}
