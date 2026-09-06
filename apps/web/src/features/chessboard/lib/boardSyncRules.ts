import type {
  BoardColor,
  BoardControlSide,
  BoardPermissionMode,
  BoardSyncMessage,
} from "../types/sync";

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
 * Which side(s) a participant may currently move, or `null` for "none".
 *
 * `EVERYONE` hands both colours to the room. Under `SELECTED_STUDENT` the
 * grant is per identity: the coach can put one student on white and another on
 * black. A granted identity with no recorded side falls back to `"both"` — that
 * covers permission syncs from clients predating per-side control.
 */
export function controlSideForIdentity(params: {
  identity: string | undefined;
  permissionMode: BoardPermissionMode;
  selectedStudentIds: string[];
  selectedStudentSides?: Record<string, BoardControlSide>;
}): BoardControlSide | null {
  const { identity, permissionMode, selectedStudentIds, selectedStudentSides } = params;

  if (permissionMode === "EVERYONE") return "both";
  if (permissionMode !== "SELECTED_STUDENT") return null;
  if (!identity || !selectedStudentIds.includes(identity)) return null;
  return selectedStudentSides?.[identity] ?? "both";
}

/** The colour that played the move leading to `fen` (post-move position). */
export function moverColorFromFen(fen: string | undefined): BoardColor | undefined {
  const sideToMove = fen?.trim().split(/\s+/)[1];
  if (sideToMove === "w") return "black";
  if (sideToMove === "b") return "white";
  return undefined;
}

/**
 * Authoritative check, run on every received board-sync message: may the
 * participant it came from apply this change to our board?
 *
 * - The coach always may (role is signed into LiveKit metadata, unforgeable —
 *   students are issued `canUpdateOwnMetadata: false`).
 * - A non-coach may only send piece movement, and only while they currently
 *   hold control per the last `UPDATE_PERMISSIONS` we processed.
 * - A student granted a single colour may only push moves *made by that
 *   colour*. `moverColor` is derived from the post-move FEN by the caller, so a
 *   white-only student cannot drive black's pieces even by hand-crafting a
 *   packet. `UNDO`/`REDO` reposition the shared line rather than play a colour,
 *   so they stay open to any control holder.
 *
 * `fromIdentity` and every entry in `selectedStudentIds` are **full LiveKit
 * participant identities** (`${userId}_${clientId}`).
 */
export function senderMayMutateBoard(params: {
  type: BoardSyncMessage["type"];
  fromIdentity: string | undefined;
  isFromCoach: boolean;
  permissionMode: BoardPermissionMode;
  selectedStudentIds: string[];
  selectedStudentSides?: Record<string, BoardControlSide>;
  /** Colour that played the incoming move (MOVE only). */
  moverColor?: BoardColor;
}): boolean {
  const {
    type,
    fromIdentity,
    isFromCoach,
    permissionMode,
    selectedStudentIds,
    selectedStudentSides,
    moverColor,
  } = params;

  if (!MUTATING_MESSAGE_TYPES.has(type)) return true;
  if (isFromCoach) return true;
  if (!CONTROL_MESSAGE_TYPES.has(type)) return false;
  if (!fromIdentity) return false;

  const side = controlSideForIdentity({
    identity: fromIdentity,
    permissionMode,
    selectedStudentIds,
    selectedStudentSides,
  });
  if (!side) return false;
  if (side === "both" || type !== "MOVE") return true;
  return moverColor === side;
}
