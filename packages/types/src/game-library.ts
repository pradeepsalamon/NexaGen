import { z } from "zod";

// Game Library — saved games from live classes (shared board, simul, match)
// and PGN imports. The PGN is the whole move tree: variations and comments
// round-trip through `moveTreeToPgn` / `parsePgnToMoveTree` (move-tree.ts).

export const CHESS_GAME_SOURCES = ["LIVE_BOARD", "SIMUL", "MATCH", "IMPORT"] as const;
export const chessGameSourceSchema = z.enum(CHESS_GAME_SOURCES);
export type ChessGameSource = z.infer<typeof chessGameSourceSchema>;

export const CHESS_GAME_STATUSES = ["IN_PROGRESS", "COMPLETED"] as const;
export const chessGameStatusSchema = z.enum(CHESS_GAME_STATUSES);
export type ChessGameStatus = z.infer<typeof chessGameStatusSchema>;

export const CHESS_GAME_RESULTS = ["1-0", "0-1", "1/2-1/2", "*"] as const;
export const chessGameResultSchema = z.enum(CHESS_GAME_RESULTS);
export type ChessGameResult = z.infer<typeof chessGameResultSchema>;

export const CHESS_GAME_SOURCE_LABELS: Record<ChessGameSource, string> = {
  IMPORT: "Imported",
  LIVE_BOARD: "Class board",
  MATCH: "Student match",
  SIMUL: "Simul vs coach",
};

export const CHESS_GAME_RESULT_LABELS: Record<ChessGameResult, string> = {
  "*": "Unfinished",
  "0-1": "Black won",
  "1-0": "White won",
  "1/2-1/2": "Draw",
};

/** Largest PGN (tree included) the library accepts. */
export const MAX_GAME_PGN_LENGTH = 200_000;

export const gameLibraryQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  studentId: z.string().max(64).optional(),
  batchId: z.string().max(64).optional(),
  classId: z.string().max(64).optional(),
  source: chessGameSourceSchema.optional(),
  status: chessGameStatusSchema.optional(),
  result: chessGameResultSchema.optional(),
  /** Inclusive day bounds, YYYY-MM-DD, interpreted in the caller's timezone. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type GameLibraryQuery = z.infer<typeof gameLibraryQuerySchema>;

export const importGameRequestSchema = z.object({
  pgn: z.string().trim().min(1, "Paste a PGN first.").max(MAX_GAME_PGN_LENGTH),
  title: z.string().trim().max(200).optional(),
  batchId: z.string().max(64).optional(),
});
export type ImportGameRequest = z.infer<typeof importGameRequestSchema>;

export const saveGameAnalysisRequestSchema = z.object({
  pgn: z.string().trim().min(1).max(MAX_GAME_PGN_LENGTH),
  /** The `version` the edit was based on; a stale one is a 409. */
  version: z.number().int().min(1),
});
export type SaveGameAnalysisRequest = z.infer<typeof saveGameAnalysisRequestSchema>;

export interface GameLibraryItem {
  id: string;
  source: ChessGameSource;
  title: string;
  status: ChessGameStatus;
  result: ChessGameResult;
  termination: string | null;
  whiteName: string;
  blackName: string;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  classId: string | null;
  classTitle: string | null;
  batchId: string | null;
  batchName: string | null;
  moveCount: number;
  hasVariations: boolean;
  /** ISO-8601 UTC. */
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
}

export interface GameLibraryListResponse {
  items: GameLibraryItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface GameLibraryDetail extends GameLibraryItem {
  pgn: string;
  startFen: string;
  version: number;
  createdByName: string | null;
  /** True when the caller may save analysis (variations, promotions, comments). */
  canEdit: boolean;
  /** True when the caller may delete it (imports only). */
  canDelete: boolean;
}

export interface GameLibraryFilterOptions {
  batches: { id: string; name: string }[];
  students: { id: string; name: string }[];
}
