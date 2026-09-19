import { createStore } from "zustand";
import { Chess, Move } from "chess.js";
import { BoardControlSide, BoardPermissionMode, ClockState } from "../types/sync";
import { playSound, SoundType } from "../audio/sounds";
import {
  DEFAULT_CLOCK,
  applyMoveToClock,
  freezeClock,
} from "../lib/clock";
import { useBoardStore as usePersistedStore } from "./boardStore";

export interface BoardState {
  // Engine
  chess: Chess;
  fen: string;
  pgn: string;
  // The complete mainline PGN, independent of which ply is currently being
  // viewed. `pgn` follows the navigation cursor (chess.js truncates on `undo`),
  // so broadcasting `pgn` while stepped back loses the forward moves for
  // receivers. Broadcasts send `fullPgn` + `historyIndex` instead (AUDIT H21).
  fullPgn: string;

  // Game Status
  isGameOver: boolean;
  turn: "white" | "black";
  
  // History & Variations (Future)
  moveHistory: Move[];
  historyIndex: number;
  
  // Board Presentation
  // Theme/piece-set/coordinates/animation/highlight visuals now live in the
  // app-wide ChessAppearanceProvider (see features/chess-appearance) — this
  // store only keeps `orientation`, which is functional live-class state
  // (whose side renders at the bottom right now), not a cosmetic preference.
  orientation: "white" | "black";

  // Annotations (Chessground format: Map of shapes)
  // For simplicity and sync, we store as raw arrays/objects which translate to chessground DrawShapes
  arrows: string[][]; // [["e2", "e4", "red"]]
  squareStyles: Record<string, string>; // { e4: "red" }
  
  // Permissions
  permissionMode: BoardPermissionMode;
  /** Full LiveKit identities granted control while `permissionMode` is SELECTED_STUDENT. */
  selectedStudentIds: string[];
  /**
   * Per-identity side of that grant (`white` / `black` / `both`). An identity
   * present in `selectedStudentIds` but missing here is treated as `"both"`.
   */
  selectedStudentSides: Record<string, BoardControlSide>;

  // Editor & Interactions
  activeBrush: string; // e.g. "green", "red"
  isEditingPosition: boolean;
  pendingPromotion: { from: string, to: string } | null;
  isSetupPositionOpen: boolean;
  isDrawingMode: boolean;

  // Workspace UI (synced across clients)
  activeTab: string;

  // Shared chess clock (synced across clients via SET_CLOCK; coach-controlled).
  clock: ClockState;

  // Per-client: a student who has "detached" to explore their own line. While
  // true, incoming board-position syncs are ignored (permissions still apply)
  // and local moves are not broadcast. Always false for the coach.
  isDetached: boolean;

  // Bumped by every `syncFromRemote` call, and only by it. `useBoardSync`'s
  // store subscriber compares this against the previous state to tell whether
  // a given transition was remote-originated, instead of a `setTimeout`-cleared
  // ref — which raced when multiple remote messages landed close together
  // (AUDIT H20).
  remoteSyncId: number;
}

export interface BoardActions {
  // Game Actions
  makeMove: (from: string, to: string, promotion?: string) => boolean;
  undo: () => void;
  redo: () => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;
  jumpToPly: (index: number) => void;
  reset: () => void;
  setFen: (fen: string) => void;
  setPgn: (pgn: string) => void;
  pushHistory: (fen: string, pgn: string) => void;
  
  // UI Actions
  setOrientation: (orientation: "white" | "black") => void;

  // Annotations
  setAnnotations: (arrows: string[][], squares: Record<string, string>) => void;
  clearAnnotations: () => void;
  
  // Permissions
  setPermissionMode: (
    mode: BoardPermissionMode,
    studentIds?: string[],
    studentSides?: Record<string, BoardControlSide>,
  ) => void;

  // Clock (coach-controlled)
  setClock: (clock: ClockState) => void;
  configureClock: (opts: { initialMs: number; incrementMs: number }) => void;
  startClock: (color?: "white" | "black") => void;
  pauseClock: () => void;
  resetClock: () => void;

  // Detach / resync (student-local)
  detachBoard: () => void;
  resyncBoard: () => void;

  // Sync
  // `moveType` isn't board state to store — it's a one-shot cue for which sound
  // to play on this incoming remote move — so it rides alongside the payload
  // rather than living in `BoardState` (AUDIT H6).
  syncFromRemote: (payload: Partial<BoardState> & { moveType?: SoundType }) => void;
  
  // Workspace interactions
  setActiveBrush: (brush: string) => void;
  setEditingPosition: (editing: boolean) => void;
  setPendingPromotion: (promo: { from: string, to: string } | null) => void;
  setIsDrawingMode: (mode: boolean) => void;
  setIsSetupPositionOpen: (open: boolean) => void;

  // Workspace UI (synced across clients)
  setActiveTab: (tab: string) => void;
}

export type BoardStore = BoardState & BoardActions;

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const createBoardStore = () => {
  const chess = new Chess();

  return createStore<BoardStore>((set, get) => ({
    chess,
    fen: INITIAL_FEN,
    pgn: "",
    fullPgn: "",
    isGameOver: false,
    turn: "white",

    moveHistory: [],
    historyIndex: -1,

    orientation: "white",
    isDrawingMode: false,
    remoteSyncId: 0,

    arrows: [],
    squareStyles: {},

    permissionMode: "COACH_ONLY",
    selectedStudentIds: [],
    selectedStudentSides: {},

    activeBrush: "green",
    isEditingPosition: false,
    pendingPromotion: null,
    isSetupPositionOpen: false,

    activeTab: "moves",

    clock: { ...DEFAULT_CLOCK },
    isDetached: false,

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
            fullPgn: state.chess.pgn(),
            isGameOver,
            turn: state.chess.turn() === 'w' ? 'white' : 'black',
            moveHistory: newHistory,
            historyIndex: newHistory.length - 1,
            clock: applyMoveToClock(
              state.clock,
              move.color === 'w' ? 'white' : 'black',
              Date.now()
            )
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

    jumpToPly: (index) => {
      const state = get();
      const target = Math.max(-1, Math.min(index, state.moveHistory.length - 1));
      if (target === state.historyIndex) return;

      if (target > state.historyIndex) {
        // Replay moves forward from the current position
        for (let i = state.historyIndex + 1; i <= target; i++) {
          try {
            state.chess.move(state.moveHistory[i]);
          } catch (e) {
            break;
          }
        }
      } else {
        // Undo back to the target ply
        while (state.chess.history().length - 1 > target) {
          if (!state.chess.undo()) break;
        }
      }

      set({
        fen: state.chess.fen(),
        pgn: state.chess.pgn(),
        isGameOver: state.chess.isGameOver(),
        turn: state.chess.turn() === 'w' ? 'white' : 'black',
        historyIndex: target
      });
    },
    
    reset: () => {
      const state = get();
      state.chess.reset();
      set({
        fen: state.chess.fen(),
        pgn: "",
        fullPgn: "",
        isGameOver: false,
        turn: "white",
        moveHistory: [],
        historyIndex: -1,
        arrows: [],
        squareStyles: {},
        clock: {
          ...state.clock,
          whiteMs: state.clock.initialMs,
          blackMs: state.clock.initialMs,
          running: null,
          updatedAt: Date.now()
        }
      });
    },
    
    setFen: (fen) => {
      const state = get();
      try {
        state.chess.load(fen);
        set({
          fen: state.chess.fen(),
          pgn: state.chess.pgn(),
          fullPgn: state.chess.pgn(),
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
          fullPgn: state.chess.pgn(),
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
          fullPgn: state.chess.pgn(),
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

    setAnnotations: (arrows, squares) => set({ arrows, squareStyles: squares }),
    clearAnnotations: () => set({ arrows: [], squareStyles: {} }),
    
    setPermissionMode: (mode, studentIds, studentSides) =>
      set({
        permissionMode: mode,
        selectedStudentIds: studentIds ?? [],
        selectedStudentSides: studentSides ?? {},
      }),

    setClock: (clock) => set({ clock }),
    configureClock: ({ initialMs, incrementMs }) =>
      set({
        clock: {
          enabled: true,
          initialMs,
          incrementMs,
          whiteMs: initialMs,
          blackMs: initialMs,
          running: null,
          updatedAt: Date.now()
        }
      }),
    startClock: (color) => {
      const state = get();
      const now = Date.now();
      const frozen = freezeClock(state.clock, now);
      set({
        clock: {
          ...frozen,
          enabled: true,
          running: color ?? state.turn,
          updatedAt: now
        }
      });
    },
    pauseClock: () => set({ clock: freezeClock(get().clock, Date.now()) }),
    resetClock: () => {
      const state = get();
      set({
        clock: {
          ...state.clock,
          whiteMs: state.clock.initialMs,
          blackMs: state.clock.initialMs,
          running: null,
          updatedAt: Date.now()
        }
      });
    },

    detachBoard: () => set({ isDetached: true }),
    resyncBoard: () => set({ isDetached: false }),

    syncFromRemote: ({ moveType, ...payload }) => {
      const state = get();

      // A detached student follows their own line: apply only permission
      // changes and ignore board position / annotations / clock (Part D).
      if (state.isDetached) {
        if (!payload.permissionMode) return;
        set({
          permissionMode: payload.permissionMode,
          selectedStudentIds: payload.selectedStudentIds ?? [],
          selectedStudentSides: payload.selectedStudentSides ?? {},
          remoteSyncId: state.remoteSyncId + 1
        });
        return;
      }

      // The ply the sender is viewing within their mainline (AUDIT H21).
      const remotePly = payload.historyIndex;
      // If FEN is updated remotely, update local chess.js instance
      if (payload.fen && payload.fen !== state.fen) {
        try {
          if (payload.pgn) {
            // Load the sender's *full* mainline so our move list keeps every
            // ply, then step back to the ply they are actually viewing rather
            // than snapping to the end (AUDIT H21).
            state.chess.loadPgn(payload.pgn);
            const fullHistory = state.chess.history({ verbose: true });
            const remoteFullPgn = state.chess.pgn();
            const targetPly =
              typeof remotePly === "number"
                ? Math.max(-1, Math.min(remotePly, fullHistory.length - 1))
                : fullHistory.length - 1;
            while (state.chess.history().length - 1 > targetPly) {
              if (!state.chess.undo()) break;
            }
            payload.moveHistory = fullHistory;
            payload.historyIndex = targetPly;
            payload.fullPgn = remoteFullPgn;
            payload.pgn = state.chess.pgn();
          } else {
            state.chess.load(payload.fen);
            payload.moveHistory = state.chess.history({ verbose: true });
            payload.historyIndex = payload.moveHistory.length - 1;
            payload.pgn = state.chess.pgn();
            payload.fullPgn = state.chess.pgn();
          }
          payload.fen = state.chess.fen();
          payload.turn = state.chess.turn() === 'w' ? 'white' : 'black';
          payload.isGameOver = state.chess.isGameOver();
        } catch (e) {
          console.warn("Failed to load synced FEN", payload.fen);
        }
      }

      // Play sound for incoming remote move (AUDIT H6: this branch was
      // unreachable because the caller never sent `moveType`).
      if (moveType) {
        playSound(moveType);
      }

      // Bumping `remoteSyncId` inside this same `set()` call is what lets the
      // subscriber in `useBoardSync` recognise this transition as remote,
      // atomically — no separate ref/timer to race against (AUDIT H20).
      set({ ...payload, remoteSyncId: state.remoteSyncId + 1 });
    },

    
    setActiveBrush: (brush) => set({ activeBrush: brush }),
    setEditingPosition: (editing) => set({ isEditingPosition: editing }),
    setPendingPromotion: (promo) => set({ pendingPromotion: promo }),
    setIsDrawingMode: (mode) => set({ isDrawingMode: mode }),
    setIsSetupPositionOpen: (open) => set({ isSetupPositionOpen: open }),
    setActiveTab: (tab) => set({ activeTab: tab })
  }));
};
