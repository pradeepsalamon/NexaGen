"use client";

import { useEffect } from "react";
import { buildRecoloredPieceCss } from "./recolorPieces";

const STYLE_TAG_ID = "nexa-piece-recolor-style";

function getStyleTag(): HTMLStyleElement {
  let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  return tag;
}

/**
 * Builds and injects the recolored-piece CSS (see `recolorPieces.ts`) for the
 * given piece set + custom colors into one shared `<style>` tag.
 *
 * Both the real app-wide `ChessAppearanceProvider` and a settings page's
 * `ChessAppearancePreviewScope` call this with their own (saved vs. draft)
 * values, so the draft preview board updates live as a color is picked.
 * They share one tag — last effect to run wins — which is correct for every
 * current layout (a settings page never also renders a *different-colored*
 * saved board using the same piece set beside its own preview).
 */
export function usePieceRecolorStyle(
  pieceSetId: string,
  whiteColor: string | null | undefined,
  blackColor: string | null | undefined,
) {
  useEffect(() => {
    if (!whiteColor && !blackColor) return;
    let cancelled = false;
    buildRecoloredPieceCss(pieceSetId, whiteColor, blackColor).then((css) => {
      if (cancelled || !css) return;
      getStyleTag().textContent = css;
    });
    return () => {
      cancelled = true;
    };
  }, [pieceSetId, whiteColor, blackColor]);
}
