"use client";

import type { ReactNode } from "react";
import {
  BoardSyncContext,
  useBoardSyncEngine,
} from "@/features/chessboard/hooks/useBoardSync";
import { useLiveBoardSyncBridge } from "../../hooks/useLiveBoardSync";

/**
 * Runs the board sync engine exactly once and provides its actions to the
 * subtree. Must be rendered inside both <BoardProvider> and <LiveKitRoom>
 * (and, for the permission bridge, <LiveClassProvider>).
 */
export function LiveBoardSyncBridge({ children }: { children: ReactNode }) {
  const actions = useBoardSyncEngine();
  useLiveBoardSyncBridge(actions);
  return (
    <BoardSyncContext.Provider value={actions}>{children}</BoardSyncContext.Provider>
  );
}
