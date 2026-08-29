import type { StoreApi } from "zustand";
import type { BoardStore } from "../store/createBoardStore";
import type { ClockState } from "../types/sync";

/**
 * Minimal imperative hook onto the active room board store, exposed on
 * `window.__nexaBoard` **only** when the app is built/run with
 * `NEXT_PUBLIC_E2E=1`. Playwright uses it to drive and assert board sync
 * without fighting chessground's drag-and-drop. A no-op everywhere else.
 */
export interface BoardTestHarness {
  move: (from: string, to: string, promotion?: string) => boolean;
  fen: () => string;
  turn: () => "white" | "black";
  clock: () => ClockState;
  permission: () => { mode: string; selectedStudentId?: string };
  detach: () => void;
  resync: () => void;
  isDetached: () => boolean;
  setFen: (fen: string) => void;
  loadPgn: (pgn: string) => void;
  moveCount: () => number;
}

declare global {
  interface Window {
    __nexaBoard?: BoardTestHarness;
  }
}

export function installBoardTestHarness(store: StoreApi<BoardStore>): () => void {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_E2E !== "1") {
    return () => {};
  }
  window.__nexaBoard = {
    move: (from, to, promotion) => store.getState().makeMove(from, to, promotion),
    fen: () => store.getState().fen,
    turn: () => store.getState().turn,
    clock: () => store.getState().clock,
    permission: () => ({
      mode: store.getState().permissionMode,
      selectedStudentId: store.getState().selectedStudentId,
    }),
    detach: () => store.getState().detachBoard(),
    resync: () => store.getState().resyncBoard(),
    isDetached: () => store.getState().isDetached,
    setFen: (fen) => store.getState().pushHistory(fen, ""),
    loadPgn: (pgn) => {
      const s = store.getState();
      s.pushHistory(s.fen, pgn);
    },
    moveCount: () => store.getState().moveHistory.length,
  };
  return () => {
    delete window.__nexaBoard;
  };
}
