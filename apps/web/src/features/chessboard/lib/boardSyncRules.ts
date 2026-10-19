import { sanitizeCastlingRights } from "@nexa-chess/types";
import { Chess } from "@/lib/chess";
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
 * Role comes from LiveKit participant metadata, which the server signs into the
 * access token. Students are issued `canUpdateOwnMetadata: false`, so this
 * cannot be forged client-side.
 */
export function isCoachParticipant(from?: { metadata?: string }) {
  if (!from?.metadata) return false;
  try {
    return JSON.parse(from.metadata).role === "COACH";
  } catch {
    return false;
  }
}

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
 * Placement, side to move and castling. The move counters don't make a
 * different position, and the en-passant field is left out because chess
 * libraries disagree on writing it when no capture is possible.
 */
function positionKey(fen: string) {
  return sanitizeCastlingRights(fen.trim()).split(/\s+/).slice(0, 3).join(" ");
}

/**
 * The legal move from `fromFen` that reaches `toFen`, or null. Lets a receiver
 * replay a controlling student's move on its own tree instead of loading the
 * PGN/tree the packet carries.
 */
export function legalMoveBetween(
  fromFen: string | undefined,
  toFen: string | undefined
): { from: string; to: string; promotion?: string } | null {
  if (!fromFen || !toFen) return null;
  try {
    const target = positionKey(toFen);
    const move = new Chess(fromFen)
      .moves({ verbose: true })
      .find((candidate) => positionKey(candidate.after) === target);
    return move ? { from: move.from, to: move.to, promotion: move.promotion } : null;
  } catch {
    return null;
  }
}

/**
 * True when `toFen` is exactly one legal move away from `fromFen` — chess
 * rules, whose turn it is and all. A student's MOVE packet is checked with this
 * against the receiver's own board, so a control holder can play a move but
 * cannot teleport pieces or skip the other side's turn by hand-crafting a FEN.
 */
export function isOneLegalMoveAway(fromFen: string | undefined, toFen: string | undefined): boolean {
  if (!fromFen || !toFen) return false;
  try {
    const chess = new Chess(fromFen);
    const target = positionKey(toFen);
    return chess.moves({ verbose: true }).some((move) => positionKey(move.after) === target);
  } catch {
    return false;
  }
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
 *   packet. A student's MOVE must also be one legal move from the position
 *   the receiver is showing (`isLegalMove`), so "both" means "either colour,
 *   on its turn" rather than "anything". `UNDO`/`REDO` reposition the shared line rather than play a colour,
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
  /**
   * MOVE only: whether the packet's position is one legal move from the
   * receiver's current board (`isOneLegalMoveAway`). Omitted = not checked.
   */
  isLegalMove?: boolean;
}): boolean {
  const {
    type,
    fromIdentity,
    isFromCoach,
    permissionMode,
    selectedStudentIds,
    selectedStudentSides,
    moverColor,
    isLegalMove,
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
  if (type !== "MOVE") return true;
  if (isLegalMove === false) return false;
  return side === "both" || moverColor === side;
}
