import { createStore } from "zustand";
import { Move } from "chess.js";
import {
  addMoveToTree,
  createMoveTree,
  freeMoveFen,
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
import { inspectFen } from "../lib/fen";

/** The board before a free move replaced it — what Undo across that move restores. */
type FreeMoveSnapshot = {
  tree: MoveTree;
  treeLinePath: MoveTreePath;
  historyIndex: number;
  gameId: string;
};

const FREE_MOVE_HISTORY_LIMIT = 200;

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
  /**
   * Why the position on the board can't be played (missing or extra kings,
   * a pawn on the back rank, ...). Non-empty = a set-up only position: shown
   * exactly as set up, but no moves, no engine. Empty for every normal game.
   */
  positionIssues: string[];
  
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
  /**
   * The coach's "Allow Illegal Moves". Only the coach's toolbar sets it; it
   * reaches students with the board permissions (`UPDATE_PERMISSIONS`). While
   * on, a move chess rules refuse is still played (`makeFreeMove`) by the
   * coach and by any student holding control of that colour.
   */
  allowIllegalMoves: boolean;
  /**
   * A free move can't live in the move tree (it holds only legal moves), so
   * it starts a new tree at the resulting position; these stacks let Undo /
   * Redo step back across it. Cleared by every load.
   */
  freeMoveUndo: FreeMoveSnapshot[];
  freeMoveRedo: FreeMoveSnapshot[];
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
  /**
   * Picks up the piece on `from` and puts it on `to`, chess rules ignored
   * (see `freeMoveFen`). For "Allow illegal moves"; a legal move should go
   * through `makeMove` so it keeps its notation.
   */
  makeFreeMove: (from: string, to: string) => boolean;
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
  /** A controlling student's free move (illegal moves allowed), replayed on this board. */
  applyRemoteFreeMove: (move: { from: string; to: string }, moveType?: SoundType) => void;
  /**
   * A controlling student's Undo / Redo across a free move: steps this board's
   * own free-move stack, and only when that lands on `fen`. False when it
   * doesn't apply (an ordinary cursor step).
   */
  applyRemoteFreeMoveStep: (direction: "undo" | "redo", fen: string) => boolean;
  /** A controlling student's undo/redo: moves the cursor along this board's own line only. */
  applyRemoteCursor: (historyIndex: number) => void;
  
  // Workspace interactions
  setActiveBrush: (brush: string) => void;
  setEditingPosition: (editing: boolean) => void;
  setAllowIllegalMoves: (allow: boolean) => void;
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

const NO_SNAPSHOTS: FreeMoveSnapshot[] = [];
/** Spread into every load: Undo never crosses into a board from before it. */
const CLEAR_FREE_MOVES = { freeMoveUndo: NO_SNAPSHOTS, freeMoveRedo: NO_SNAPSHOTS };

function snapshotOf(state: BoardState): FreeMoveSnapshot {
  return {
    tree: state.tree,
    treeLinePath: state.treeLinePath,
    historyIndex: state.historyIndex,
    gameId: state.gameId,
  };
}

function uciParts(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined };
}

const NO_ISSUES: string[] = [];
let issuesCache: { fen: string; issues: string[] } | null = null;

/** `inspectFen` issues for a tree root, memoised: every move re-derives from the same root. */
function rootIssues(rootFen: string): string[] {
  if (issuesCache?.fen !== rootFen) {
    const read = inspectFen(rootFen);
    issuesCache = { fen: rootFen, issues: read.ok ? (read.issues.length ? read.issues : NO_ISSUES) : [read.error] };
  }
  return issuesCache.issues;
}

/**
 * A move tree rooted at `fen`, legal chess position or not; null only when the
 * FEN can't be read as a board. A playable FEN is normalised by chess.js as
 * before; any other keeps its pieces exactly as given (see `inspectFen`).
 */
export function moveTreeForFen(fen: string): MoveTree | null {
  const read = inspectFen(fen);
  if (!read.ok) return null;
  return createMoveTree(read.issues.length ? read.fen : new Chess(read.fen).fen());
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
  const issues = rootIssues(tree.rootFen);
  if (issues.length > 0) {
    // A set-up only position has no moves to replay. `chess` holds what it
    // can of it (nothing reads it while `positionIssues` is set); the board
    // shows `fen`, which keeps every piece as set up.
    try {
      chess.load(tree.rootFen, { skipValidation: true });
    } catch (e) {
      // keeps its previous position
      console.warn("Set-up position not loaded into chess.js; it keeps its previous position", tree.rootFen, e);
    }
    return {
      tree: createMoveTree(tree.rootFen),
      treeLinePath: [],
      historyIndex: -1,
      moveHistory: [],
      fullPgn: "",
      fen: tree.rootFen,
      pgn: "",
      isGameOver: false,
      turn: tree.rootFen.split(" ")[1] === "b" ? "black" : "white",
      positionIssues: issues,
    };
  }

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
    positionIssues: NO_ISSUES,
  };
}

/** Tree for a PGN, variations included; falls back to chess.js for oddities it accepts. */
export function moveTreeFromPgn(pgn: string, fallbackFen?: string): MoveTree | null {
  if (!pgn.trim()) return fallbackFen ? moveTreeForFen(fallbackFen) : null;
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
    positionIssues: NO_ISSUES,

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
    allowIllegalMoves: false,
    freeMoveUndo: NO_SNAPSHOTS,
    freeMoveRedo: NO_SNAPSHOTS,
    pendingPromotion: null,
    isSetupPositionOpen: false,

    activeTab: "moves",

    clock: { ...DEFAULT_CLOCK },
    isDetached: false,

    makeMove: (from, to, promotion = 'q') => {
      const state = get();
      if (state.positionIssues.length > 0) return false;
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
            freeMoveRedo: NO_SNAPSHOTS,
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
    
    makeFreeMove: (from, to) => {
      const state = get();
      const fen = freeMoveFen(state.fen, from, to);
      const tree = fen ? moveTreeForFen(fen) : null;
      if (!fen || !tree) return false;
      // A free move hands the turn to the opposite colour of the moved piece.
      const nextTurn = fen.split(" ")[1] === "b" ? "black" : "white";
      const mover = nextTurn === "white" ? "black" : "white";
      const pieces = (f: string) => f.split(" ")[0].replace(/[^a-z]/gi, "").length;
      const moveType: SoundType = pieces(fen) < pieces(state.fen) ? "capture" : "move";
      playSound(moveType);
      usePersistedStore.getState().setLastMoveType(moveType);
      set({
        ...deriveFromTree(state.chess, tree, [], -1),
        gameId: newBoardGameId(),
        freeMoveUndo: [...state.freeMoveUndo, snapshotOf(state)].slice(-FREE_MOVE_HISTORY_LIMIT),
        freeMoveRedo: NO_SNAPSHOTS,
        clock: applyMoveToClock(state.clock, mover, Date.now()),
      });
      return true;
    },

    // At the start of the current line, Undo / Redo step across free moves.
    undo: () => {
      const state = get();
      if (state.historyIndex >= 0) {
        set(deriveFromTree(state.chess, state.tree, state.treeLinePath, state.historyIndex - 1));
        return;
      }
      const previous = state.freeMoveUndo[state.freeMoveUndo.length - 1];
      if (!previous) return;
      set({
        ...deriveFromTree(state.chess, previous.tree, previous.treeLinePath, previous.historyIndex),
        gameId: previous.gameId,
        freeMoveUndo: state.freeMoveUndo.slice(0, -1),
        freeMoveRedo: [...state.freeMoveRedo, snapshotOf(state)],
      });
    },
    
    redo: () => {
      const state = get();
      if (state.historyIndex < state.moveHistory.length - 1) {
        set(deriveFromTree(state.chess, state.tree, state.treeLinePath, state.historyIndex + 1));
        return;
      }
      const next = state.freeMoveRedo[state.freeMoveRedo.length - 1];
      if (!next) return;
      set({
        ...deriveFromTree(state.chess, next.tree, next.treeLinePath, next.historyIndex),
        gameId: next.gameId,
        freeMoveRedo: state.freeMoveRedo.slice(0, -1),
        freeMoveUndo: [...state.freeMoveUndo, snapshotOf(state)],
      });
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
        ...CLEAR_FREE_MOVES,
        gameId: newBoardGameId(),
      });
    },
    
    reset: () => {
      const state = get();
      set({
        ...deriveFromTree(state.chess, createMoveTree(INITIAL_FEN), [], -1),
        ...CLEAR_FREE_MOVES,
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
      const tree = moveTreeForFen(fen);
      if (!tree) {
        console.warn("Invalid FEN", fen);
        return;
      }
      set({ ...deriveFromTree(state.chess, tree, [], -1), ...CLEAR_FREE_MOVES, gameId: newBoardGameId() });
    },
    
    setPgn: (pgn) => {
      const state = get();
      const tree = moveTreeFromPgn(pgn);
      if (!tree) {
        console.warn("Invalid PGN", pgn);
        return;
      }
      const line = lineThroughPath(tree, []).path;
      set({ ...deriveFromTree(state.chess, tree, line, line.length - 1), ...CLEAR_FREE_MOVES, gameId: newBoardGameId() });
    },

    pushHistory: (fen, pgn) => {
      const state = get();
      try {
        const tree = moveTreeFromPgn(pgn, fen);
        if (!tree) throw new Error("invalid");
        const line = lineThroughPath(tree, []).path;
        set({ ...deriveFromTree(state.chess, tree, line, line.length - 1), ...CLEAR_FREE_MOVES, gameId: newBoardGameId() });
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
          ...(payload.allowIllegalMoves !== undefined ? { allowIllegalMoves: payload.allowIllegalMoves } : {}),
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
      if (state.isDetached || state.positionIssues.length > 0) return;
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

    applyRemoteFreeMove: ({ from, to }, moveType) => {
      const state = get();
      if (state.isDetached) return;
      const fen = freeMoveFen(state.fen, from, to);
      const tree = fen ? moveTreeForFen(fen) : null;
      if (!tree) return;
      if (moveType) playSound(moveType);
      // Same new tree root and Undo snapshot as the sender's `makeFreeMove`.
      set({
        ...deriveFromTree(state.chess, tree, [], -1),
        gameId: newBoardGameId(),
        freeMoveUndo: [...state.freeMoveUndo, snapshotOf(state)].slice(-FREE_MOVE_HISTORY_LIMIT),
        freeMoveRedo: NO_SNAPSHOTS,
        remoteSyncId: state.remoteSyncId + 1
      });
    },

    applyRemoteFreeMoveStep: (direction, fen) => {
      const state = get();
      if (state.isDetached) return false;
      const atEdge = direction === "undo"
        ? state.historyIndex < 0
        : state.historyIndex >= state.moveHistory.length - 1;
      const stack = direction === "undo" ? state.freeMoveUndo : state.freeMoveRedo;
      const target = stack[stack.length - 1];
      if (!atEdge || !target) return false;
      const node = target.historyIndex >= 0
        ? getMoveTreeNode(target.tree, target.treeLinePath.slice(0, target.historyIndex + 1))
        : null;
      const targetFen = node ? node.fen : target.tree.rootFen;
      const key = (f: string) => f.trim().split(/\s+/).slice(0, 3).join(" ");
      if (key(targetFen) !== key(fen)) return false;
      set({
        ...deriveFromTree(state.chess, target.tree, target.treeLinePath, target.historyIndex),
        gameId: target.gameId,
        ...(direction === "undo"
          ? { freeMoveUndo: stack.slice(0, -1), freeMoveRedo: [...state.freeMoveRedo, snapshotOf(state)] }
          : { freeMoveRedo: stack.slice(0, -1), freeMoveUndo: [...state.freeMoveUndo, snapshotOf(state)] }),
        remoteSyncId: state.remoteSyncId + 1
      });
      return true;
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
    setAllowIllegalMoves: (allow) => set({ allowIllegalMoves: allow }),
    setPendingPromotion: (promo) => set({ pendingPromotion: promo }),
    setIsDrawingMode: (mode) => set({ isDrawingMode: mode }),
    setIsSetupPositionOpen: (open) => set({ isSetupPositionOpen: open }),
    setActiveTab: (tab) => set({ activeTab: tab })
  }));
};
