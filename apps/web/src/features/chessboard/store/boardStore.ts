import { create } from "zustand";
import { persist } from "zustand/middleware";

type MoveSoundType = "move" | "capture" | "check" | "gameEnd";

/**
 * App-wide, persisted board **preferences** — the only state that outlives a
 * single meeting room. Game state, history, annotations and permissions live in
 * the per-room store created by `createBoardStore.ts`.
 *
 * `lastMoveType` is the one non-preference field: a transient sound cue written
 * by the active board store and read by the LiveKit sync layer. It is not
 * persisted (see `partialize`). Previously this store also carried a full,
 * unused copy of the game state with a half-finished `undo` (AUDIT L2).
 */
interface BoardPreferencesState {
  boardTheme: string;
  pieceTheme: string;
  showCoordinates: boolean;
  soundEnabled: boolean;
  lastMoveType?: MoveSoundType;

  setThemes: (board: string, piece: string) => void;
  toggleCoordinates: () => void;
  toggleSound: () => void;
  setLastMoveType: (type: MoveSoundType | undefined) => void;
}

export const useBoardStore = create<BoardPreferencesState>()(
  persist(
    (set) => ({
      boardTheme: "blue",
      pieceTheme: "cburnett", // Standard lichess piece theme
      showCoordinates: true,
      soundEnabled: true,
      lastMoveType: undefined,

      setThemes: (boardTheme, pieceTheme) => set({ boardTheme, pieceTheme }),
      toggleCoordinates: () =>
        set((state) => ({ showCoordinates: !state.showCoordinates })),
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
        boardTheme: state.boardTheme,
        pieceTheme: state.pieceTheme,
        showCoordinates: state.showCoordinates,
        soundEnabled: state.soundEnabled
      })
    }
  )
);
