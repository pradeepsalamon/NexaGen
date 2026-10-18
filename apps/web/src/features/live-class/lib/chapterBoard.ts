import type { LiveClassChapterState } from "@nexa-chess/types";
import { create } from "zustand";
import { toLiveBoardState } from "@/features/chessboard/lib/boardSnapshot";
import { moveTreeFromPgn, type BoardStore } from "@/features/chessboard/store/createBoardStore";

/** What a chapter keeps of the board: the durable snapshot minus clock and UI tab. */
export function chapterStateFromBoard(board: BoardStore): LiveClassChapterState {
  const { activeTab: _tab, clock: _clock, savedAt: _savedAt, ...state } = toLiveBoardState(board);
  return state;
}

/**
 * The part of a board that "unsaved changes" is about: the moves (and the
 * start position when there are none). Stepping through history, flipping or
 * drawing an arrow doesn't count.
 */
export function chapterSignature(state: Pick<LiveClassChapterState, "fen" | "pgn" | "treePgn">): string {
  return `${state.pgn || state.fen}\n${state.treePgn ?? ""}`;
}

/** True when the board holds moves of its own — something a load would throw away. */
export function boardHasMoves(board: BoardStore): boolean {
  return board.tree.children.length > 0;
}

/**
 * Puts a chapter on the coach's board through ordinary local actions, so the
 * board's own sync carries it to every student (and the board-state save keeps
 * it across a refresh). Throws when the saved PGN no longer parses.
 */
export function loadChapterOnBoard(board: BoardStore, state: LiveClassChapterState) {
  const tree = moveTreeFromPgn(state.treePgn || state.pgn, state.fen);
  if (!tree) throw new Error("This chapter's moves could not be read.");
  board.loadTree(tree, state.treePgn ? state.treeLinePath : undefined, state.historyIndex);
  board.setOrientation(state.orientation);
  board.setAnnotations(state.arrows, state.squares);
}

/**
 * Which chapter is on the coach's board, and the board signature it was
 * loaded or saved with — anything else is unsaved work. Per browser tab, in
 * memory: the sidebar can unmount (stage switch, resize) without losing it.
 */
type ChapterSelection = {
  classId: string | null;
  chapterId: string | null;
  baseline: string | null;
  select: (classId: string, chapterId: string | null, baseline: string | null) => void;
};

export const useChapterSelection = create<ChapterSelection>((set) => ({
  baseline: null,
  chapterId: null,
  classId: null,
  select: (classId, chapterId, baseline) => set({ baseline, chapterId, classId })
}));
