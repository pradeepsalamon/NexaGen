import type { BoardColor, BoardSyncMessage } from "../types/sync";

/**
 * What a passive viewer of the live board needs: the egress recorder and an
 * admin's spectator seat. Both only ever *receive* `board_sync` packets, so
 * they keep this small state instead of a full `createBoardStore`.
 */
export type ReadOnlyBoardState = {
  fen: string;
  orientation: BoardColor;
  arrows: string[][];
  squares: Record<string, string>;
};

export const READ_ONLY_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const INITIAL_READ_ONLY_BOARD: ReadOnlyBoardState = {
  fen: READ_ONLY_START_FEN,
  orientation: "white",
  arrows: [],
  squares: {},
};

/**
 * Applies one `board_sync` packet. Returns `prev` unchanged for messages that
 * don't affect what is shown (permissions, clock, UI state).
 */
export function reduceReadOnlyBoard(prev: ReadOnlyBoardState, msg: BoardSyncMessage): ReadOnlyBoardState {
  switch (msg.type) {
    case "MOVE":
    case "UNDO":
    case "REDO":
    case "RESET":
    case "FORCE_SYNC": {
      const p = msg.payload;
      if (!p?.fen) return prev;
      return {
        fen: p.fen,
        orientation: p.orientation ?? prev.orientation,
        arrows: Array.isArray(p.arrows) ? p.arrows : prev.arrows,
        squares: p.squares ?? prev.squares,
      };
    }
    case "UPDATE_ANNOTATIONS": {
      const p = msg.payload;
      if (!p) return prev;
      return { ...prev, arrows: p.arrows ?? [], squares: p.squares ?? {} };
    }
    default:
      return prev;
  }
}

/** Decodes a `board_sync` packet; null for anything malformed. */
export function decodeBoardSyncPacket(payload: Uint8Array): BoardSyncMessage | null {
  try {
    const msg = JSON.parse(new TextDecoder().decode(payload)) as BoardSyncMessage;
    return msg && typeof msg === "object" && typeof msg.type === "string" ? msg : null;
  } catch {
    return null;
  }
}
