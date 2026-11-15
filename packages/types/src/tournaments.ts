import { z } from "zod";

// Tournaments — shared contract (docs/TOURNAMENTS.md).
//
// Phase 1: the domain enums (identical to the Prisma enums; a spec in
// apps/api/src/tournament keeps them in step) and the academy's tournament
// settings. Tournament creation, registration, pairing, games, commentary and
// certificates add their contracts in the phases that build them.

// ── Enums ──

export const TOURNAMENT_FORMATS = ["SWISS", "ARENA", "ROUND_ROBIN", "KNOCKOUT"] as const;
export const tournamentFormatSchema = z.enum(TOURNAMENT_FORMATS);
export type TournamentFormat = z.infer<typeof tournamentFormatSchema>;

export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormat, string> = {
  ARENA: "Arena",
  KNOCKOUT: "Knockout",
  ROUND_ROBIN: "Round robin",
  SWISS: "Swiss"
};

/**
 * Stored lifecycle only. Whether registration is open is derived from the
 * registration window (Phase 2), never stored.
 */
export const TOURNAMENT_STATUSES = ["DRAFT", "PUBLISHED", "LIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export const tournamentStatusSchema = z.enum(TOURNAMENT_STATUSES);
export type TournamentStatus = z.infer<typeof tournamentStatusSchema>;

export const TOURNAMENT_VISIBILITIES = ["PUBLIC", "PRIVATE", "INVITATION_ONLY"] as const;
export const tournamentVisibilitySchema = z.enum(TOURNAMENT_VISIBILITIES);
export type TournamentVisibility = z.infer<typeof tournamentVisibilitySchema>;

export const TOURNAMENT_VISIBILITY_LABELS: Record<TournamentVisibility, string> = {
  INVITATION_ONLY: "Invitation only",
  PRIVATE: "Private",
  PUBLIC: "Public"
};

export const TOURNAMENT_TIEBREAKS = [
  "BUCHHOLZ",
  "BUCHHOLZ_CUT1",
  "MEDIAN_BUCHHOLZ",
  "SONNEBORN_BERGER",
  "DIRECT_ENCOUNTER",
  "WINS",
  "PROGRESSIVE",
  "PERFORMANCE"
] as const;
export const tournamentTiebreakSchema = z.enum(TOURNAMENT_TIEBREAKS);
export type TournamentTiebreak = z.infer<typeof tournamentTiebreakSchema>;

/** HOST and CO_HOST run a tournament; COMMENTATOR only broadcasts on it. */
export const TOURNAMENT_HOST_ROLES = ["HOST", "CO_HOST", "COMMENTATOR"] as const;
export const tournamentHostRoleSchema = z.enum(TOURNAMENT_HOST_ROLES);
export type TournamentHostRole = z.infer<typeof tournamentHostRoleSchema>;

export const TOURNAMENT_HOST_ROLE_LABELS: Record<TournamentHostRole, string> = {
  CO_HOST: "Co-host",
  COMMENTATOR: "Commentator",
  HOST: "Host"
};

export const TOURNAMENT_PLAYER_STATUSES = [
  "INVITED",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "DISQUALIFIED"
] as const;
export const tournamentPlayerStatusSchema = z.enum(TOURNAMENT_PLAYER_STATUSES);
export type TournamentPlayerStatus = z.infer<typeof tournamentPlayerStatusSchema>;

export const TOURNAMENT_RATING_SOURCES = ["PROFILE", "UNRATED"] as const;
export type TournamentRatingSource = (typeof TOURNAMENT_RATING_SOURCES)[number];

/** How a player's name is shown to anonymous spectators (docs/TOURNAMENTS.md §4.1). */
export const TOURNAMENT_PUBLIC_NAME_FORMATS = ["FIRST_NAME_LAST_INITIAL", "FIRST_NAME_ONLY", "INITIALS"] as const;
export const tournamentPublicNameFormatSchema = z.enum(TOURNAMENT_PUBLIC_NAME_FORMATS);
export type TournamentPublicNameFormat = z.infer<typeof tournamentPublicNameFormatSchema>;

export const TOURNAMENT_PUBLIC_NAME_FORMAT_LABELS: Record<TournamentPublicNameFormat, string> = {
  FIRST_NAME_LAST_INITIAL: "First name and last initial (Asha R.)",
  FIRST_NAME_ONLY: "First name only (Asha)",
  INITIALS: "Initials (A. R.)"
};

/** A name as anonymous spectators see it. Never the full name. */
export function formatPublicPlayerName(
  firstName: string,
  lastName: string | null,
  format: TournamentPublicNameFormat
): string {
  const first = firstName.trim();
  const lastInitial = (lastName ?? "").trim().charAt(0).toUpperCase();
  switch (format) {
    case "FIRST_NAME_ONLY":
      return first || "Player";
    case "INITIALS": {
      const initials = [first.charAt(0).toUpperCase(), lastInitial].filter(Boolean);
      return initials.length ? initials.map((c) => `${c}.`).join(" ") : "Player";
    }
    case "FIRST_NAME_LAST_INITIAL":
      if (!first) return lastInitial ? `${lastInitial}.` : "Player";
      return lastInitial ? `${first} ${lastInitial}.` : first;
  }
}

// ── Permissions ──

/**
 * What publishing a tournament takes for this user (docs/TOURNAMENTS.md §3.2):
 * done directly, filed as an admin approval request, or not allowed.
 */
export type TournamentPublishPath = "DIRECT" | "APPROVAL" | "FORBIDDEN";

// ── Academy settings (admin) ──

export const TOURNAMENT_MAX_SPECTATOR_DELAY_SEC = 900;

export const updateTournamentSettingsRequestSchema = z
  .object({
    allowAnonymousSpectating: z.boolean(),
    coachesMayCreate: z.boolean(),
    coachesMayPublishPublic: z.boolean(),
    defaultSpectatorDelaySec: z.number().int().min(0).max(TOURNAMENT_MAX_SPECTATOR_DELAY_SEC),
    publicNameFormat: tournamentPublicNameFormatSchema
  })
  .strict();
export type UpdateTournamentSettingsRequest = z.infer<typeof updateTournamentSettingsRequestSchema>;

export type TournamentSettingsDto = UpdateTournamentSettingsRequest & {
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
};

export type TournamentSettingsResponse = { settings: TournamentSettingsDto };

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: configuration, eligibility, lifecycle phase, CRUD and registration.
// ─────────────────────────────────────────────────────────────────────────────

export const TOURNAMENT_LIMITS = {
  descriptionMax: 4000,
  maxPlayers: 512,
  maxRounds: 15,
  nameMax: 120,
  rulesMax: 8000
} as const;

/** Every tournament game is timed (no correspondence chess in v1). */
export const tournamentTimeControlSchema = z.object({
  incrementSeconds: z.number().int().min(0).max(180),
  initialSeconds: z.number().int().min(15).max(10_800)
});
export type TournamentTimeControl = z.infer<typeof tournamentTimeControlSchema>;

export const TOURNAMENT_TIME_CONTROL_PRESETS: { label: string; value: TournamentTimeControl }[] = [
  { label: "1 + 0 Bullet", value: { incrementSeconds: 0, initialSeconds: 60 } },
  { label: "3 + 2 Blitz", value: { incrementSeconds: 2, initialSeconds: 180 } },
  { label: "5 + 3 Blitz", value: { incrementSeconds: 3, initialSeconds: 300 } },
  { label: "10 + 5 Rapid", value: { incrementSeconds: 5, initialSeconds: 600 } },
  { label: "15 + 10 Rapid", value: { incrementSeconds: 10, initialSeconds: 900 } },
  { label: "30 + 20 Classical", value: { incrementSeconds: 20, initialSeconds: 1800 } }
];

export function formatTimeControl(tc: { initialSeconds: number; incrementSeconds: number }): string {
  const minutes = tc.initialSeconds / 60;
  const base = Number.isInteger(minutes) ? String(minutes) : `${tc.initialSeconds}s`;
  return `${base} + ${tc.incrementSeconds}`;
}

const experienceLevelSchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);

/** Age groups by age on the cutoff date: "U10" = under 10. Ordered youngest first. */
export const TOURNAMENT_AGE_LIMITS = [8, 10, 12, 14, 16, 18] as const;
export type TournamentAgeGroup = `U${(typeof TOURNAMENT_AGE_LIMITS)[number]}` | "OPEN";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/**
 * Who may enter. Empty / absent fields mean "anyone". Age is measured on
 * `ageCutoffDate` (default: the tournament's start date).
 */
export const tournamentEligibilitySchema = z
  .object({
    ageCutoffDate: isoDate.optional(),
    allowUnrated: z.boolean().default(true),
    batchIds: z.array(z.string().min(1).max(64)).max(50).optional(),
    experienceLevels: z.array(experienceLevelSchema).max(3).optional(),
    /** Under this age on the cutoff date (e.g. 12 = U12). */
    maxAgeUnder: z.number().int().min(4).max(99).optional(),
    maxRating: z.number().int().min(0).max(3500).optional(),
    minAge: z.number().int().min(3).max(99).optional(),
    minRating: z.number().int().min(0).max(3500).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.minRating !== undefined && value.maxRating !== undefined && value.minRating > value.maxRating) {
      ctx.addIssue({ code: "custom", message: "The minimum rating is above the maximum.", path: ["minRating"] });
    }
    if (value.minAge !== undefined && value.maxAgeUnder !== undefined && value.minAge >= value.maxAgeUnder) {
      ctx.addIssue({ code: "custom", message: "The minimum age must be below the age limit.", path: ["minAge"] });
    }
  });
export type TournamentEligibility = z.infer<typeof tournamentEligibilitySchema>;

/** Lenient read of the stored JSON (a bad row means "no restriction" rather than a 500). */
export function parseTournamentEligibility(value: unknown): TournamentEligibility {
  const parsed = tournamentEligibilitySchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { allowUnrated: true };
}

/** Whole years between a date of birth and a cutoff date (both read as UTC dates). */
export function ageOn(dateOfBirth: Date, cutoff: Date): number {
  let age = cutoff.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    cutoff.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (cutoff.getUTCMonth() === dateOfBirth.getUTCMonth() && cutoff.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** The youngest age group a player belongs to on the cutoff date ("U10" etc.), or "OPEN". */
export function tournamentAgeGroup(age: number | null): TournamentAgeGroup | null {
  if (age === null) return null;
  for (const limit of TOURNAMENT_AGE_LIMITS) if (age < limit) return `U${limit}` as TournamentAgeGroup;
  return "OPEN";
}

export type EligibilityFacts = {
  age: number | null;
  rating: number | null;
  experienceLevel: z.infer<typeof experienceLevelSchema> | null;
  batchIds: readonly string[];
};

/** Null when eligible, else the reason a player can act on. The one eligibility rule. */
export function tournamentEligibilityIssue(rules: TournamentEligibility, facts: EligibilityFacts): string | null {
  if (rules.maxAgeUnder !== undefined || rules.minAge !== undefined) {
    if (facts.age === null) return "This tournament has an age limit and your profile has no date of birth.";
    if (rules.maxAgeUnder !== undefined && facts.age >= rules.maxAgeUnder) {
      return `This tournament is for players under ${rules.maxAgeUnder}.`;
    }
    if (rules.minAge !== undefined && facts.age < rules.minAge) {
      return `This tournament is for players aged ${rules.minAge} and over.`;
    }
  }
  if (facts.rating === null) {
    if (!rules.allowUnrated) return "This tournament is for rated players only.";
  } else {
    if (rules.minRating !== undefined && facts.rating < rules.minRating) {
      return `This tournament needs a rating of at least ${rules.minRating}.`;
    }
    if (rules.maxRating !== undefined && facts.rating > rules.maxRating) {
      return `This tournament is for ratings up to ${rules.maxRating}.`;
    }
  }
  if (rules.experienceLevels?.length && (!facts.experienceLevel || !rules.experienceLevels.includes(facts.experienceLevel))) {
    return "This tournament is for a different experience level.";
  }
  if (rules.batchIds?.length && !facts.batchIds.some((id) => rules.batchIds!.includes(id))) {
    return "This tournament is open to particular batches only.";
  }
  return null;
}

/** Arena scoring (docs/TOURNAMENTS.md §5): win 2, draw 1, loss 0; streaks double; berserk +1. */
export const tournamentArenaConfigSchema = z
  .object({
    berserk: z.boolean().default(true),
    streaks: z.boolean().default(true)
  })
  .strict();
export type TournamentArenaConfig = z.infer<typeof tournamentArenaConfigSchema>;

export const tournamentKnockoutConfigSchema = z
  .object({
    /** Games per match (best of N; an even number can end level). */
    gamesPerMatch: z.number().int().min(1).max(7).default(1),
    /** A level match: play sudden-death games (up to 3), else the higher seed advances. */
    tiebreak: z.enum(["SUDDEN_DEATH", "HIGHER_SEED"]).default("SUDDEN_DEATH")
  })
  .strict();
export type TournamentKnockoutConfig = z.infer<typeof tournamentKnockoutConfigSchema>;

export const DEFAULT_TIEBREAKS: Record<TournamentFormat, TournamentTiebreak[]> = {
  ARENA: [],
  KNOCKOUT: [],
  ROUND_ROBIN: ["SONNEBORN_BERGER", "DIRECT_ENCOUNTER", "WINS"],
  SWISS: ["BUCHHOLZ_CUT1", "BUCHHOLZ", "SONNEBORN_BERGER", "WINS"]
};

const isoDateTime = z.string().datetime({ offset: true });

// ── Round starts (Swiss and round robin) ──

export const TOURNAMENT_ROUND_START_MODES = ["AUTO", "SCHEDULED", "MANUAL"] as const;
export const tournamentRoundStartModeSchema = z.enum(TOURNAMENT_ROUND_START_MODES);
export type TournamentRoundStartMode = z.infer<typeof tournamentRoundStartModeSchema>;

export const TOURNAMENT_ROUND_START_MODE_LABELS: Record<TournamentRoundStartMode, string> = {
  AUTO: "Automatically, after a break",
  MANUAL: "When a host starts it",
  SCHEDULED: "At set times"
};

/** Start times of rounds 2 and later (round 1 starts with the tournament). */
export const tournamentRoundScheduleSchema = z
  .array(z.object({ round: z.number().int().min(2).max(TOURNAMENT_LIMITS.maxRounds), startsAt: isoDateTime }).strict())
  .max(TOURNAMENT_LIMITS.maxRounds);
export type TournamentRoundSchedule = z.infer<typeof tournamentRoundScheduleSchema>;

/** A scheduled round whose time passed while the previous one was still playing starts this long after it ends. */
export const TOURNAMENT_LATE_ROUND_PAUSE_SEC = 15;

/**
 * When the round after a completed one starts on its own — the one rule (the
 * engine stores the answer in `Tournament.nextRoundAt`; a host can then move
 * it). Null: nothing starts it but a host.
 */
export function resolveNextRoundAt(input: {
  mode: TournamentRoundStartMode;
  roundBreakSec: number;
  schedule: TournamentRoundSchedule;
  /** The round that is about to start. */
  nextRound: number;
  /** When the previous round's last game ended. */
  completedAt: Date;
}): Date | null {
  if (input.mode === "MANUAL") return null;
  const afterBreak = new Date(input.completedAt.getTime() + input.roundBreakSec * 1000);
  if (input.mode === "AUTO") return afterBreak;
  const planned = input.schedule.find((entry) => entry.round === input.nextRound);
  if (!planned) return afterBreak;
  const earliest = input.completedAt.getTime() + TOURNAMENT_LATE_ROUND_PAUSE_SEC * 1000;
  return new Date(Math.max(Date.parse(planned.startsAt), earliest));
}

/** A host moving the next round's start (between rounds only). */
export const setTournamentNextRoundAtRequestSchema = z.object({ startsAt: isoDateTime }).strict();
export type SetTournamentNextRoundAtRequest = z.infer<typeof setTournamentNextRoundAtRequestSchema>;

const tournamentFields = {
  arenaConfig: tournamentArenaConfigSchema.optional(),
  arenaDurationMin: z.number().int().min(10).max(600).optional(),
  description: z.string().trim().max(TOURNAMENT_LIMITS.descriptionMax).optional(),
  eligibility: tournamentEligibilitySchema.optional(),
  format: tournamentFormatSchema,
  knockoutConfig: tournamentKnockoutConfigSchema.optional(),
  lateRegistrationRounds: z.number().int().min(0).max(TOURNAMENT_LIMITS.maxRounds),
  maxPlayers: z.number().int().min(2).max(TOURNAMENT_LIMITS.maxPlayers).nullable().optional(),
  minPlayers: z.number().int().min(2).max(TOURNAMENT_LIMITS.maxPlayers),
  name: z.string().trim().min(3, "Give the tournament a name.").max(TOURNAMENT_LIMITS.nameMax),
  prizesText: z.string().trim().max(TOURNAMENT_LIMITS.rulesMax).optional(),
  registrationClosesAt: isoDateTime.nullable().optional(),
  registrationOpensAt: isoDateTime.nullable().optional(),
  registrationRequiresApproval: z.boolean(),
  roundBreakSec: z.number().int().min(0).max(3600),
  roundSchedule: tournamentRoundScheduleSchema.optional(),
  roundStartMode: tournamentRoundStartModeSchema,
  /** Swiss: rounds. Round robin: cycles (1 single, 2 double). Ignored for arena and knockout. */
  rounds: z.number().int().min(1).max(TOURNAMENT_LIMITS.maxRounds).optional(),
  rulesText: z.string().trim().max(TOURNAMENT_LIMITS.rulesMax).optional(),
  spectatorDelaySec: z.number().int().min(0).max(TOURNAMENT_MAX_SPECTATOR_DELAY_SEC).optional(),
  startFen: z.string().trim().max(100).nullable().optional(),
  startsAt: isoDateTime,
  tiebreaks: z.array(tournamentTiebreakSchema).max(TOURNAMENT_TIEBREAKS.length).optional(),
  timeControl: tournamentTimeControlSchema,
  visibility: tournamentVisibilitySchema
};

/** Create-time defaults (an update never applies them: a missing field stays as stored). */
const tournamentCreateFields = {
  ...tournamentFields,
  lateRegistrationRounds: tournamentFields.lateRegistrationRounds.default(0),
  minPlayers: tournamentFields.minPlayers.default(2),
  registrationRequiresApproval: tournamentFields.registrationRequiresApproval.default(false),
  roundBreakSec: tournamentFields.roundBreakSec.default(60),
  roundStartMode: tournamentFields.roundStartMode.default("AUTO"),
  visibility: tournamentFields.visibility.default("PUBLIC")
};

type TournamentFieldsShape = {
  format: TournamentFormat;
  rounds?: number;
  arenaDurationMin?: number;
  minPlayers?: number;
  maxPlayers?: number | null;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  startsAt: string;
  roundStartMode?: TournamentRoundStartMode;
  roundSchedule?: TournamentRoundSchedule;
};

/** Cross-field rules shared by create and the merged result of an update. */
export function tournamentConfigIssues(value: TournamentFieldsShape): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (value.format === "SWISS" && value.rounds === undefined) issues.push({ message: "Choose the number of rounds.", path: "rounds" });
  if (value.format === "ROUND_ROBIN" && value.rounds !== undefined && value.rounds > 2) {
    issues.push({ message: "A round robin is single (1) or double (2).", path: "rounds" });
  }
  if (value.format === "ARENA" && value.arenaDurationMin === undefined) {
    issues.push({ message: "Choose how long the arena runs.", path: "arenaDurationMin" });
  }
  if (value.maxPlayers != null && value.minPlayers !== undefined && value.maxPlayers < value.minPlayers) {
    issues.push({ message: "The player cap is below the minimum.", path: "maxPlayers" });
  }
  const opens = value.registrationOpensAt ? Date.parse(value.registrationOpensAt) : null;
  const closes = value.registrationClosesAt ? Date.parse(value.registrationClosesAt) : null;
  const starts = Date.parse(value.startsAt);
  if (opens !== null && closes !== null && opens > closes) {
    issues.push({ message: "Registration closes before it opens.", path: "registrationClosesAt" });
  }
  if (closes !== null && closes > starts) {
    issues.push({ message: "Registration must close by the start time.", path: "registrationClosesAt" });
  }
  if (opens !== null && opens > starts) issues.push({ message: "Registration must open before the start.", path: "registrationOpensAt" });
  issues.push(...roundScheduleIssues(value));
  return issues;
}

function roundScheduleIssues(value: TournamentFieldsShape): { path: string; message: string }[] {
  const schedule = [...(value.roundSchedule ?? [])].sort((a, b) => a.round - b.round);
  const path = "roundSchedule";
  if (value.roundStartMode !== "SCHEDULED") return [];
  if (value.format !== "SWISS" && value.format !== "ROUND_ROBIN") return [{ message: "Only Swiss and round robin tournaments have a round schedule.", path }];
  if (schedule.length === 0) return [{ message: "Set a start time for at least one round.", path }];
  let previous = Date.parse(value.startsAt);
  const seen = new Set<number>();
  for (const entry of schedule) {
    if (seen.has(entry.round)) return [{ message: `Round ${entry.round} has two start times.`, path }];
    seen.add(entry.round);
    if (value.format === "SWISS" && value.rounds !== undefined && entry.round > value.rounds) {
      return [{ message: `There is no round ${entry.round}.`, path }];
    }
    const at = Date.parse(entry.startsAt);
    if (at <= previous) return [{ message: `Round ${entry.round} must start after the round before it.`, path }];
    previous = at;
  }
  return [];
}

export const createTournamentRequestSchema = z
  .object(tournamentCreateFields)
  .strict()
  .superRefine((value, ctx) => {
    for (const issue of tournamentConfigIssues(value)) ctx.addIssue({ code: "custom", message: issue.message, path: [issue.path] });
  });
export type CreateTournamentRequest = z.input<typeof createTournamentRequestSchema>;

/** Every field optional, plus the version the editor loaded (optimistic concurrency). */
export const updateTournamentRequestSchema = z
  .object(tournamentFields)
  .partial()
  .extend({ version: z.number().int().min(1) })
  .strict();
export type UpdateTournamentRequest = z.infer<typeof updateTournamentRequestSchema>;

/**
 * Where a tournament is in its life, for display and for the registration
 * rule. `status` is stored; the registration part is derived from the window
 * (opens: `registrationOpensAt` or publication; closes: `registrationClosesAt`
 * or the start).
 */
export type TournamentPhase =
  | "DRAFT"
  | "UPCOMING"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "LIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export type TournamentPhaseInput = {
  status: TournamentStatus;
  startsAt: string | Date;
  registrationOpensAt: string | Date | null;
  registrationClosesAt: string | Date | null;
};

const ms = (d: string | Date) => (typeof d === "string" ? Date.parse(d) : d.getTime());

export function resolveTournamentPhase(t: TournamentPhaseInput, now: Date = new Date()): TournamentPhase {
  switch (t.status) {
    case "DRAFT":
    case "LIVE":
    case "PAUSED":
    case "COMPLETED":
    case "CANCELLED":
      return t.status;
    case "PUBLISHED": {
      const at = now.getTime();
      if (t.registrationOpensAt && at < ms(t.registrationOpensAt)) return "UPCOMING";
      const closes = t.registrationClosesAt ? ms(t.registrationClosesAt) : ms(t.startsAt);
      return at < closes ? "REGISTRATION_OPEN" : "REGISTRATION_CLOSED";
    }
  }
}

export const TOURNAMENT_PHASE_LABELS: Record<TournamentPhase, string> = {
  CANCELLED: "Cancelled",
  COMPLETED: "Finished",
  DRAFT: "Draft",
  LIVE: "Live",
  PAUSED: "Paused",
  REGISTRATION_CLOSED: "Registration closed",
  REGISTRATION_OPEN: "Registration open",
  UPCOMING: "Upcoming"
};

// ── DTOs ──

export type TournamentPersonRef = { id: string; name: string; avatarUrl: string | null };

export type TournamentHostDto = TournamentPersonRef & { role: TournamentHostRole };

export type TournamentSummaryDto = {
  id: string;
  slug: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  phase: TournamentPhase;
  visibility: TournamentVisibility;
  startsAt: string;
  timeControl: TournamentTimeControl;
  rounds: number | null;
  arenaDurationMin: number | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  playerCount: number;
  maxPlayers: number | null;
  host: TournamentPersonRef | null;
  /** The viewer's own entry, if any. */
  myStatus: TournamentPlayerStatus | null;
};

export type TournamentViewerDto = {
  canManage: boolean;
  canBroadcast: boolean;
  canModerate: boolean;
  publishPath: TournamentPublishPath;
  myStatus: TournamentPlayerStatus | null;
  /** Null when the viewer may register now, else why not (shown on the button). */
  registrationIssue: string | null;
  canWithdraw: boolean;
  signedIn: boolean;
};

export type TournamentDetailDto = TournamentSummaryDto & {
  description: string | null;
  rulesText: string | null;
  prizesText: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  registrationRequiresApproval: boolean;
  lateRegistrationRounds: number;
  minPlayers: number;
  startFen: string | null;
  roundBreakSec: number;
  roundStartMode: TournamentRoundStartMode;
  /** Start times of rounds 2 and later, when the mode is SCHEDULED. */
  roundSchedule: TournamentRoundSchedule;
  arenaConfig: TournamentArenaConfig | null;
  knockoutConfig: TournamentKnockoutConfig | null;
  tiebreaks: TournamentTiebreak[];
  spectatorDelaySec: number;
  eligibility: TournamentEligibility;
  hosts: TournamentHostDto[];
  publishedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  resultsPublishedAt: string | null;
  cancelReason: string | null;
  version: number;
  /** A pending TOURNAMENT_PUBLISH approval request, for the managers' view. */
  pendingPublishRequestId: string | null;
  viewer: TournamentViewerDto;
};

export type TournamentResponse = { tournament: TournamentDetailDto };

export const TOURNAMENT_LIST_TABS = ["live", "upcoming", "completed", "cancelled", "mine", "hosting", "drafts"] as const;
export const tournamentListTabSchema = z.enum(TOURNAMENT_LIST_TABS);
export type TournamentListTab = z.infer<typeof tournamentListTabSchema>;

export type TournamentListResponse = {
  items: TournamentSummaryDto[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
};

export type TournamentCapabilitiesResponse = { canCreate: boolean };

export type TournamentPlayerDto = {
  id: string;
  user: TournamentPersonRef;
  status: TournamentPlayerStatus;
  seedRating: number | null;
  seedRatingSource: TournamentRatingSource;
  seedNumber: number | null;
  ageGroup: string | null;
  registeredAt: string;
  decidedAt: string | null;
};

export type TournamentPlayersResponse = { players: TournamentPlayerDto[] };

export const publishTournamentRequestSchema = z
  .object({
    /** Required when the publish goes to an admin for approval. */
    reason: z.string().trim().min(3).max(1000).optional()
  })
  .strict();
export type PublishTournamentRequest = z.infer<typeof publishTournamentRequestSchema>;

export type PublishTournamentResponse =
  | { outcome: "PUBLISHED"; tournament: TournamentDetailDto }
  | { outcome: "APPROVAL_REQUESTED"; approvalRequestId: string; tournament: TournamentDetailDto };

export const cancelTournamentRequestSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type CancelTournamentRequest = z.infer<typeof cancelTournamentRequestSchema>;

export const setTournamentHostsRequestSchema = z
  .object({
    hosts: z
      .array(z.object({ role: tournamentHostRoleSchema, userId: z.string().min(1).max(64) }).strict())
      .max(20)
  })
  .strict()
  .refine((v) => new Set(v.hosts.map((h) => h.userId)).size === v.hosts.length, "Each person can hold one role.");
export type SetTournamentHostsRequest = z.infer<typeof setTournamentHostsRequestSchema>;

export const addTournamentPlayersRequestSchema = z
  .object({
    userIds: z.array(z.string().min(1).max(64)).min(1).max(100),
    /** INVITED (they accept) or APPROVED (entered directly). */
    as: z.enum(["INVITED", "APPROVED"]).default("APPROVED")
  })
  .strict();
export type AddTournamentPlayersRequest = z.input<typeof addTournamentPlayersRequestSchema>;

export type AddTournamentPlayersResponse = {
  added: TournamentPlayerDto[];
  /** Per-user refusals (eligibility, capacity, already entered). */
  skipped: { userId: string; reason: string }[];
};

export const decideTournamentPlayerRequestSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED", "DISQUALIFIED"]),
    reason: z.string().trim().max(500).optional()
  })
  .strict();
export type DecideTournamentPlayerRequest = z.infer<typeof decideTournamentPlayerRequestSchema>;

export type TournamentPlayerResponse = { player: TournamentPlayerDto };

export type TournamentCandidateDto = TournamentPersonRef & {
  rating: number | null;
  /** Null when eligible. */
  issue: string | null;
  entered: TournamentPlayerStatus | null;
};
export type TournamentCandidatesResponse = { candidates: TournamentCandidateDto[] };

/** Staff who can be given a host role (active coaches and admins of the academy). */
export type TournamentHostCandidatesResponse = { candidates: (TournamentPersonRef & { role: "COACH" | "ADMIN" | "SUPER_ADMIN" })[] };

export const TOURNAMENT_IMAGE_KINDS = ["banner", "logo"] as const;
export const tournamentImageKindSchema = z.enum(TOURNAMENT_IMAGE_KINDS);
export type TournamentImageKind = z.infer<typeof tournamentImageKindSchema>;
export const TOURNAMENT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// Phases 3–4: rounds, games, results.
// ─────────────────────────────────────────────────────────────────────────────

/** Clocks start once both sides have made their first move (as in live-class matches). */
export const TOURNAMENT_CLOCK_START_PLY = 2;
/** A side that hasn't made its first move by then loses the game (or both no-show: no result). */
export const TOURNAMENT_FIRST_MOVE_SECONDS = 60;

export const TOURNAMENT_GAME_RESULTS = ["WHITE_WON", "BLACK_WON", "DRAW", "NO_RESULT"] as const;
export const tournamentGameResultSchema = z.enum(TOURNAMENT_GAME_RESULTS);
export type TournamentGameResult = z.infer<typeof tournamentGameResultSchema>;

export const TOURNAMENT_END_REASONS = [
  "CHECKMATE",
  "STALEMATE",
  "INSUFFICIENT_MATERIAL",
  "THREEFOLD_REPETITION",
  "FIFTY_MOVE_RULE",
  "RESIGNATION",
  "DRAW_AGREED",
  "TIMEOUT",
  "NO_SHOW",
  "ABANDONED",
  "FORFEIT",
  "BYE",
  "ADJUDICATED",
  "ARENA_ENDED"
] as const;
export type TournamentEndReason = (typeof TOURNAMENT_END_REASONS)[number];

export const TOURNAMENT_END_REASON_LABELS: Record<TournamentEndReason, string> = {
  ABANDONED: "Opponent left",
  ADJUDICATED: "Decided by the host",
  ARENA_ENDED: "Arena ended",
  BYE: "Bye",
  CHECKMATE: "Checkmate",
  DRAW_AGREED: "Draw agreed",
  FIFTY_MOVE_RULE: "Fifty-move rule",
  FORFEIT: "Forfeit",
  INSUFFICIENT_MATERIAL: "Insufficient material",
  NO_SHOW: "Didn't start",
  RESIGNATION: "Resignation",
  STALEMATE: "Stalemate",
  THREEFOLD_REPETITION: "Threefold repetition",
  TIMEOUT: "Time out"
};

export const TOURNAMENT_RESULT_SOURCES = ["ENGINE", "BYE", "FORFEIT", "HOST", "CORRECTION"] as const;
export type TournamentResultSource = (typeof TOURNAMENT_RESULT_SOURCES)[number];

export type TournamentGamePlayerRef = {
  playerId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  rating: number | null;
};

export type TournamentGameDto = {
  id: string;
  tournamentId: string;
  roundNumber: number;
  gameNumber: number;
  board: number;
  knockoutMatchId: string | null;
  white: TournamentGamePlayerRef;
  /** Null for a bye. */
  black: TournamentGamePlayerRef | null;
  byeKind: "FULL" | "HALF" | "ZERO" | null;
  startFen: string;
  fen: string;
  moves: { san: string; uci: string }[];
  ply: number;
  clock: {
    initialMs: number;
    incrementMs: number;
    whiteMs: number;
    blackMs: number;
    /** When the side to move's clock was last stopped; it runs from here. */
    turnSince: string;
    /** Null before the clocks start and once the game is over. */
    running: "white" | "black" | null;
    serverNow: string;
  };
  firstMoveDeadline: string | null;
  drawOfferedBy: "white" | "black" | null;
  berserk: { white: boolean; black: boolean };
  status: "ONGOING" | "FINISHED";
  result: TournamentGameResult | null;
  endReason: TournamentEndReason | null;
  resultSource: TournamentResultSource | null;
  /** Points scored in half-points (2 win, 1 draw, 0 loss); null while ongoing. */
  whiteHalfPoints: number | null;
  blackHalfPoints: number | null;
  startedAt: string;
  finishedAt: string | null;
  version: number;
  /** The viewer's colour in this game, if they play it. */
  viewerColor: "white" | "black" | null;
  /** Spectators see moves only after the tournament's delay: true when `moves` stops short. */
  delayed: boolean;
};

export type TournamentGameResponse = { game: TournamentGameDto };

export const tournamentMoveRequestSchema = z
  .object({
    ply: z.number().int().min(0).max(2000),
    uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Not a move.")
  })
  .strict();
export type TournamentMoveRequest = z.infer<typeof tournamentMoveRequestSchema>;

export const TOURNAMENT_GAME_ACTIONS = ["RESIGN", "OFFER_DRAW", "ACCEPT_DRAW", "DECLINE_DRAW", "CLAIM_TIMEOUT", "BERSERK"] as const;
export const tournamentGameActionRequestSchema = z.object({ action: z.enum(TOURNAMENT_GAME_ACTIONS) }).strict();
export type TournamentGameActionRequest = z.infer<typeof tournamentGameActionRequestSchema>;

/** Host decisions on one game: forfeit/adjudicate an ongoing game, or correct a finished one. */
export const tournamentGameDecisionRequestSchema = z
  .object({
    result: tournamentGameResultSchema,
    reason: z.string().trim().min(3, "Give the reason (it goes in the audit log).").max(500),
    /** The game's `version` the host saw (corrections only). */
    version: z.number().int().min(1).optional()
  })
  .strict();
export type TournamentGameDecisionRequest = z.infer<typeof tournamentGameDecisionRequestSchema>;

export type TournamentGameSummaryDto = Pick<
  TournamentGameDto,
  "id" | "roundNumber" | "gameNumber" | "board" | "knockoutMatchId" | "white" | "black" | "byeKind" | "status" | "result" | "endReason" | "whiteHalfPoints" | "blackHalfPoints" | "startedAt" | "finishedAt"
> & { ply: number };

export type TournamentRoundDto = {
  number: number;
  status: "ONGOING" | "COMPLETED";
  startedAt: string;
  completedAt: string | null;
  games: TournamentGameSummaryDto[];
};

export type TournamentRoundsResponse = { rounds: TournamentRoundDto[]; totalRounds: number | null };

export type TournamentKnockoutMatchDto = {
  id: string;
  bracketRound: number;
  slot: number;
  a: TournamentGamePlayerRef | null;
  b: TournamentGamePlayerRef | null;
  status: "PENDING" | "ONGOING" | "DECIDED";
  winnerPlayerId: string | null;
  decidedBy: "GAMES" | "SEED" | "BYE" | "FORFEIT" | null;
  /** A's and B's half-points over the match. */
  score: { a: number; b: number };
  gameIds: string[];
};

export type TournamentBracketResponse = { rounds: number; matches: TournamentKnockoutMatchDto[] };

export type TournamentGamesResponse = { games: TournamentGameSummaryDto[] };

// ── Phase 5: standings, live snapshot, management ──

export type TournamentStandingDto = {
  playerId: string;
  /** Overall rank (shared on a full tie). */
  rank: number | null;
  /** Rank inside the current filter (age group, rating band, batch); equals `rank` without a filter. */
  filteredRank: number | null;
  player: TournamentGamePlayerRef;
  status: TournamentPlayerStatus;
  ageGroup: string | null;
  /** Half-points for round formats, arena points for an arena. */
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  streak: number;
  onFire: boolean;
  tiebreaks: Partial<Record<TournamentTiebreak, number>>;
  performance: number | null;
};

export const tournamentStandingsQuerySchema = z
  .object({
    ageGroup: z.string().max(10).optional(),
    batchId: z.string().max(64).optional(),
    maxRating: z.coerce.number().int().min(0).max(3500).optional(),
    minRating: z.coerce.number().int().min(0).max(3500).optional()
  })
  .strict();
export type TournamentStandingsQuery = z.infer<typeof tournamentStandingsQuerySchema>;

export type TournamentStandingsResponse = {
  /** "half-points" for round formats (2 = 1 point), "arena-points" for an arena. */
  pointsUnit: "half-points" | "arena-points";
  tiebreaks: TournamentTiebreak[];
  standings: TournamentStandingDto[];
};

/** The live dashboard's one poll (docs/TOURNAMENTS.md §4): refetch when `version` changes. */
export type TournamentLiveDto = {
  version: number;
  tournament: TournamentSummaryDto & { arenaEndsAt: string | null; startedAt: string | null; endedAt: string | null; spectatorDelaySec: number };
  currentRound: number;
  totalRounds: number | null;
  /** When the next round starts on its own (break, schedule, or the time a host set), if one is due. */
  nextRoundAt: string | null;
  /** Between rounds with nothing set to start the next one: a host has to. */
  awaitingHost: boolean;
  ongoingGames: TournamentGameSummaryDto[];
  /** The top of the standings (the full table is its own route). */
  leaders: TournamentStandingDto[];
  me: { playerId: string; status: TournamentPlayerStatus; currentGameId: string | null; arenaPaused: boolean } | null;
  serverNow: string;
};

export const removeTournamentPlayerRequestSchema = z
  .object({
    status: z.enum(["WITHDRAWN", "DISQUALIFIED"]),
    reason: z.string().trim().min(3).max(500)
  })
  .strict();
export type RemoveTournamentPlayerRequest = z.infer<typeof removeTournamentPlayerRequestSchema>;

export type TournamentAuditEntryDto = {
  id: string;
  action: string;
  actor: TournamentPersonRef | null;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};
export type TournamentAuditResponse = {
  entries: TournamentAuditEntryDto[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
};

// ── Phase 6: commentary, broadcasting, real time ──

export const TOURNAMENT_COMMENTARY_TYPES = [
  "GENERAL",
  "GAME",
  "MOVE",
  "PLAYER",
  "ROUND",
  "ANNOUNCEMENT",
  "FEATURED",
  "EMERGENCY"
] as const;
export const tournamentCommentaryTypeSchema = z.enum(TOURNAMENT_COMMENTARY_TYPES);
export type TournamentCommentaryType = z.infer<typeof tournamentCommentaryTypeSchema>;

export const TOURNAMENT_COMMENTARY_TYPE_LABELS: Record<TournamentCommentaryType, string> = {
  ANNOUNCEMENT: "Announcement",
  EMERGENCY: "Important",
  FEATURED: "Featured",
  GAME: "Game",
  GENERAL: "Commentary",
  MOVE: "Move",
  PLAYER: "Player",
  ROUND: "Round"
};

const square = z.string().regex(/^[a-h][1-8]$/, "Not a square.");
export const tournamentHighlightToneSchema = z.enum(["primary", "accent", "danger", "success"]);
/** Squares and arrows drawn on the board for a position highlight. */
export const tournamentHighlightSchema = z
  .object({
    arrows: z.array(z.object({ from: square, to: square, tone: tournamentHighlightToneSchema }).strict()).max(12).default([]),
    squares: z.array(z.object({ square, tone: tournamentHighlightToneSchema }).strict()).max(24).default([])
  })
  .strict();
export type TournamentHighlight = z.infer<typeof tournamentHighlightSchema>;

export const TOURNAMENT_COMMENTARY_MAX = 2000;

export const createTournamentCommentaryRequestSchema = z
  .object({
    body: z.string().trim().min(1, "Write something.").max(TOURNAMENT_COMMENTARY_MAX),
    /** Client-made id: a resend (flaky network) never posts twice. */
    clientId: z.string().trim().min(8).max(64),
    fen: z.string().trim().max(100).nullable().optional(),
    gameId: z.string().max(64).nullable().optional(),
    highlight: tournamentHighlightSchema.nullable().optional(),
    pinned: z.boolean().optional(),
    playerId: z.string().max(64).nullable().optional(),
    /** The half-move the commentary is about (0 = the start position). */
    ply: z.number().int().min(0).max(2000).nullable().optional(),
    type: tournamentCommentaryTypeSchema
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.type === "GAME" || v.type === "MOVE" || v.type === "FEATURED") && !v.gameId) {
      ctx.addIssue({ code: "custom", message: "Pick the game.", path: ["gameId"] });
    }
    if (v.type === "MOVE" && (v.ply === undefined || v.ply === null)) ctx.addIssue({ code: "custom", message: "Pick the move.", path: ["ply"] });
    if (v.type === "PLAYER" && !v.playerId) ctx.addIssue({ code: "custom", message: "Pick the player.", path: ["playerId"] });
  });
export type CreateTournamentCommentaryRequest = z.input<typeof createTournamentCommentaryRequestSchema>;

export const hideTournamentCommentaryRequestSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
export type HideTournamentCommentaryRequest = z.infer<typeof hideTournamentCommentaryRequestSchema>;

export const pinTournamentCommentaryRequestSchema = z.object({ pinned: z.boolean() }).strict();

export const setTournamentFeaturedRequestSchema = z
  .object({ gameId: z.string().max(64).nullable().optional(), playerId: z.string().max(64).nullable().optional() })
  .strict();
export type SetTournamentFeaturedRequest = z.infer<typeof setTournamentFeaturedRequestSchema>;

export type TournamentCommentaryDto = {
  id: string;
  type: TournamentCommentaryType;
  body: string;
  author: TournamentPersonRef | null;
  game: { id: string; label: string } | null;
  player: { id: string; name: string } | null;
  ply: number | null;
  fen: string | null;
  highlight: TournamentHighlight | null;
  pinned: boolean;
  /** Hosts only: hidden by moderation (everyone else never receives it). */
  hidden: boolean;
  /** When spectators can read it; hosts see it before. */
  releaseAt: string;
  released: boolean;
  createdAt: string;
};

export type TournamentCommentaryResponse = { item: TournamentCommentaryDto };

export type TournamentCommentaryListResponse = {
  items: TournamentCommentaryDto[];
  pinned: TournamentCommentaryDto[];
  nextCursor: string | null;
  featured: { gameId: string | null; playerId: string | null };
};

/** LiveKit data topics of a tournament room (server-injected nudges only). */
export const TOURNAMENT_REALTIME_TOPICS = {
  commentary: "tournament_commentary",
  game: "tournament_game",
  spectate: "tournament_spectate",
  state: "tournament_state"
} as const;

export type TournamentRealtimeMessage =
  | { type: "state"; version: number }
  | { type: "commentary"; id: string; version: number }
  /**
   * To the two players only: their game changed. `move` carries the move that
   * led to `ply` while the game goes on, so the opponent's board updates
   * without a round trip; anything else (a result, a draw offer) is refetched.
   */
  | { type: "game"; gameId: string; ply: number; move?: TournamentRealtimeMove }
  /** To everyone: refetch this game at or after `visibleAt` (the delay is applied by the server). */
  | { type: "spectate"; gameId: string; visibleAt: string; finished: boolean };

export type TournamentRealtimeMove = {
  san: string;
  uci: string;
  fen: string;
  clock: TournamentGameDto["clock"];
  firstMoveDeadline: string | null;
};

export type TournamentRealtimeTokenResponse =
  | { enabled: false }
  | { enabled: true; room: string; token: string };

// ── Phase 7: the anonymous public projection (docs/TOURNAMENTS.md §4.1) ──
// No user id, avatar, date of birth, batch or contact data ever: a player is
// a per-tournament number, a public display name and a rating.

export type PublicTournamentPlayer = { number: number | null; name: string; rating: number | null };

export type PublicTournamentDto = Pick<
  TournamentSummaryDto,
  "id" | "slug" | "name" | "format" | "status" | "phase" | "startsAt" | "timeControl" | "rounds" | "arenaDurationMin" | "bannerUrl" | "logoUrl" | "playerCount" | "maxPlayers"
> & {
  description: string | null;
  rulesText: string | null;
  prizesText: string | null;
  spectatorDelaySec: number;
  arenaEndsAt: string | null;
  hosts: { name: string; role: TournamentHostRole }[];
};

export type PublicTournamentGameDto = Omit<TournamentGameDto, "white" | "black" | "viewerColor" | "tournamentId"> & {
  white: PublicTournamentPlayer;
  black: PublicTournamentPlayer | null;
};

export type PublicTournamentGameSummaryDto = Omit<TournamentGameSummaryDto, "white" | "black"> & {
  white: PublicTournamentPlayer;
  black: PublicTournamentPlayer | null;
};

export type PublicTournamentStandingDto = Omit<TournamentStandingDto, "player" | "playerId" | "performance"> & {
  player: PublicTournamentPlayer;
};

export type PublicTournamentLiveDto = {
  version: number;
  tournament: PublicTournamentDto;
  currentRound: number;
  totalRounds: number | null;
  nextRoundAt: string | null;
  ongoingGames: PublicTournamentGameSummaryDto[];
  leaders: PublicTournamentStandingDto[];
  featuredGameId: string | null;
  serverNow: string;
};

export type PublicTournamentCommentaryDto = Omit<TournamentCommentaryDto, "author" | "player" | "hidden"> & {
  author: { name: string } | null;
  player: { name: string } | null;
};

export type PublicTournamentListResponse = { items: PublicTournamentDto[]; pagination: TournamentListResponse["pagination"] };

// ── Phase 8: certificates, history, the academy dashboard ──

export const CERTIFICATE_ORIENTATIONS = ["LANDSCAPE", "PORTRAIT"] as const;
export const CERTIFICATE_BORDER_STYLES = ["CLASSIC", "MODERN", "MINIMAL"] as const;
export const TOURNAMENT_CERTIFICATE_KINDS = ["PLACEMENT", "AGE_GROUP_PLACEMENT", "PARTICIPATION"] as const;
export type TournamentCertificateKind = (typeof TOURNAMENT_CERTIFICATE_KINDS)[number];

export const TOURNAMENT_CERTIFICATE_KIND_LABELS: Record<TournamentCertificateKind, string> = {
  AGE_GROUP_PLACEMENT: "Top places in each age group",
  PARTICIPATION: "Everyone who took part",
  PLACEMENT: "Top places"
};

/** What a certificate body may say. Unknown placeholders are refused. */
export const CERTIFICATE_PLACEHOLDERS = [
  "player.name",
  "tournament.name",
  "placement",
  "points",
  "ageGroup",
  "date",
  "academy.name"
] as const;

const placeholderPattern = /\{\{\s*([\w.]+)\s*\}\}/g;

export function certificatePlaceholderIssue(text: string): string | null {
  for (const match of text.matchAll(placeholderPattern)) {
    if (!(CERTIFICATE_PLACEHOLDERS as readonly string[]).includes(match[1])) return `Unknown placeholder {{${match[1]}}}.`;
  }
  return null;
}

/** Fills a certificate text (plain text in, plain text out; never HTML). */
export function renderCertificateText(text: string, values: Partial<Record<(typeof CERTIFICATE_PLACEHOLDERS)[number], string>>): string {
  return text.replace(placeholderPattern, (_all, key: string) => values[key as keyof typeof values] ?? "");
}

/** "1st", "2nd", "3rd", "11th" — placements on certificates. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1F4FA8.");

export const certificateTemplateRequestSchema = z
  .object({
    accentColor: hexColor,
    body: z.string().trim().min(10).max(1000),
    borderStyle: z.enum(CERTIFICATE_BORDER_STYLES),
    name: z.string().trim().min(3).max(80),
    orientation: z.enum(CERTIFICATE_ORIENTATIONS),
    secondSignatoryName: z.string().trim().max(80).nullable().optional(),
    secondSignatoryTitle: z.string().trim().max(80).nullable().optional(),
    signatoryName: z.string().trim().max(80).nullable().optional(),
    signatoryTitle: z.string().trim().max(80).nullable().optional(),
    title: z.string().trim().min(3).max(80)
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const field of ["body", "title"] as const) {
      const issue = certificatePlaceholderIssue(v[field]);
      if (issue) ctx.addIssue({ code: "custom", message: issue, path: [field] });
    }
  });
export type CertificateTemplateRequest = z.infer<typeof certificateTemplateRequestSchema>;

export type CertificateTemplateDto = CertificateTemplateRequest & { id: string; archivedAt: string | null; createdAt: string; updatedAt: string };
export type CertificateTemplatesResponse = { templates: CertificateTemplateDto[] };

export const DEFAULT_CERTIFICATE_TEMPLATE: CertificateTemplateRequest = {
  accentColor: "#1F4FA8",
  body: "This certifies that {{player.name}} placed {{placement}} in {{tournament.name}} with {{points}} points.",
  borderStyle: "CLASSIC",
  name: "Achievement",
  orientation: "LANDSCAPE",
  signatoryName: null,
  signatoryTitle: null,
  title: "Certificate of Achievement"
};

export const tournamentCertificateRuleSchema = z
  .object({
    kind: z.enum(TOURNAMENT_CERTIFICATE_KINDS),
    minGames: z.number().int().min(0).max(50).nullable().optional(),
    templateId: z.string().min(1).max(64),
    topN: z.number().int().min(1).max(50).nullable().optional()
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind !== "PARTICIPATION" && !v.topN) ctx.addIssue({ code: "custom", message: "How many places get one?", path: ["topN"] });
  });
export const setTournamentCertificateRulesRequestSchema = z.object({ rules: z.array(tournamentCertificateRuleSchema).max(10) }).strict();
export type SetTournamentCertificateRulesRequest = z.infer<typeof setTournamentCertificateRulesRequestSchema>;
export type TournamentCertificateRuleDto = z.infer<typeof tournamentCertificateRuleSchema> & { id: string; templateName: string };
export type TournamentCertificateRulesResponse = { rules: TournamentCertificateRuleDto[] };

export type TournamentCertificateSnapshot = {
  playerName: string;
  tournamentName: string;
  academyName: string;
  placement: string;
  points: string;
  ageGroup: string | null;
  date: string;
  template: Omit<CertificateTemplateRequest, "name">;
};

export type TournamentCertificateDto = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  user: TournamentPersonRef;
  kind: TournamentCertificateKind;
  placement: string;
  serialNumber: string;
  verificationCode: string;
  issuedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
};
export type TournamentCertificatesResponse = { certificates: TournamentCertificateDto[] };

export const revokeTournamentCertificateRequestSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

export type CertificateVerificationDto =
  | { valid: false }
  | { valid: true; revoked: boolean; name: string; tournamentName: string; placement: string; issuedAt: string; academyName: string };

/** A player's tournament history (student page, admin student view). */
export type TournamentHistoryEntryDto = {
  tournament: TournamentSummaryDto;
  status: TournamentPlayerStatus;
  rank: number | null;
  points: number;
  pointsUnit: "half-points" | "arena-points";
  played: number;
  wins: number;
  draws: number;
  losses: number;
  performance: number | null;
  certificates: TournamentCertificateDto[];
};
export type TournamentHistoryResponse = { entries: TournamentHistoryEntryDto[] };

export type AdminTournamentOverviewDto = {
  counts: Record<TournamentStatus, number>;
  pendingRegistrations: number;
  pendingPublishRequests: number;
  playersThisYear: number;
  completionRate: number | null;
  forfeitRate: number | null;
  hosts: { user: TournamentPersonRef; tournaments: number; live: number }[];
  upcoming: TournamentSummaryDto[];
  live: TournamentSummaryDto[];
  recent: (TournamentSummaryDto & { champion: TournamentPersonRef | null })[];
};

export type AdminTournamentRegistrationDto = TournamentPlayerDto & { tournament: Pick<TournamentSummaryDto, "id" | "name" | "startsAt" | "status"> };
export type AdminTournamentRegistrationsResponse = {
  registrations: AdminTournamentRegistrationDto[];
  pagination: TournamentListResponse["pagination"];
};
