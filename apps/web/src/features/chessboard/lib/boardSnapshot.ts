import {
  moveTreeHasVariations,
  moveTreeToPgn,
  type LiveBoardState,
  type MoveTree,
} from "@nexa-chess/types";
import type { BoardState } from "../store/createBoardStore";

function hasComments(tree: MoveTree): boolean {
  if (tree.rootComment) return true;
  const walk = (level: MoveTree["children"]): boolean =>
    level.some((n) => Boolean(n.comment || n.preComment || n.nags?.length) || walk(n.children));
  return walk(tree.children);
}

/**
 * The tree as PGN when it carries more than the selected line does
 * (variations or comments); undefined otherwise, so a single-line board sends
 * exactly what it always has and older clients see no difference.
 */
export function treePgnForSync(tree: MoveTree): string | undefined {
  if (!moveTreeHasVariations(tree) && !hasComments(tree)) return undefined;
  return moveTreeToPgn(tree);
}

/** The shared, durable part of the board — what FORCE_SYNC sends and what is saved. */
export function toLiveBoardState(s: BoardState): LiveBoardState {
  const treePgn = treePgnForSync(s.tree);
  return {
    fen: s.fen,
    pgn: s.fullPgn || s.pgn,
    historyIndex: s.historyIndex,
    orientation: s.orientation,
    arrows: s.arrows,
    squares: s.squareStyles,
    activeTab: s.activeTab,
    clock: s.clock,
    ...(treePgn ? { treePgn, treeLinePath: s.treeLinePath } : {}),
    gameId: s.gameId,
    savedAt: Date.now(),
  };
}

/** True when a change between two states is worth saving. */
export function boardStateChanged(a: BoardState, b: BoardState) {
  return (
    a.fen !== b.fen ||
    a.pgn !== b.pgn ||
    a.fullPgn !== b.fullPgn ||
    a.historyIndex !== b.historyIndex ||
    a.tree !== b.tree ||
    a.treeLinePath !== b.treeLinePath ||
    a.orientation !== b.orientation ||
    a.arrows !== b.arrows ||
    a.squareStyles !== b.squareStyles ||
    a.activeTab !== b.activeTab ||
    a.clock !== b.clock
  );
}

/** Store fields to apply when restoring a saved snapshot. */
export function fromLiveBoardState(
  state: LiveBoardState,
): Partial<BoardState> & { treePgn?: string } {
  return {
    fen: state.fen,
    pgn: state.pgn,
    historyIndex: state.historyIndex,
    orientation: state.orientation,
    arrows: state.arrows,
    squareStyles: state.squares,
    ...(state.treePgn ? { treePgn: state.treePgn, treeLinePath: state.treeLinePath } : {}),
    ...(state.gameId ? { gameId: state.gameId } : {}),
    ...(state.activeTab ? { activeTab: state.activeTab } : {}),
    ...(state.clock ? { clock: state.clock } : {}),
  };
}
