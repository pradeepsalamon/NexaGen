"use client";

import { useLiveBoardSync } from "../../hooks/useLiveBoardSync";

/**
 * Invisible bridge component that activates the board sync hook.
 * Must be rendered inside both <BoardProvider> and <LiveClassProvider>.
 * 
 * We use a component instead of just calling the hook in LiveChessboardPanel
 * because the hook needs to be inside the BoardProvider's React tree to
 * access the board store via context.
 */
export function LiveBoardSyncBridge() {
  useLiveBoardSync();
  return null;
}
