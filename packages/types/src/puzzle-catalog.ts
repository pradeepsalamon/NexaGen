import { z } from "zod";
import type { ChessColor, SolutionMove } from "./index";

// ──────────────────────────────────────────────────────────────
// Lichess puzzle catalogue — shared contract
// (docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md §0.3, §11)
// ──────────────────────────────────────────────────────────────

/**
 * The text whose sha256 is a puzzle's `contentHash`: the first four FEN fields
 * of the position the solver sees (placement, side, castling, en passant — the
 * move counters are left out so a transposition matches) + "|" + the solution
 * UCI, lowercased and space separated. The SQL backfill in migration
 * 20261004100000_puzzle_catalogue builds the same string; an int-spec keeps the
 * two in step. Hash it with `puzzleContentHash` (apps/api).
 */
export function puzzleContentKey(fen: string, solutionUcis: readonly string[]): string {
  const position = fen.trim().split(/\s+/).slice(0, 4).join(" ");
  const line = solutionUcis.map((uci) => uci.trim().toLowerCase()).join(" ");
  return `${position}|${line}`;
}

/**
 * Slug of the system "Lichess" folder that materialised catalogue puzzles land
 * in (spec §3). The library, the share dialog and the course picker hide it
 * unless it is opened directly. A slug no `slugify`d folder name can produce, so
 * an admin's own folder called "Lichess" is never mistaken for it.
 */
export const LICHESS_FOLDER_SLUG = "__lichess";

export function isLichessFolder(topic: { slug: string }): boolean {
  return topic.slug === LICHESS_FOLDER_SLUG;
}

export const CATALOG_MAX_PAGE_SIZE = 50;
/** Theme filters per browse request. */
export const CATALOG_MAX_THEMES = 10;
export const CATALOG_MAX_ADOPT = 200;

export const catalogThemeModeSchema = z.enum(["any", "all"]);
export type CatalogThemeMode = z.infer<typeof catalogThemeModeSchema>;

const csvOrArray = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean));

/** GET /puzzles/catalog — keyset browse, no totals. */
export const catalogListQuerySchema = z.object({
  ratingMin: z.coerce.number().int().min(0).max(4000).optional(),
  ratingMax: z.coerce.number().int().min(0).max(4000).optional(),
  themes: csvOrArray.pipe(z.array(z.string().max(40)).max(CATALOG_MAX_THEMES)).optional(),
  themeMode: catalogThemeModeSchema.optional(),
  opening: z.string().trim().max(120).optional(),
  /** Admin only: include rows below the quality gate. */
  // Not z.coerce.boolean(): that reads the query string "false" as true.
  includeBelowGate: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .transform((v) => v === true || v === "true" || v === "1")
    .optional(),
  /** Start randKey of the first page; a new seed is a reshuffle. */
  seed: z.coerce.number().int().min(0).max(0x7fffffff).optional(),
  /** Opaque cursor from the previous page's `nextCursor`. */
  cursor: z.string().max(200).optional(),
  pageSize: z.coerce.number().int().min(1).max(CATALOG_MAX_PAGE_SIZE).optional()
});
export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;

/** Where a catalogue puzzle already lives in the library, if anywhere. */
export type CatalogInLibrary = {
  puzzleId: string;
  topicName: string;
  /** false while it sits in the system "Lichess" folder (materialised only). */
  adopted: boolean;
};

/** A browse row. Deliberately carries NO solution moves. */
export type CatalogPuzzleSummary = {
  sourceId: string;
  /** The position as published by Lichess, before the setup move. */
  fen: string;
  setupMove: { uci: string; san: string };
  /** The position the solver sees. */
  postSetupFen: string;
  sideToMove: ChessColor;
  rating: number;
  themes: string[];
  openingTags: string[];
  popularity: number;
  nbPlays: number;
  inLibrary: CatalogInLibrary | null;
};

/** Staff-only preview: the one catalogue shape that includes the solution. */
export type CatalogPuzzlePreview = CatalogPuzzleSummary & {
  solutionMoves: SolutionMove[];
  gameUrl: string;
};

export type CatalogListResponse = {
  puzzles: CatalogPuzzleSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  /** The query hit its statement timeout — narrow the filters. */
  timedOut: boolean;
};

export type CatalogPreviewResponse = { puzzle: CatalogPuzzlePreview };

export const catalogMaterialiseRequestSchema = z.object({
  sourceId: z.string().trim().min(1).max(16)
});
export type CatalogMaterialiseRequest = z.infer<typeof catalogMaterialiseRequestSchema>;
export type CatalogMaterialiseResponse = { puzzleId: string };

export const catalogAdoptRequestSchema = z.object({
  sourceIds: z.array(z.string().trim().min(1).max(16)).min(1).max(CATALOG_MAX_ADOPT),
  topicId: z.string().min(1)
});
export type CatalogAdoptRequest = z.infer<typeof catalogAdoptRequestSchema>;

export const catalogAdoptOutcomeSchema = z.enum([
  "CREATED",
  "MOVED",
  "ALREADY_IN_FOLDER",
  "IN_TRASH",
  "NOT_PUBLISHED",
  "NOT_FOUND",
  "INVALID"
]);
export type CatalogAdoptOutcome = z.infer<typeof catalogAdoptOutcomeSchema>;

export type CatalogAdoptResult = {
  sourceId: string;
  puzzleId: string | null;
  outcome: CatalogAdoptOutcome;
  /** ALREADY_IN_FOLDER: the folder it is already in. */
  topicName?: string;
  /** CREATED / MOVED: another library puzzle already has this position + line (a warning only). */
  duplicateOf?: { puzzleId: string; title: string };
};

export type CatalogAdoptResponse = {
  adopted: number;
  moved: number;
  results: CatalogAdoptResult[];
};
