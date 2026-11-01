import { z } from "zod";
import { PGN_IMPORT_LIMITS } from "./game-analysis-report";

// ──────────────────────────────────────────────────────────────
// Game sources: a student's own PGN uploads and linked online accounts.
//
// Only a USERNAME is ever stored — never a password or an access token.
// Ownership is proved by putting a one-time code in the account's public
// profile (Lichess: profile "bio"; Chess.com: profile "location"). Games are
// fetched from each provider's documented public API: Lichess
// `GET /api/games/user/{username}` (NDJSON) and Chess.com's PubAPI monthly
// archives. See docs/GAME_SOURCES.md.
// ──────────────────────────────────────────────────────────────

export const EXTERNAL_CHESS_PROVIDERS = ["LICHESS", "CHESS_COM"] as const;
export const externalChessProviderSchema = z.enum(EXTERNAL_CHESS_PROVIDERS);
export type ExternalChessProvider = z.infer<typeof externalChessProviderSchema>;

export const EXTERNAL_CHESS_PROVIDER_LABELS: Record<ExternalChessProvider, string> = {
  CHESS_COM: "Chess.com",
  LICHESS: "Lichess"
};

/** Where the provider wants the verification code put. */
export const EXTERNAL_VERIFICATION_FIELD: Record<ExternalChessProvider, string> = {
  CHESS_COM: "the Location field of your Chess.com profile",
  LICHESS: "the About me (bio) of your Lichess profile"
};

export const externalProfileUrl = (provider: ExternalChessProvider, username: string) =>
  provider === "LICHESS"
    ? `https://lichess.org/@/${encodeURIComponent(username)}`
    : `https://www.chess.com/member/${encodeURIComponent(username)}`;

export const EXTERNAL_SYNC_STATUSES = ["IDLE", "QUEUED", "SYNCING", "FAILED", "RATE_LIMITED"] as const;
export type ExternalSyncStatus = (typeof EXTERNAL_SYNC_STATUSES)[number];

/** Both providers: letters, digits, "_" and "-", 2–30 characters. */
export const externalUsernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/, "That doesn't look like a valid username.");

export const linkExternalAccountRequestSchema = z.object({
  provider: externalChessProviderSchema,
  username: externalUsernameSchema
});
export type LinkExternalAccountRequest = z.infer<typeof linkExternalAccountRequestSchema>;

export const EXTERNAL_SYNC_LIMITS = {
  /** Games fetched per sync (newest first is not used — syncs move forward from the cursor). */
  maxGamesPerSync: 50,
  /** On first link, only games from this many days back are fetched. */
  initialLookbackDays: 90,
  /** A student can start a sync at most this often. */
  minMinutesBetweenSyncs: 10,
  /** After a provider rate-limit answer, wait at least this long. */
  rateLimitBackoffMinutes: 15
} as const;

/** Automatic sync, once a day. `OPTIONAL` leaves it to each student unless a coach or admin set a rule. */
export const GAME_AUTO_SYNC_POLICIES = ["OFF", "OPTIONAL", "REQUIRED"] as const;
export const gameAutoSyncPolicySchema = z.enum(GAME_AUTO_SYNC_POLICIES);
export type GameAutoSyncPolicy = z.infer<typeof gameAutoSyncPolicySchema>;

/** A coach's or admin's rule for one student. */
export const GAME_AUTO_SYNC_RULES = ["ALWAYS", "NEVER"] as const;
export const gameAutoSyncRuleSchema = z.enum(GAME_AUTO_SYNC_RULES);
export type GameAutoSyncRule = z.infer<typeof gameAutoSyncRuleSchema>;

/**
 * The one rule for whether an account syncs by itself, in order: the academy's
 * OFF is a master switch; a per-student NEVER is an exception even to REQUIRED
 * (a parent's objection, say); then REQUIRED, ALWAYS, and the student's choice.
 * `lockedBy` is who decided, when it wasn't the student.
 */
export function resolveAutoSync(input: {
  policy: GameAutoSyncPolicy;
  rule: GameAutoSyncRule | null;
  studentChoice: boolean;
}): { enabled: boolean; lockedBy: "ACADEMY" | "STAFF" | null } {
  if (input.policy === "OFF") return { enabled: false, lockedBy: "ACADEMY" };
  if (input.rule === "NEVER") return { enabled: false, lockedBy: "STAFF" };
  if (input.policy === "REQUIRED") return { enabled: true, lockedBy: "ACADEMY" };
  if (input.rule === "ALWAYS") return { enabled: true, lockedBy: "STAFF" };
  return { enabled: input.studentChoice, lockedBy: null };
}

export const updateExternalAccountRequestSchema = z.object({ autoSync: z.boolean() });
export type UpdateExternalAccountRequest = z.infer<typeof updateExternalAccountRequestSchema>;

export const updateGameAutoSyncPolicyRequestSchema = z.object({ policy: gameAutoSyncPolicySchema });
export type UpdateGameAutoSyncPolicyRequest = z.infer<typeof updateGameAutoSyncPolicyRequestSchema>;

export const updateGameAutoSyncRuleRequestSchema = z.object({ rule: gameAutoSyncRuleSchema.nullable() });
export type UpdateGameAutoSyncRuleRequest = z.infer<typeof updateGameAutoSyncRuleRequestSchema>;

export type ExternalChessAccountDto = {
  id: string;
  provider: ExternalChessProvider;
  username: string;
  profileUrl: string;
  verified: boolean;
  /** Shown to the owner only, until verified. */
  verificationCode: string | null;
  syncStatus: ExternalSyncStatus;
  lastSyncedAt: string | null;
  nextSyncAllowedAt: string | null;
  syncError: string | null;
  gamesImported: number;
  /** The student's own choice; pass it to `resolveAutoSync`. */
  autoSync: boolean;
};

export type GameSourcesConfig = {
  /** Online-account import is switched on for this deployment. */
  externalImportEnabled: boolean;
  autoSyncPolicy: GameAutoSyncPolicy;
  pgnLimits: typeof PGN_IMPORT_LIMITS;
  syncLimits: typeof EXTERNAL_SYNC_LIMITS;
};

export type GameSourcesOverview = {
  config: GameSourcesConfig;
  accounts: ExternalChessAccountDto[];
  /** The signed-in student's rule from a coach or admin. */
  autoSyncRule: GameAutoSyncRule | null;
};

/** What a coach or admin sees and controls for one student. */
export type StudentGameSources = {
  externalImportEnabled: boolean;
  autoSyncPolicy: GameAutoSyncPolicy;
  autoSyncRule: GameAutoSyncRule | null;
  /** The rule was set by an admin; a coach can't change it. */
  autoSyncRuleByAdmin: boolean;
  accounts: ExternalChessAccountDto[];
};

/** Which side of each uploaded game the student played. AUTO matches the PGN's player names. */
export const importPgnSideSchema = z.enum(["AUTO", "WHITE", "BLACK", "NONE"]);
export type ImportPgnSide = z.infer<typeof importPgnSideSchema>;

export const importPgnRequestSchema = z.object({
  pgn: z.string().min(1, "Paste or choose a PGN first.").max(PGN_IMPORT_LIMITS.maxChars),
  side: importPgnSideSchema.default("AUTO"),
  /** The names the student plays under, for AUTO (their linked usernames are always tried). */
  names: z.array(z.string().trim().min(1).max(60)).max(5).default([]),
  /** Queue the imported games for analysis (background priority, within the daily limit). */
  analyse: z.boolean().default(false)
});
export type ImportPgnRequest = z.input<typeof importPgnRequestSchema>;

export type ImportPgnFailure = { index: number; reason: string };

export type ImportPgnResponse = {
  imported: number;
  duplicates: number;
  failed: ImportPgnFailure[];
  gameIds: string[];
  /** Games whose side could not be matched to the student (stored, but not counted in their insights). */
  unmatchedSide: number;
  /** Analyses queued because `analyse` was set (capped by the daily limit). */
  analysesQueued?: number;
};

export type SyncExternalAccountResponse = {
  account: ExternalChessAccountDto;
  imported: number;
  duplicates: number;
  /** More games are waiting beyond this sync's limit. */
  more: boolean;
  analysesQueued: number;
};

export const syncExternalAccountRequestSchema = z.object({ analyse: z.boolean().default(false) });
export type SyncExternalAccountRequest = z.input<typeof syncExternalAccountRequestSchema>;
