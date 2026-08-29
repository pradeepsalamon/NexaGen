import type { BoardPermissionMode, BoardSyncMessage } from "../types/sync";

/**
 * Board-sync messages that mutate shared board state. Kept as a set so the
 * receiver can reject spoofed state pushes — students hold `canPublishData`,
 * so without a check any participant could drive the board (AUDIT C7).
 *
 * `REQUEST_SYNC` / `REQUEST_CONTROL` are intentionally absent: they are
 * requests, not commands, and students are expected to send them.
 */
export const MUTATING_MESSAGE_TYPES = new Set<BoardSyncMessage["type"]>([
  "MOVE",
  "UNDO",
  "REDO",
  "RESET",
  "FORCE_SYNC",
  "UPDATE_ANNOTATIONS",
  "UPDATE_PERMISSIONS",
  "SET_UI_STATE",
  "SET_CLOCK",
]);

/**
 * Piece-movement messages a student may emit *when the coach has handed them
 * control*. Everything else (annotations, permissions, clock, full re-sync,
 * reset, UI state) stays coach-only regardless of control.
 */
const CONTROL_MESSAGE_TYPES = new Set<BoardSyncMessage["type"]>([
  "MOVE",
  "UNDO",
  "REDO",
]);

/**
 * Authoritative check, run on every received board-sync message: may the
 * participant it came from apply this change to our board?
 *
 * - The coach always may (role is signed into LiveKit metadata, unforgeable —
 *   students are issued `canUpdateOwnMetadata: false`).
 * - A non-coach may only send piece moves, and only while they currently hold
 *   control per the last `UPDATE_PERMISSIONS` we processed: `EVERYONE`, or
 *   `SELECTED_STUDENT` where they are the selected identity.
 *
 * `fromIdentity` and `selectedStudentId` are both **full LiveKit participant
 * identities** (`${userId}_${clientId}`).
 */
export function senderMayMutateBoard(params: {
  type: BoardSyncMessage["type"];
  fromIdentity: string | undefined;
  isFromCoach: boolean;
  permissionMode: BoardPermissionMode;
  selectedStudentId: string | undefined;
}): boolean {
  const { type, fromIdentity, isFromCoach, permissionMode, selectedStudentId } = params;

  if (!MUTATING_MESSAGE_TYPES.has(type)) return true;
  if (isFromCoach) return true;
  if (!CONTROL_MESSAGE_TYPES.has(type)) return false;
  if (!fromIdentity) return false;

  if (permissionMode === "EVERYONE") return true;
  if (permissionMode === "SELECTED_STUDENT") {
    return !!selectedStudentId && fromIdentity === selectedStudentId;
  }
  return false;
}
