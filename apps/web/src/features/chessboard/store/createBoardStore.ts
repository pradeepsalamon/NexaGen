import { createStore } from "zustand";
import { Move } from "chess.js";
import {
  addMoveToTree,
  createMoveTree,
  deleteFromPath,
  findMoveTreePath,
  getMoveTreeNode,
  lineThroughPath,
  moveTreeFromMoves,
  moveTreeHasVariations,
  parsePgnToMoveTree,
  promoteToMainline,
  setMoveComment,
  type MoveTree,
  type MoveTreePath,
} from "@nexa-chess/types";
import { Chess } from "@/lib/chess";
import { createMoveTreeChess } from "@/lib/moveTreeChess";
import { BoardControlSide, BoardPermissionMode, ClockState } from "../types/sync";
import { playSound, SoundType } from "../audio/sounds";
import {
  DEFAULT_CLOCK,
  applyMoveToClock,
  freezeClock,
} from "../lib/clock";
import { useBoardStore as usePersistedStore } from "./boardStore";

export type OverlayArrow = {
  orig: string;
  dest: string;
  brush: "primaryGreen" | "blue" | "red" | "yellow";
  /** Relative thickness, 0-1. */
  weight: number;
};

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
  
  // Move tree. `tree` holds every line (mainline = children[0] at each
  // depth). `treeLinePath` is the full line currently selected (a variation or
  // the mainline); `historyIndex` is the cursor on it, so the position shown is
  // `treeLinePath.slice(0, historyIndex + 1)`. `moveHistory` is that line as
  // chess.js moves, and `fullPgn` its PGN — what a client predating variations
  // understands. Playing a move off the cursor adds a variation; it never
  // truncates or rewrites an existing line.
  tree: MoveTree;
  treeLinePath: MoveTreePath;
  moveHistory: Move[];
  historyIndex: number;
  /** New on every reset / load / set-up — the Game Library's game boundary. */
  gameId: string;
  
  // Board Presentation
  // Theme/piece-set/coordinates/animation/highlight visuals now live in the
  // app-wide ChessAppearanceProvider (see features/chess-appearance) — this
  // store only keeps `orientation`, which is functional live-class state
  // (whose side renders at the bottom right now), not a cosmetic preference.
  orientation: "white" | "black";
  // Per-client view flip on top of `orientation`; never broadcast, so a
  // student can look from the other side without moving anyone else's board.
  localFlip: boolean;

  // Annotations (Chessground format: Map of shapes)
  // For simplicity and sync, we store as raw arrays/objects which translate to chessground DrawShapes
  arrows: string[][]; // [["e2", "e4", "red"]]
  squareStyles: Record<string, string>; // { e4: "red" }
  // Local-only arrows (e.g. the move-poll tally); never broadcast.
  overlayArrows: OverlayArrow[];
  
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

  // Move tree (variations)
  /** Shows the position at `path` and selects the line through it. */
  goToPath: (path: MoveTreePath) => void;
  /** Coach only (callers enforce it): make the line through `path` the mainline. */
  promoteVariation: (path: MoveTreePath) => void;
  /** Removes the move at `path` and everything after it. */
  deleteVariation: (path: MoveTreePath) => void;
  setMoveComment: (path: MoveTreePath, comment: string) => void;
  /** Replaces the whole tree (Game Library open, import). */
  loadTree: (tree: MoveTree, linePath?: MoveTreePath, historyIndex?: number) => void;
  
  // UI Actions
  setOrientation: (orientation: "white" | "black") => void;
  toggleLocalFlip: () => void;

  // Annotations
  setAnnotations: (arrows: string[][], squares: Record<string, string>) => void;
  clearAnnotations: () => void;
  setOverlayArrows: (arrows: OverlayArrow[]) => void;
  
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
  syncFromRemote: (
    payload: Partial<BoardState> & { moveType?: SoundType; treePgn?: string },
  ) => void;
  /**
   * A controlling student's move, replayed on this board's own tree. Only the
   * move is taken from the packet — never its PGN or tree.
   */
  applyRemoteMove: (move: { from: string; to: string; promotion?: string }, moveType?: SoundType) => void;
  /** A controlling student's undo/redo: moves the cursor along this board's own line only. */
  applyRemoteCursor: (historyIndex: number) => void;
  
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

export function newBoardGameId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function uciParts(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined };
}

/**
 * Everything the store derives from (tree, line, cursor): `chess` is replayed
 * to the cursor (so its own history/pgn are the moves to it), and a scratch
 * instance replays the whole line for `moveHistory` / `fullPgn`.
 */
function deriveFromTree(
  chess: Chess,
  tree: MoveTree,
  requestedLine: MoveTreePath,
  requestedIndex: number,
): Partial<BoardState> {
  // Extend the selected line to its end so "forward" always has somewhere to go.
  const line = lineThroughPath(tree, requestedLine);
  const historyIndex = Math.max(-1, Math.min(requestedIndex, line.nodes.length - 1));

  const full = new Chess(tree.rootFen);
  for (const node of line.nodes) {
    try {
      full.move(uciParts(node.uci));
    } catch {
      break;
    }
  }

  chess.load(tree.rootFen);
  for (let i = 0; i <= historyIndex; i += 1) {
    try {
      chess.move(uciParts(line.nodes[i].uci));
    } catch {
      break;
    }
  }

  return {
    tree,
    treeLinePath: line.path,
    historyIndex,
    moveHistory: full.history({ verbose: true }),
    fullPgn: full.pgn(),
    fen: chess.fen(),
    pgn: chess.pgn(),
    isGameOver: chess.isGameOver(),
    turn: chess.turn() === "w" ? "white" : "black",
  };
}

/** Tree for a PGN, variations included; falls back to chess.js for oddities it accepts. */
export function moveTreeFromPgn(pgn: string, fallbackFen?: string): MoveTree | null {
  if (!pgn.trim()) return fallbackFen ? createMoveTree(new Chess(fallbackFen).fen()) : null;
  try {
    return parsePgnToMoveTree(pgn, createMoveTreeChess).tree;
  } catch {
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      const moves = chess.history({ verbose: true });
      const rootFen = moves.length ? moves[0].before : chess.fen();
      return moveTreeFromMoves(
        rootFen,
        moves.map((m) => ({ san: m.san, uci: `${m.from}${m.to}${m.promotion ?? ""}`, fen: m.after })),
      );
    } catch {
      return null;
    }
  }
}

export const createBoardStore = () => {
  const chess = new Chess();

  return createStore<BoardStore>((set, get) => ({
    chess,
    fen: INITIAL_FEN,
    pgn: "",
    fullPgn: "",
    isGameOver: false,
    turn: "white",

    tree: createMoveTree(INITIAL_FEN),
    treeLinePath: [],
    moveHistory: [],
    historyIndex: -1,
    gameId: newBoardGameId(),

    orientation: "white",
    localFlip: false,
    overlayArrows: [],
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
          // Branch, never truncate: a different move from a past position
          // becomes a variation and the existing line stays as it was.
          const cursor = state.treeLinePath.slice(0, state.historyIndex + 1);
          const added = addMoveToTree(state.tree, cursor, {
            san: move.san,
            uci: `${move.from}${move.to}${move.promotion ?? ""}`,
            fen: state.chess.fen(),
          });

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
            ...deriveFromTree(state.chess, added.tree, added.path, added.path.length - 1),
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
        set(deriveFromTree(state.chess, state.tree, state.treeLinePath, state.historyIndex - 1));
      }
    },
    
    redo: () => {
      const state = get();
      if (state.historyIndex < state.moveHistory.length - 1) {
        set(deriveFromTree(state.chess, state.tree, state.treeLinePath, state.historyIndex + 1));
      }
    },
    
    jumpToStart: () => {
      const state = get();
      if (state.historyIndex >= 0) {
        set(deriveFromTree(state.chess, state.tree, state.treeLinePath, -1));
      }
    },
    
    jumpToEnd: () => {
      const state = get();
      if (state.historyIndex < state.moveHistory.length - 1) {
        set(deriveFromTree(state.chess, state.tree, state.treeLinePath, state.moveHistory.length - 1));
      }
    },

    jumpToPly: (index) => {
      const state = get();
      const target = Math.max(-1, Math.min(index, state.moveHistory.length - 1));
      if (target === state.historyIndex) return;
      set(deriveFromTree(state.chess, state.tree, state.treeLinePath, target));
    },

    goToPath: (path) => {
      const state = get();
      if (path.length > 0 && !getMoveTreeNode(state.tree, path)) return;
      set(deriveFromTree(state.chess, state.tree, path, path.length - 1));
    },

    promoteVariation: (path) => {
      const state = get();
      const cursor = state.treeLinePath.slice(0, state.historyIndex + 1);
      const promoted = promoteToMainline(state.tree, path);
      if (promoted.tree === state.tree) return;
      // Keep showing the same position: the cursor's node moved with the line
      // when it was on it, otherwise re-find it by id.
      const cursorNode = cursor.length ? getMoveTreeNode(state.tree, cursor) : null;
      let nextCursor: MoveTreePath = [];
      if (cursorNode) {
        const onPromoted = cursor.length <= path.length && cursor.every((v, i) => v === path[i]);
        nextCursor = onPromoted ? promoted.path.slice(0, cursor.length) : findMoveTreePath(promoted.tree, cursorNode.id) ?? [];
      }
      set(deriveFromTree(state.chess, promoted.tree, nextCursor, nextCursor.length - 1));
    },

    deleteVariation: (path) => {
      const state = get();
      if (path.length === 0) return;
      const removed = deleteFromPath(state.tree, path);
      if (removed.tree === state.tree) return;
      const cursor = state.treeLinePath.slice(0, state.historyIndex + 1);
      const cursorInside = cursor.length >= path.length && path.every((v, i) => v === cursor[i]);
      if (cursorInside) {
        set(deriveFromTree(state.chess, removed.tree, removed.path, removed.path.length - 1));
        return;
      }
      const cursorNode = cursor.length ? getMoveTreeNode(state.tree, cursor) : null;
      const nextCursor = cursorNode ? findMoveTreePath(removed.tree, cursorNode.id) ?? [] : [];
      set(deriveFromTree(state.chess, removed.tree, nextCursor, nextCursor.length - 1));
    },

    setMoveComment: (path, comment) => {
      const state = get();
      const tree = setMoveComment(state.tree, path, comment);
      if (tree === state.tree) return;
      set({ tree });
    },

    loadTree: (tree, linePath, historyIndex) => {
      const state = get();
      const line = linePath ?? lineThroughPath(tree, []).path;
      set({
        ...deriveFromTree(state.chess, tree, line, historyIndex ?? line.length - 1),
        gameId: newBoardGameId(),
      });
    },
    
    reset: () => {
      const state = get();
      set({
        ...deriveFromTree(state.chess, createMoveTree(INITIAL_FEN), [], -1),
        gameId: newBoardGameId(),
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
        const root = new Chess(fen).fen();
        set({ ...deriveFromTree(state.chess, createMoveTree(root), [], -1), gameId: newBoardGameId() });
      } catch (e) {
        console.warn("Invalid FEN", fen);
      }
    },
    
    setPgn: (pgn) => {
      const state = get();
      const tree = moveTreeFromPgn(pgn);
      if (!tree) {
        console.warn("Invalid PGN", pgn);
        return;
      }
      const line = lineThroughPath(tree, []).path;
      set({ ...deriveFromTree(state.chess, tree, line, line.length - 1), gameId: newBoardGameId() });
    },

    pushHistory: (fen, pgn) => {
      const state = get();
      try {
        const tree = moveTreeFromPgn(pgn, fen);
        if (!tree) throw new Error("invalid");
        const line = lineThroughPath(tree, []).path;
        set({ ...deriveFromTree(state.chess, tree, line, line.length - 1), gameId: newBoardGameId() });
      } catch (e) {
        console.warn("Failed to load position", fen);
      }
    },
    
    setOrientation: (orientation) => set({ orientation }),
    toggleLocalFlip: () => set((s) => ({ localFlip: !s.localFlip })),

    setAnnotations: (arrows, squares) => set({ arrows, squareStyles: squares }),
    clearAnnotations: () => set({ arrows: [], squareStyles: {} }),
    setOverlayArrows: (overlayArrows) => set({ overlayArrows }),
    
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

      // The ply the sender is viewing within their line (AUDIT H21).
      const remotePly = payload.historyIndex;
      const { treePgn, treeLinePath: remoteLine, ...rest } = payload;
      let next: Partial<BoardState> & { moveType?: SoundType } = rest;

      if (treePgn !== undefined && treePgn !== "") {
        // A sender with variations: rebuild the whole tree (cheap next to a
        // network round trip) and put the cursor where they are.
        const tree = moveTreeFromPgn(treePgn);
        if (tree) {
          const line = Array.isArray(remoteLine) ? remoteLine : lineThroughPath(tree, []).path;
          const ply = typeof remotePly === "number" ? remotePly : line.length - 1;
          next = { ...rest, ...deriveFromTree(state.chess, tree, line, ply) };
        }
      } else if (
        payload.fen &&
        (payload.fen !== state.fen ||
          (payload.pgn ?? "") !== state.fullPgn ||
          moveTreeHasVariations(state.tree))
      ) {
        // A single-line sender (or one predating variations): its `pgn` is the
        // whole line, `historyIndex` the ply being viewed.
        const tree = moveTreeFromPgn(payload.pgn ?? "", payload.fen);
        if (tree) {
          const line = lineThroughPath(tree, []).path;
          const ply = typeof remotePly === "number" ? remotePly : line.length - 1;
          next = { ...rest, ...deriveFromTree(state.chess, tree, line, ply) };
        } else {
          console.warn("Failed to load synced FEN", payload.fen);
          next = rest;
          delete next.fen;
          delete next.pgn;
        }
      } else if (payload.fen) {
        // Same position and line: nothing to rebuild.
        next = { ...rest };
        delete next.fen;
        delete next.pgn;
        delete next.historyIndex;
      }

      // Play sound for incoming remote move (AUDIT H6: this branch was
      // unreachable because the caller never sent `moveType`).
      if (moveType) {
        playSound(moveType);
      }

      // Bumping `remoteSyncId` inside this same `set()` call is what lets the
      // subscriber in `useBoardSync` recognise this transition as remote,
      // atomically — no separate ref/timer to race against (AUDIT H20).
      const { moveType: _ignored, ...apply } = next;
      set({ ...apply, remoteSyncId: state.remoteSyncId + 1 });
    },

        applyRemoteMove: ({ from, to, promotion }, moveType) => {
      const state = get();
      if (state.isDetached) return;
      try {
        const move = state.chess.move({ from, to, promotion });
        if (!move) return;
        const cursor = state.treeLinePath.slice(0, state.historyIndex + 1);
        const added = addMoveToTree(state.tree, cursor, {
          san: move.san,
          uci: `${move.from}${move.to}${move.promotion ?? ""}`,
          fen: state.chess.fen(),
        });
        if (moveType) playSound(moveType);
        set({
          ...deriveFromTree(state.chess, added.tree, added.path, added.path.length - 1),
          remoteSyncId: state.remoteSyncId + 1
        });
      } catch {
        // Not legal here after all: the packet is dropped.
      }
    },

    applyRemoteCursor: (historyIndex) => {
      const state = get();
      if (state.isDetached) return;
      if (!Number.isInteger(historyIndex) || historyIndex < -1 || historyIndex >= state.treeLinePath.length) return;
      if (historyIndex === state.historyIndex) return;
      set({
        ...deriveFromTree(state.chess, state.tree, state.treeLinePath, historyIndex),
        remoteSyncId: state.remoteSyncId + 1
      });
    },

    setActiveBrush: (brush) => set({ activeBrush: brush }),
    setEditingPosition: (editing) => set({ isEditingPosition: editing }),
    setPendingPromotion: (promo) => set({ pendingPromotion: promo }),
    setIsDrawingMode: (mode) => set({ isDrawingMode: mode }),
    setIsSetupPositionOpen: (open) => set({ isSetupPositionOpen: open }),
    setActiveTab: (tab) => set({ activeTab: tab })
  }));
};
