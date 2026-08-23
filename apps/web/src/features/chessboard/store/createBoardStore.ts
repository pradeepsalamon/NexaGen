import { createStore } from "zustand";
import { Chess, Move } from "chess.js";
import { BoardPermissionMode } from "../types/sync";
import { playSound, SoundType } from "../audio/sounds";
import { useBoardStore as usePersistedStore } from "./boardStore";

export interface BoardState {
  // Engine
  chess: Chess;
  fen: string;
  pgn: string;
  
  // Game Status
  isGameOver: boolean;
  turn: "white" | "black";
  
  // History & Variations (Future)
  moveHistory: Move[];
  historyIndex: number;
  
  // Board Presentation
  orientation: "white" | "black";
  boardTheme: string;
  pieceTheme: string;
  showCoordinates: boolean;
  
  // Annotations (Chessground format: Map of shapes)
  // For simplicity and sync, we store as raw arrays/objects which translate to chessground DrawShapes
  arrows: string[][]; // [["e2", "e4", "red"]]
  squareStyles: Record<string, string>; // { e4: "red" }
  
  // Permissions
  permissionMode: BoardPermissionMode;
  selectedStudentId?: string;
  
  // Settings
  animationDuration: number;
  highlightLastMove: boolean;
  
  // Editor & Interactions
  activeBrush: string; // e.g. "green", "red"
  isEditingPosition: boolean;
  pendingPromotion: { from: string, to: string } | null;
  isSetupPositionOpen: boolean;
  isDrawingMode: boolean;
}

export interface BoardActions {
  // Game Actions
  makeMove: (from: string, to: string, promotion?: string) => boolean;
  undo: () => void;
  redo: () => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;
  reset: () => void;
  setFen: (fen: string) => void;
  setPgn: (pgn: string) => void;
  pushHistory: (fen: string, pgn: string) => void;
  
  // UI Actions
  setOrientation: (orientation: "white" | "black") => void;
  setTheme: (board: string, piece: string) => void;
  
  // Annotations
  setAnnotations: (arrows: string[][], squares: Record<string, string>) => void;
  clearAnnotations: () => void;
  
  // Permissions
  setPermissionMode: (mode: BoardPermissionMode, studentId?: string) => void;
  
  // Sync
  syncFromRemote: (payload: Partial<BoardState>) => void;
  
  // Workspace interactions
  setActiveBrush: (brush: string) => void;
  setEditingPosition: (editing: boolean) => void;
  setPendingPromotion: (promo: { from: string, to: string } | null) => void;
  setShowCoordinates: (show: boolean) => void;
  setIsDrawingMode: (mode: boolean) => void;
  setIsSetupPositionOpen: (open: boolean) => void;
}

export type BoardStore = BoardState & BoardActions;

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const createBoardStore = () => {
  const chess = new Chess();
  
  return createStore<BoardStore>((set, get) => ({
    chess,
    fen: INITIAL_FEN,
    pgn: "",
    isGameOver: false,
    turn: "white",
    
    moveHistory: [],
    historyIndex: -1,
    
    orientation: "white",
    boardTheme: "blue",
    pieceTheme: "cburnett",
    showCoordinates: true,
    isDrawingMode: false,
    
    arrows: [],
    squareStyles: {},
    
    permissionMode: "COACH_ONLY",
    selectedStudentId: undefined,
    
    animationDuration: 200,
    highlightLastMove: true,
    
    activeBrush: "green",
    isEditingPosition: false,
    pendingPromotion: null,
    isSetupPositionOpen: false,
    
    makeMove: (from, to, promotion = 'q') => {
      const state = get();
      try {
        const move = state.chess.move({ from, to, promotion });
        if (move) {
          // Truncate history if we are in the past
          const newHistory = state.moveHistory.slice(0, state.historyIndex + 1);
          newHistory.push(move);
          
          const isGameOver = state.chess.isGameOver();
          const isCheck = state.chess.inCheck();
          
          let moveType: SoundType = "move";
          if (isGameOver) moveType = "gameEnd";
          else if (isCheck) moveType = "check";
          else if (move.captured) moveType = "capture";
          
          playSound(moveType);
          
          // Save lastMoveType to the persisted store so broadcastState can read it
          usePersistedStore.getState().setLastMoveType(moveType);
          
          set({
            fen: state.chess.fen(),
            pgn: state.chess.pgn(),
            isGameOver,
            turn: state.chess.turn() === 'w' ? 'white' : 'black',
            moveHistory: newHistory,
            historyIndex: newHistory.length - 1
          });
          return true;
        }

      } catch (e) {
        return false;
      }
      return false;
    },
    
    undo: () => {
      const state = get();
      if (state.historyIndex >= 0) {
        state.chess.undo();
        set({
          fen: state.chess.fen(),
          pgn: state.chess.pgn(),
          isGameOver: state.chess.isGameOver(),
          turn: state.chess.turn() === 'w' ? 'white' : 'black',
          historyIndex: state.historyIndex - 1
        });
      }
    },
    
    redo: () => {
      const state = get();
      if (state.historyIndex < state.moveHistory.length - 1) {
        const nextMove = state.moveHistory[state.historyIndex + 1];
        state.chess.move(nextMove);
        set({
          fen: state.chess.fen(),
          pgn: state.chess.pgn(),
          isGameOver: state.chess.isGameOver(),
          turn: state.chess.turn() === 'w' ? 'white' : 'black',
          historyIndex: state.historyIndex + 1
        });
      }
    },
    
    jumpToStart: () => {
      const state = get();
      if (state.historyIndex >= 0) {
        while (state.chess.undo()) {
          // undo all
        }
        set({
          fen: state.chess.fen(),
          pgn: state.chess.pgn(),
          isGameOver: state.chess.isGameOver(),
          turn: state.chess.turn() === 'w' ? 'white' : 'black',
          historyIndex: -1
        });
      }
    },
    
    jumpToEnd: () => {
      const state = get();
      if (state.historyIndex < state.moveHistory.length - 1) {
        for (let i = state.historyIndex + 1; i < state.moveHistory.length; i++) {
          state.chess.move(state.moveHistory[i]);
        }
        set({
          fen: state.chess.fen(),
          pgn: state.chess.pgn(),
          isGameOver: state.chess.isGameOver(),
          turn: state.chess.turn() === 'w' ? 'white' : 'black',
          historyIndex: state.moveHistory.length - 1
        });
      }
    },
    
    reset: () => {
      const state = get();
      state.chess.reset();
      set({
        fen: state.chess.fen(),
        pgn: "",
        isGameOver: false,
        turn: "white",
        moveHistory: [],
        historyIndex: -1,
        arrows: [],
        squareStyles: {}
      });
    },
    
    setFen: (fen) => {
      const state = get();
      try {
        state.chess.load(fen);
        set({
          fen: state.chess.fen(),
          pgn: state.chess.pgn(),
          isGameOver: state.chess.isGameOver(),
          turn: state.chess.turn() === 'w' ? 'white' : 'black',
          moveHistory: [], // reset history for new puzzle FEN
          historyIndex: -1
        });
      } catch (e) {
        console.warn("Invalid FEN", fen);
      }
    },
    
    setPgn: (pgn) => {
      const state = get();
      try {
        state.chess.loadPgn(pgn);
        set({
          fen: state.chess.fen(),
          pgn: state.chess.pgn(),
          isGameOver: state.chess.isGameOver(),
          turn: state.chess.turn() === 'w' ? 'white' : 'black',
          moveHistory: state.chess.history({ verbose: true }),
          historyIndex: state.chess.history().length - 1
        });
      } catch (e) {
        console.warn("Invalid PGN", pgn);
      }
    },

    pushHistory: (fen, pgn) => {
      const state = get();
      try {
        if (pgn) {
          state.chess.loadPgn(pgn);
        } else {
          state.chess.load(fen);
        }
        const moveHistory = state.chess.history({ verbose: true });
        set({
          fen: state.chess.fen(),
          pgn: state.chess.pgn(),
          isGameOver: state.chess.isGameOver(),
          turn: state.chess.turn() === 'w' ? 'white' : 'black',
          moveHistory,
          historyIndex: moveHistory.length - 1
        });
      } catch (e) {
        console.warn("Failed to load position", fen);
      }
    },
    
    setOrientation: (orientation) => set({ orientation }),
    setTheme: (boardTheme, pieceTheme) => set({ boardTheme, pieceTheme }),
    
    setAnnotations: (arrows, squares) => set({ arrows, squareStyles: squares }),
    clearAnnotations: () => set({ arrows: [], squareStyles: {} }),
    
    setPermissionMode: (mode, studentId) => set({ permissionMode: mode, selectedStudentId: studentId }),
    
    syncFromRemote: (payload) => {
      const state = get();
      // If FEN is updated remotely, update local chess.js instance
      if (payload.fen && payload.fen !== state.fen) {
        try {
          state.chess.load(payload.fen);
          // If they also sent PGN, try to load that to get full history
          if (payload.pgn) {
             state.chess.loadPgn(payload.pgn);
          }
          payload.turn = state.chess.turn() === 'w' ? 'white' : 'black';
          payload.isGameOver = state.chess.isGameOver();
          payload.moveHistory = state.chess.history({ verbose: true });
          payload.historyIndex = payload.moveHistory.length - 1;
        } catch (e) {
          console.warn("Failed to load synced FEN", payload.fen);
        }
      }
      
      // Play sound for incoming remote move
      if ((payload as any).moveType) {
        playSound((payload as any).moveType);
      }
      
      set({ ...payload });
    },

    
    setActiveBrush: (brush) => set({ activeBrush: brush }),
    setEditingPosition: (editing) => set({ isEditingPosition: editing }),
    setPendingPromotion: (promo) => set({ pendingPromotion: promo }),
    setShowCoordinates: (show) => set({ showCoordinates: show }),
    setIsDrawingMode: (mode) => set({ isDrawingMode: mode }),
    setIsSetupPositionOpen: (open) => set({ isSetupPositionOpen: open })
  }));
};
