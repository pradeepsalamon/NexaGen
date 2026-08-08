import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BoardPermissionMode } from "../types/sync";

interface BoardState {
  // Game State
  fen: string;
  pgn: string;
  history: string[]; // FEN history
  historyIndex: number;
  
  // Board Presentation
  orientation: "white" | "black";
  boardTheme: string;
  pieceTheme: string;
  showCoordinates: boolean;
  soundEnabled: boolean;
  lastMoveType?: "move" | "capture" | "check" | "gameEnd";

  
  // Annotations
  arrows: string[][];
  squareStyles: Record<string, { background?: string, borderRadius?: string }>;
  
  // Permissions
  permissionMode: BoardPermissionMode;
  selectedStudentId?: string; // For 1-on-1 mode
  isSetupPositionOpen: boolean;

  // Actions
  setFen: (fen: string) => void;
  setPgn: (pgn: string) => void;
  pushHistory: (fen: string, pgn: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  
  setOrientation: (orientation: "white" | "black") => void;
  setThemes: (board: string, piece: string) => void;
  toggleCoordinates: () => void;
  toggleSound: () => void;
  setLastMoveType: (type: "move" | "capture" | "check" | "gameEnd" | undefined) => void;

  
  setAnnotations: (arrows: string[][], squares: Record<string, any>) => void;
  clearAnnotations: () => void;
  
  setPermissionMode: (mode: BoardPermissionMode, studentId?: string) => void;
  setIsSetupPositionOpen: (open: boolean) => void;
  
  syncFromRemote: (payload: Partial<BoardState>) => void;
}

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      fen: INITIAL_FEN,
      pgn: "",
      history: [INITIAL_FEN],
      historyIndex: 0,
      
      orientation: "white",
      boardTheme: "blue",
      pieceTheme: "cburnett", // Standard lichess piece theme
      showCoordinates: true,
      soundEnabled: true,
      lastMoveType: undefined,

      
      arrows: [],
      squareStyles: {},
      
      permissionMode: "COACH_ONLY",
      selectedStudentId: undefined,
      isSetupPositionOpen: false,
      
      setFen: (fen) => set({ fen }),
      setPgn: (pgn) => set({ pgn }),
      
      pushHistory: (fen, pgn) => set((state) => {
        // If we are viewing history and make a new move, truncate the future
        const newHistory = state.history.slice(0, state.historyIndex + 1);
        newHistory.push(fen);
        return {
          fen,
          pgn,
          history: newHistory,
          historyIndex: newHistory.length - 1
        };
      }),
      
      undo: () => set((state) => {
        if (state.historyIndex > 0) {
          const newIndex = state.historyIndex - 1;
          return {
            historyIndex: newIndex,
            fen: state.history[newIndex]
            // Note: properly syncing PGN for undo requires a robust chess.js integration
            // which will be handled in the UI layer calling this.
          };
        }
        return state;
      }),
      
      redo: () => set((state) => {
        if (state.historyIndex < state.history.length - 1) {
          const newIndex = state.historyIndex + 1;
          return {
            historyIndex: newIndex,
            fen: state.history[newIndex]
          };
        }
        return state;
      }),
      
      reset: () => set({
        fen: INITIAL_FEN,
        pgn: "",
        history: [INITIAL_FEN],
        historyIndex: 0,
        arrows: [],
        squareStyles: {}
      }),
      
      setOrientation: (orientation) => set({ orientation }),
      setThemes: (boardTheme, pieceTheme) => set({ boardTheme, pieceTheme }),
      toggleCoordinates: () => set((state) => ({ showCoordinates: !state.showCoordinates })),
      toggleSound: () => {
        set((state) => {
          const enabled = !state.soundEnabled;
          import("../audio/sounds").then((mod) => mod.setSoundEnabled(enabled));
          return { soundEnabled: enabled };
        });
      },
      setLastMoveType: (type) => set({ lastMoveType: type }),

      
      setAnnotations: (arrows, squares) => set({ arrows, squareStyles: squares }),
      clearAnnotations: () => set({ arrows: [], squareStyles: {} }),
      
      setPermissionMode: (permissionMode, selectedStudentId) => set({ permissionMode, selectedStudentId }),
      setIsSetupPositionOpen: (open) => set({ isSetupPositionOpen: open }),
      
      syncFromRemote: (payload) => set((state) => ({ ...state, ...payload }))
    }),
    {
      name: "nexa-chess-board-preferences",
      partialize: (state) => ({
        boardTheme: state.boardTheme,
        pieceTheme: state.pieceTheme,
        showCoordinates: state.showCoordinates,
        soundEnabled: state.soundEnabled,
      }),
    }
  )
);
