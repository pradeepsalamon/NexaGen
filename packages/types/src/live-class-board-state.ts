import { z } from "zod";

// Durable copy of the shared live-class board. The board itself is synced
// peer-to-peer on the `board_sync` data channel; this snapshot is what lets a
// coach who refreshed (or a class where everyone reloaded) pick up where it
// left off. The coach's client writes it; any participant may read it.

const boardColorSchema = z.enum(["white", "black"]);

export const liveBoardClockSchema = z.object({
  enabled: z.boolean(),
  initialMs: z.number().int().min(0),
  incrementMs: z.number().int().min(0),
  whiteMs: z.number(),
  blackMs: z.number(),
  running: boardColorSchema.nullable(),
  updatedAt: z.number(),
});

export const liveBoardStateSchema = z.object({
  fen: z.string().min(1).max(100),
  /** Full mainline, so history can be stepped after a restore. */
  pgn: z.string().max(100_000),
  /** Ply being viewed within `pgn` (-1 = start position). */
  historyIndex: z.number().int().min(-1),
  orientation: boardColorSchema,
  arrows: z.array(z.array(z.string().max(32)).max(4)).max(200),
  squares: z.record(z.string().max(8), z.string().max(200)),
  activeTab: z.string().max(32).optional(),
  clock: liveBoardClockSchema.optional(),
  /**
   * The whole move tree as PGN with variations and comments. Absent when the
   * board has a single line — `pgn` already says everything then.
   */
  treePgn: z.string().max(100_000).optional(),
  /** Child index per depth of the line being viewed; `historyIndex` is the cursor on it. */
  treeLinePath: z.array(z.number().int().min(0).max(255)).max(2000).optional(),
  /** Changes whenever the board starts a new game (reset / load / set-up). */
  gameId: z.string().max(64).optional(),
  /** Client clock (epoch ms) when this snapshot was taken; newer always wins. */
  savedAt: z.number().int().min(0).optional(),
});

export type LiveBoardState = z.infer<typeof liveBoardStateSchema>;

export interface LiveBoardStateResponse {
  state: LiveBoardState | null;
  /** ISO-8601; null when nothing has been saved for this class yet. */
  updatedAt: string | null;
}
