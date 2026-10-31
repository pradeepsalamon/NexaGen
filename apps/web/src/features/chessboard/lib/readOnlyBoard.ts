import type { LiveBoardState } from "@nexa-chess/types";
import type { BoardColor, BoardControlSide, BoardPermissionMode, BoardSyncMessage } from "../types/sync";
import { isCoachParticipant, isOneAllowedMoveAway, moverColorFromFen, senderMayMutateBoard } from "./boardSyncRules";

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
  /**
   * Who may move, from the coach's `UPDATE_PERMISSIONS`. Not shown — kept so a
   * student's packet is held to the same rule a classmate's board applies.
   */
  permissionMode?: BoardPermissionMode;
  selectedStudentIds?: string[];
  selectedStudentSides?: Record<string, BoardControlSide>;
  /** The coach's "Allow Illegal Moves", from the same packet. */
  allowIllegalMoves?: boolean;
};

/** The LiveKit envelope's sender, never the payload. */
export type ReadOnlyBoardSender = { identity?: string; metadata?: string } | undefined;

export const READ_ONLY_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const INITIAL_READ_ONLY_BOARD: ReadOnlyBoardState = {
  fen: READ_ONLY_START_FEN,
  orientation: "white",
  arrows: [],
  squares: {},
};

/**
 * The saved board (`LiveSession.boardState`) as a read-only viewer's starting
 * point. Grants are deliberately not part of a snapshot: a student's move is
 * held back until the coach's next `UPDATE_PERMISSIONS` restates who controls.
 */
export function readOnlyBoardFromSnapshot(snapshot: LiveBoardState | null | undefined): ReadOnlyBoardState {
  if (!snapshot) return INITIAL_READ_ONLY_BOARD;
  return {
    arrows: snapshot.arrows,
    fen: snapshot.fen,
    orientation: snapshot.orientation,
    squares: snapshot.squares,
  };
}

/**
 * Applies one `board_sync` packet. Returns `prev` unchanged for messages that
 * don't affect what is shown (clock, UI state) and for any packet its sender
 * may not send: students hold `canPublishData`, so without this check anyone in
 * the room could rewrite the board the recording and an admin's seat show.
 */
export function reduceReadOnlyBoard(
  prev: ReadOnlyBoardState,
  msg: BoardSyncMessage,
  from: ReadOnlyBoardSender,
): ReadOnlyBoardState {
  const isFromCoach = isCoachParticipant(from);
  if (
    !senderMayMutateBoard({
      type: msg.type,
      fromIdentity: from?.identity,
      isFromCoach,
      permissionMode: prev.permissionMode ?? "COACH_ONLY",
      selectedStudentIds: prev.selectedStudentIds ?? [],
      selectedStudentSides: prev.selectedStudentSides,
      moverColor: msg.type === "MOVE" ? moverColorFromFen(msg.payload?.fen) : undefined,
      isLegalMove:
        msg.type === "MOVE" && !isFromCoach
          ? isOneAllowedMoveAway(prev.fen, msg.payload?.fen, prev.allowIllegalMoves)
          : undefined,
    })
  ) {
    return prev;
  }
  // A controlling student changes only the position, and only by one legal
  // ply (or free move, while allowed): forward for a MOVE (checked above),
  // either way for UNDO/REDO. This
  // board keeps no line to check a longer jump against, so it waits for the
  // coach's next packet instead.
  if (!isFromCoach && (msg.type === "MOVE" || msg.type === "UNDO" || msg.type === "REDO")) {
    const fen = msg.payload?.fen;
    if (!fen) return prev;
    if (
      msg.type !== "MOVE" &&
      !isOneAllowedMoveAway(prev.fen, fen, prev.allowIllegalMoves) &&
      !isOneAllowedMoveAway(fen, prev.fen, prev.allowIllegalMoves)
    ) {
      return prev;
    }
    return { ...prev, fen };
  }

  switch (msg.type) {
    case "MOVE":
    case "UNDO":
    case "REDO":
    case "RESET":
    case "FORCE_SYNC": {
      const p = msg.payload;
      if (!p?.fen) return prev;
      return {
        ...prev,
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
    case "UPDATE_PERMISSIONS": {
      const p = msg.payload;
      if (!p?.mode) return prev;
      return {
        ...prev,
        permissionMode: p.mode,
        selectedStudentIds: p.selectedStudentIds ?? [],
        selectedStudentSides: p.selectedStudentSides ?? {},
        allowIllegalMoves: p.allowIllegalMoves === true,
      };
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
