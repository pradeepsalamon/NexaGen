import { z } from "zod";

// Chess board appearance shared contract. Resolved through three layers
// (last wins): System default (Nexa Classic) → Admin global default → User
// preference. Mirrors the `live-class-settings.ts` pattern. Purely cosmetic —
// never affects FEN/position/moves/puzzle solution/game state (§27).

export const boardThemeIdSchema = z.enum([
  "nexa-classic",
  "classic-green",
  "blue",
  "brown",
  "dark",
  "minimal",
]);
export type BoardThemeId = z.infer<typeof boardThemeIdSchema>;

export const pieceSetIdSchema = z.enum(["classic", "modern", "minimal", "tournament", "wooden"]);
export type PieceSetId = z.infer<typeof pieceSetIdSchema>;

export const boardOrientationSchema = z.enum(["white", "black", "auto"]);
export type BoardOrientation = z.infer<typeof boardOrientationSchema>;

/**
 * The fully-resolved appearance shape. Every field has a default, so
 * `chessAppearanceSchema.parse({})` yields the Nexa Classic system baseline.
 */
export const chessAppearanceSchema = z
  .object({
    boardThemeId: boardThemeIdSchema.default("nexa-classic"),
    pieceSetId: pieceSetIdSchema.default("classic"),
    showCoordinates: z.boolean().default(true),
    boardOrientation: boardOrientationSchema.default("white"),
    animationEnabled: z.boolean().default(true),
    // Selected-square + last-move square highlighting.
    highlightEnabled: z.boolean().default(true),
    legalMovesEnabled: z.boolean().default(true),
    checkIndicatorEnabled: z.boolean().default(true),
  })
  .prefault({});

export type ChessAppearance = z.infer<typeof chessAppearanceSchema>;

/** The safe baseline used as Layer 1 when no system row exists yet. */
export const DEFAULT_CHESS_APPEARANCE: ChessAppearance = chessAppearanceSchema.parse({});

/**
 * Partial-override shape stored on `ChessAppearanceSettings` (admin) /
 * `UserChessAppearancePreference` (user). Only the keys an author actually
 * set are present; everything else inherits from the layer below.
 */
export const chessAppearanceOverrideSchema = z.object({
  boardThemeId: boardThemeIdSchema.optional(),
  pieceSetId: pieceSetIdSchema.optional(),
  showCoordinates: z.boolean().optional(),
  boardOrientation: boardOrientationSchema.optional(),
  animationEnabled: z.boolean().optional(),
  highlightEnabled: z.boolean().optional(),
  legalMovesEnabled: z.boolean().optional(),
  checkIndicatorEnabled: z.boolean().optional(),
});

export type ChessAppearanceOverride = z.infer<typeof chessAppearanceOverrideSchema>;

// ──────────────────────────────────────────────
// Resolution
// ──────────────────────────────────────────────

export type ChessAppearanceSource = "user" | "admin-default" | "system-default";

export interface ResolvedChessAppearance {
  config: ChessAppearance;
  source: ChessAppearanceSource;
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

function mergeOverride(
  base: ChessAppearance,
  override: ChessAppearanceOverride | null | undefined,
): ChessAppearance {
  if (!override) return base;
  return { ...base, ...pruneUndefined(override) };
}

/**
 * Merge a patch onto an existing partial override (not a full
 * `ChessAppearance`). Used server-side so a single-field update (e.g. a
 * keyboard-shortcut coordinate toggle) patches the caller's stored
 * preference instead of replacing it wholesale — a settings-page save that
 * submits every field produces the same result either way, since every key
 * is present in the patch.
 */
export function mergeChessAppearanceOverrides(
  base: ChessAppearanceOverride | null | undefined,
  patch: ChessAppearanceOverride | null | undefined,
): ChessAppearanceOverride {
  if (!patch) return base ?? {};
  return { ...(base ?? {}), ...pruneUndefined(patch) };
}

function parseOverride(value: unknown): ChessAppearanceOverride | null {
  if (value === null || value === undefined) return null;
  const parsed = chessAppearanceOverrideSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Resolve the effective appearance for one user. `admin` is the singleton
 * `ChessAppearanceSettings.settings` blob (may be `{}` — untouched), `user`
 * is the caller's `UserChessAppearancePreference.settings` (absent when they
 * have never saved a preference). Last non-empty layer wins.
 */
export function resolveChessAppearance(layers: {
  admin?: unknown;
  user?: unknown;
}): ResolvedChessAppearance {
  const adminOverride = parseOverride(layers.admin);
  const userOverride = parseOverride(layers.user);

  let config = DEFAULT_CHESS_APPEARANCE;
  let source: ChessAppearanceSource = "system-default";

  if (adminOverride && Object.keys(adminOverride).length > 0) {
    config = mergeOverride(config, adminOverride);
    source = "admin-default";
  }
  if (userOverride && Object.keys(userOverride).length > 0) {
    config = mergeOverride(config, userOverride);
    source = "user";
  }

  return { config: chessAppearanceSchema.parse(config), source };
}

// ──────────────────────────────────────────────
// Catalog metadata (built-in themes / piece sets)
// ──────────────────────────────────────────────

export interface BoardThemeMeta {
  id: BoardThemeId;
  name: string;
  description: string;
  isSystemTheme: true;
}

/** Quality-over-quantity built-in set (spec §7). Colors live in the web app's CSS. */
export const BOARD_THEME_CATALOG: BoardThemeMeta[] = [
  {
    id: "nexa-classic",
    name: "Nexa Classic",
    description: "Warm wooden board inspired by the NexaChess default visual identity.",
    isSystemTheme: true,
  },
  {
    id: "classic-green",
    name: "Classic Green",
    description: "Traditional tournament-style green board.",
    isSystemTheme: true,
  },
  {
    id: "blue",
    name: "Blue",
    description: "Modern blue board.",
    isSystemTheme: true,
  },
  {
    id: "brown",
    name: "Brown",
    description: "Classic wooden/brown board.",
    isSystemTheme: true,
  },
  {
    id: "dark",
    name: "Dark",
    description: "Dark-mode friendly board.",
    isSystemTheme: true,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean modern flat-color board.",
    isSystemTheme: true,
  },
];

export interface PieceSetMeta {
  id: PieceSetId;
  name: string;
  description: string;
  isSystemTheme: true;
  /** SPDX-ish license label as documented at the source. */
  license: string;
  author: string;
  /** Where the vendored SVGs were sourced from. */
  source: string;
}

/**
 * Vendored from lichess's open-source piece library
 * (github.com/lichess-org/lila, `public/piece/<id>`), filtered to
 * commercially-safe licenses only — most lichess sets are CC BY-NC-SA
 * (non-commercial) and were excluded. Full text in
 * `apps/web/public/chess/pieces/LICENSES.md`.
 */
export const PIECE_SET_CATALOG: PieceSetMeta[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Traditional Staunton-style pieces.",
    isSystemTheme: true,
    license: "GPLv2+",
    author: "Colin M.L. Burnett",
    source: "lichess-org/lila public/piece/cburnett",
  },
  {
    id: "modern",
    name: "Modern",
    description: "Clean modern pieces.",
    isSystemTheme: true,
    license: "Apache-2.0",
    author: "Alexis Luengas",
    source: "lichess-org/lila public/piece/chessnut",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Simple flat pieces.",
    isSystemTheme: true,
    license: "MIT",
    author: "Maurizio Monge",
    source: "lichess-org/lila public/piece/spatial",
  },
  {
    id: "tournament",
    name: "Tournament",
    description: "Professional tournament-style pieces.",
    isSystemTheme: true,
    license: "GPLv2+",
    author: "Armando Hernandez Marroquin",
    source: "lichess-org/lila public/piece/merida",
  },
  {
    id: "wooden",
    name: "Wooden",
    description: "Warm wooden visual style.",
    isSystemTheme: true,
    license: "CC0 1.0",
    author: "RhosGFX",
    source: "lichess-org/lila public/piece/rhosgfx",
  },
];
