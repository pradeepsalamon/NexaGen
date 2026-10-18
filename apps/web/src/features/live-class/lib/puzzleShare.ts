import type { createBoardStore } from "@/features/chessboard/store/createBoardStore";
import { Chess } from "@/lib/chess";

type BoardStoreApi = ReturnType<typeof createBoardStore>;

/**
 * Puts a shared puzzle's starting position on the coach's shared board: the
 * exact FEN the API assigned (side to move included) and the solver's side at
 * the bottom. The board's own sync then sends it to every student and the
 * board-state save keeps it for late joiners. Throws — leaving the board as it
 * was — when the position won't load.
 */
export function putPuzzleOnBoard(store: BoardStoreApi, fen: string, orientation: "white" | "black") {
  const position = new Chess(fen).fen(); // throws on an invalid FEN
  store.getState().pushHistory(position, "");
  if (store.getState().fen !== position) throw new Error("The board could not load that position.");
  store.getState().setOrientation(orientation);
}

const latestShare = new Map<string, number>();

/**
 * Starts a share for `classId` and returns "is this still the newest share?".
 * Shares from the dialog and the Share-next shortcuts all claim here, so a
 * slower, older one finishing late never loads its position over a newer one.
 */
export function claimBoardForShare(classId: string): () => boolean {
  const ticket = (latestShare.get(classId) ?? 0) + 1;
  latestShare.set(classId, ticket);
  return () => latestShare.get(classId) === ticket;
}
