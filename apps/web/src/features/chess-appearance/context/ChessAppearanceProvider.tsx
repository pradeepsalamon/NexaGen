"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  DEFAULT_CHESS_APPEARANCE,
  type BoardOrientation,
  type BoardThemeId,
  type ChessAppearanceOverride,
  type PieceSetId,
  type SoundThemeId,
} from "@nexa-chess/types";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
  useResetChessAppearanceMutation,
  useResolvedChessAppearanceQuery,
  useUpdateChessAppearanceMutation,
} from "../hooks/useChessAppearanceApi";
import { pieceSetSupportsCustomColors } from "../lib/recolorPieces";
import { usePieceRecolorStyle } from "../lib/usePieceRecolorStyle";
import { useSoundSettingsSync } from "../lib/useSoundSettingsSync";

interface ChessHighlightSettings {
  highlightEnabled: boolean;
  legalMovesEnabled: boolean;
  checkIndicatorEnabled: boolean;
}

interface ChessAppearanceContextValue {
  currentBoardTheme: BoardThemeId;
  currentPieceSet: PieceSetId;
  showCoordinates: boolean;
  boardOrientation: BoardOrientation;
  animationEnabled: boolean;
  highlightSettings: ChessHighlightSettings;
  /** `null` = that color isn't customized; the piece set's own color is used. */
  pieceColorWhite: string | null;
  pieceColorBlack: string | null;
  /** True when a board should carry `data-nexa-piece-recolor="on"` (see `recolorPieces.ts`). */
  hasCustomPieceColors: boolean;
  soundThemeId: SoundThemeId;
  soundEnabled: boolean;
  soundVolume: number;
  /** True when an admin has locked board settings — see `ResolvedChessAppearance.locked`. */
  locked: boolean;
  /** True while the resolved config is still loading — consumers get the safe default meanwhile. */
  isLoading: boolean;
  updatePreference: (override: ChessAppearanceOverride) => void;
  resetPreference: () => void;
}

// Exported so `ChessAppearancePreviewScope` can shadow it with draft values
// for a live settings-page preview, without any board component needing to
// know about "draft mode" — it just reads whichever provider is nearest.
export const ChessAppearanceContext = createContext<ChessAppearanceContextValue | null>(null);
export type { ChessAppearanceContextValue };

/**
 * App-wide board appearance context (spec §17). Purely cosmetic, per-browser
 * session state — never broadcast over a LiveKit data channel or written to
 * `boardStore`'s synced fields (§20/§27). Falls back to
 * `DEFAULT_CHESS_APPEARANCE` while loading/unauthenticated so no board ever
 * flashes unstyled.
 */
export function ChessAppearanceProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useResolvedChessAppearanceQuery();
  const updateMutation = useUpdateChessAppearanceMutation();
  const resetMutation = useResetChessAppearanceMutation();
  const prefersReducedMotion = usePrefersReducedMotion();

  const config = data?.config ?? DEFAULT_CHESS_APPEARANCE;
  // §26: an OS-level reduced-motion preference turns animation off — unless
  // the user has explicitly set their own board preference (any field),
  // which is taken as intentional and left alone.
  const animationEnabled =
    prefersReducedMotion && data?.source !== "user" ? false : config.animationEnabled;

  usePieceRecolorStyle(config.pieceSetId, config.pieceColorWhite, config.pieceColorBlack);
  useSoundSettingsSync(config.soundThemeId, config.soundEnabled, config.soundVolume);

  const { mutate: mutateUpdate } = updateMutation;
  const { mutate: mutateReset } = resetMutation;

  const updatePreference = useCallback(
    (override: ChessAppearanceOverride) => mutateUpdate({ settings: override }),
    [mutateUpdate],
  );

  const resetPreference = useCallback(
    () => mutateReset(),
    [mutateReset],
  );

  const value = useMemo<ChessAppearanceContextValue>(
    () => ({
      currentBoardTheme: config.boardThemeId,
      currentPieceSet: config.pieceSetId,
      showCoordinates: config.showCoordinates,
      boardOrientation: config.boardOrientation,
      animationEnabled,
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
      locked: data?.locked ?? false,
      isLoading,
      updatePreference,
      resetPreference,
    }),
    [config, animationEnabled, data?.locked, isLoading, updatePreference, resetPreference],
  );

  return (
    <ChessAppearanceContext.Provider value={value}>{children}</ChessAppearanceContext.Provider>
  );
}

export function useChessAppearance(): ChessAppearanceContextValue {
  const ctx = useContext(ChessAppearanceContext);
  if (!ctx) {
    throw new Error("useChessAppearance must be used within a ChessAppearanceProvider");
  }
  return ctx;
}
