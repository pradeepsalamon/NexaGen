"use client";

import { useMemo, type ReactNode } from "react";
import type { ChessAppearance } from "@nexa-chess/types";
import { ChessAppearanceContext } from "../context/ChessAppearanceProvider";
import { pieceSetSupportsCustomColors } from "../lib/recolorPieces";
import { usePieceRecolorStyle } from "../lib/usePieceRecolorStyle";
import { useSoundSettingsSync } from "../lib/useSoundSettingsSync";

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
  usePieceRecolorStyle(config.pieceSetId, config.pieceColorWhite, config.pieceColorBlack);
  useSoundSettingsSync(config.soundThemeId, config.soundEnabled, config.soundVolume);

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
      pieceColorWhite: config.pieceColorWhite,
      pieceColorBlack: config.pieceColorBlack,
      hasCustomPieceColors:
        (!!config.pieceColorWhite || !!config.pieceColorBlack) &&
        pieceSetSupportsCustomColors(config.pieceSetId),
      soundThemeId: config.soundThemeId,
      soundEnabled: config.soundEnabled,
      soundVolume: config.soundVolume,
      locked: false,
      isLoading: false,
      updatePreference: () => {},
      resetPreference: () => {},
    }),
    [config],
  );

  return <ChessAppearanceContext.Provider value={value}>{children}</ChessAppearanceContext.Provider>;
}
