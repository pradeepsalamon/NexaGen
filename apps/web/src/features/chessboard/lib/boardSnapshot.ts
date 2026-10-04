import type { LiveBoardState } from "@nexa-chess/types";
import type { BoardState } from "../store/createBoardStore";

/** The shared, durable part of the board — what FORCE_SYNC sends and what is saved. */
export function toLiveBoardState(s: BoardState): LiveBoardState {
  return {
    fen: s.fen,
    pgn: s.fullPgn || s.pgn,
    historyIndex: s.historyIndex,
    orientation: s.orientation,
    arrows: s.arrows,
    squares: s.squareStyles,
    activeTab: s.activeTab,
    clock: s.clock,
  };
}

/** True when a change between two states is worth saving. */
export function boardStateChanged(a: BoardState, b: BoardState) {
  return (
    a.fen !== b.fen ||
    a.pgn !== b.pgn ||
    a.fullPgn !== b.fullPgn ||
    a.historyIndex !== b.historyIndex ||
    a.orientation !== b.orientation ||
    a.arrows !== b.arrows ||
    a.squareStyles !== b.squareStyles ||
    a.activeTab !== b.activeTab ||
    a.clock !== b.clock
  );
}

/** Store fields to apply when restoring a saved snapshot. */
export function fromLiveBoardState(state: LiveBoardState): Partial<BoardState> {
  return {
    fen: state.fen,
    pgn: state.pgn,
    historyIndex: state.historyIndex,
    orientation: state.orientation,
    arrows: state.arrows,
    squareStyles: state.squares,
    ...(state.activeTab ? { activeTab: state.activeTab } : {}),
    ...(state.clock ? { clock: state.clock } : {}),
  };
}
