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
  return issues;
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

export const TOURNAMENT_IMAGE_KINDS = ["banner", "logo"] as const;
export const tournamentImageKindSchema = z.enum(TOURNAMENT_IMAGE_KINDS);
export type TournamentImageKind = z.infer<typeof tournamentImageKindSchema>;
export const TOURNAMENT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
