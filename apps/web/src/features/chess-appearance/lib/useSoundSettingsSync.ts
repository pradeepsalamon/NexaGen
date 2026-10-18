"use client";

import { useEffect } from "react";
import { setSoundEnabled, setSoundTheme, setSoundVolume } from "@/features/chessboard/audio/sounds";

/**
 * Pushes the resolved sound theme/enabled/volume into the `sounds.ts` module
 * (a plain side-effect surface, not React state, so `createBoardStore.ts` can
 * call `playSound` without depending on React) whenever they change. Called
 * from both the real app-wide `ChessAppearanceProvider` and a settings page's
 * `ChessAppearancePreviewScope`, same pattern as `usePieceRecolorStyle`.
 */
export function useSoundSettingsSync(themeId: string, enabled: boolean, volume: number) {
  useEffect(() => {
    setSoundTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    setSoundEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    setSoundVolume(volume);
  }, [volume]);
}
