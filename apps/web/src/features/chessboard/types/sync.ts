export type BoardPermissionMode = "VIEW_ONLY" | "EVERYONE" | "SELECTED_STUDENT" | "COACH_ONLY";

export type MoveSoundType = "move" | "capture" | "check" | "gameEnd";

export type BoardColor = "white" | "black";

/**
 * Which pieces a student who holds board control may actually move. The coach
 * grants this per student, so one can be driving white while another drives
 * black. `"both"` is the historic behaviour and the default for any grant that
 * arrives without a side (older clients send identities only).
 */
export type BoardControlSide = BoardColor | "both";

/**
 * Shared chess-clock state. Elapsed time is *derived* on render from
 * `updatedAt` + `running` (see `lib/clock.ts`), so only state transitions are
 * broadcast — never per-second ticks.
 */
export interface ClockState {
  enabled: boolean;
  /** Starting time per side, ms. */
  initialMs: number;
  /** Increment added to a side's clock after it moves, ms. */
  incrementMs: number;
  /** Time banked for white as of `updatedAt` (before the running deduction). */
  whiteMs: number;
  blackMs: number;
  /** Side whose clock is currently counting down, or null when paused/stopped. */
  running: BoardColor | null;
  /** epoch ms of the last authoritative change to the fields above. */
  updatedAt: number;
}

export interface SyncMessage {
  type: string;
  payload?: unknown;
}

export interface MovePayload {
  fen: string;
  pgn: string;
  /**
   * Ply the sender is currently viewing within `pgn`'s mainline (-1 = start
   * position). Receivers replay to this ply instead of jumping to the end, so
   * stepping through move history stays in sync (AUDIT H21).
   */
  historyIndex?: number;
  orientation?: BoardColor;
  moveType?: MoveSoundType;
  /** Present only on FORCE_SYNC (full board snapshot). */
  arrows?: string[][];
  squares?: Record<string, string>;
  activeTab?: string;
  clock?: ClockState;
}

export interface AnnotationPayload {
  arrows: string[][];
  squares: Record<string, string>;
}

export interface PermissionPayload {
  mode: BoardPermissionMode;
  /** Full LiveKit participant identities of the students currently granted control. */
  selectedStudentIds?: string[];
  /** identity -> side that identity may move. A missing entry means `"both"`. */
  selectedStudentSides?: Record<string, BoardControlSide>;
}

export interface UiStatePayload {
  activeTab?: string;
}

export interface ClockPayload {
  clock: ClockState;
}

export interface RequestControlPayload {
  /** Full LiveKit participant identity of the requesting student. */
  identity: string;
  studentName: string;
  /** Side the student is asking for; omitted means "either / both". */
  side?: BoardControlSide;
}

export type BoardSyncMessage =
  | { type: "MOVE" | "UNDO" | "REDO" | "RESET" | "FORCE_SYNC"; payload?: MovePayload }
  | { type: "UPDATE_ANNOTATIONS"; payload?: AnnotationPayload }
  | { type: "UPDATE_PERMISSIONS"; payload?: PermissionPayload }
  | { type: "SET_UI_STATE"; payload?: UiStatePayload }
  | { type: "SET_CLOCK"; payload?: ClockPayload }
  | { type: "REQUEST_SYNC"; payload?: undefined }
  | { type: "REQUEST_CONTROL"; payload?: RequestControlPayload };
