import { create } from "zustand";

type MoveSoundType = "move" | "capture" | "check" | "gameEnd";

/**
 * App-wide board **preferences** — the only state that outlives a single
 * meeting room. Game state, history, annotations and permissions live in the
 * per-room store created by `createBoardStore.ts`. Board theme / piece set /
 * coordinates / animation / highlights / sound theme+volume+enabled all live
 * server-side in `features/chess-appearance` (ChessAppearanceProvider) — this
 * store doesn't duplicate them.
 *
 * `lastMoveType` is the one field here: a transient sound cue written by the
 * active board store and read by the LiveKit sync layer, so it's plain
 * (non-persisted) state rather than living in `features/chess-appearance`.
 * Previously this store also carried a full, unused copy of the game state
 * with a half-finished `undo` (AUDIT L2).
 */
interface BoardPreferencesState {
  lastMoveType?: MoveSoundType;
  setLastMoveType: (type: MoveSoundType | undefined) => void;
}

export const useBoardStore = create<BoardPreferencesState>()((set) => ({
  lastMoveType: undefined,
  setLastMoveType: (type) => set({ lastMoveType: type })
}));
