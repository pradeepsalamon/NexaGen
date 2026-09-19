import { create } from "zustand";
import { persist } from "zustand/middleware";

type MoveSoundType = "move" | "capture" | "check" | "gameEnd";

/**
 * App-wide, persisted board **preferences** — the only state that outlives a
 * single meeting room. Game state, history, annotations and permissions live in
 * the per-room store created by `createBoardStore.ts`. Board theme / piece
 * set / coordinates / animation / highlights live server-side in
 * `features/chess-appearance` (ChessAppearanceProvider) — this store no
 * longer duplicates them.
 *
 * `lastMoveType` is the one non-preference field: a transient sound cue written
 * by the active board store and read by the LiveKit sync layer. It is not
 * persisted (see `partialize`). Previously this store also carried a full,
 * unused copy of the game state with a half-finished `undo` (AUDIT L2).
 */
interface BoardPreferencesState {
  soundEnabled: boolean;
  lastMoveType?: MoveSoundType;

  toggleSound: () => void;
  setLastMoveType: (type: MoveSoundType | undefined) => void;
}

export const useBoardStore = create<BoardPreferencesState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      lastMoveType: undefined,

      toggleSound: () => {
        set((state) => {
          const enabled = !state.soundEnabled;
          import("../audio/sounds").then((mod) => mod.setSoundEnabled(enabled));
          return { soundEnabled: enabled };
        });
      },
      setLastMoveType: (type) => set({ lastMoveType: type })
    }),
    {
      name: "nexa-chess-board-preferences",
      partialize: (state) => ({
        soundEnabled: state.soundEnabled
      })
    }
  )
);
