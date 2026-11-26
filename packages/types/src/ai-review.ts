import { z } from "zod";
import type { AiProviderId } from "./ai-providers";

// ──────────────────────────────────────────────────────────────
// AI play review (docs/AI_PLAY_REVIEW.md).
//
//  - The play feed: every board move a student plays anywhere in the app, as
//    one read model over the records the features already keep (no copy).
//  - The engine review: our own Stockfish, on our own server, for every
//    student (disclosed in the terms and privacy policy; no switch).
//  - Outside-AI comments: an outside language model writes short coach-style
//    comments on top of the engine review, ONLY for a student whose switch is
//    on (`outsideAiAllowed`). The model gets pseudonymised play: positions,
//    moves and the engine's findings, never a name, id, batch or academy.
// ──────────────────────────────────────────────────────────────

/**
 * The consent text shown before the outside-AI switch is turned on. Bump it
 * whenever the wording or the retention changes: a student who agreed to an
 * older version counts as "off" until asked again. The providers are not part
 * of the version: each consent row records the providers it named
 * (`providers`), and play only goes to those (`aiConsentCoveredProviders`).
 */
export const AI_REVIEW_CONSENT_VERSION = 1;

/** Past play the engine review backfills for every student (days). */
export const PLAY_REVIEW_BACKFILL_DAYS = 90;
/** Items the nightly engine review takes per academy per night. */
export const PLAY_REVIEW_NIGHTLY_ITEM_CAP = 300;
/** Wall-clock budget of one nightly run per academy (ms). */
export const PLAY_REVIEW_NIGHTLY_BUDGET_MS = 90 * 60_000;
/** Outside-AI comments written per academy per night. */
export const PLAY_REVIEW_NIGHTLY_COMMENT_CAP = 100;
/** Version of the review rules below (findings, roll-up); stored with every review. */
export const PLAY_REVIEW_RULES_VERSION = "play-review-v1";
/** Findings kept per review (worst first). */
export const PLAY_REVIEW_MAX_FINDINGS = 8;
/** Days an engine review / outside-AI comment is kept (`RETENTION_RULES`). */
export const PLAY_REVIEW_RETENTION_DAYS = 365;

// ── Sources ─────────────────────────────────────────────────

export const PLAY_SOURCES = [
  "PUZZLE",
  "ASSIGNMENT",
  "PLAYOUT",
  "POLL",
  "MATCH",
  "SIMUL",
  "TOURNAMENT",
  "OWN_GAME",
  "RUSH",
  "CLASS_BOARD"
] as const;
export type PlaySource = (typeof PLAY_SOURCES)[number];
export const playSourceSchema = z.enum(PLAY_SOURCES);

export const PLAY_SOURCE_LABELS: Record<PlaySource, string> = {
  ASSIGNMENT: "Homework",
  CLASS_BOARD: "Class board",
  MATCH: "Class match",
  OWN_GAME: "Own game",
  PLAYOUT: "Playout",
  POLL: "Move poll",
  PUZZLE: "Puzzle",
  RUSH: "Storm / Racer",
  SIMUL: "Simul",
  TOURNAMENT: "Tournament"
};

export type PlayColor = "white" | "black";

export type PlayMove = {
  /** Half-moves from the segment's start position, 1-based. */
  ply: number;
  uci: string;
  san: string | null;
  /** True for a move the student played (opponent, engine and setup moves are false). */
  byStudent: boolean;
  /** For graded play (puzzles, homework lines, polls): was this move the expected one. */
  correct: boolean | null;
  elapsedMs: number | null;
};

/** One board line: a whole game, or one puzzle of a Storm run. */
export type PlaySegment = {
  label: string | null;
  startFen: string;
  /** The side the student played in this segment. */
  studentSide: PlayColor | null;
  moves: PlayMove[];
  /** "SOLVED" | "FAILED" | "1-0" | … as the feature records it. */
  result: string | null;
};

export type PlayReviewStatus = "DONE" | "FAILED" | "SKIPPED";

/** What a list row shows of the engine review. */
export type PlayReviewSummary = {
  status: PlayReviewStatus;
  /** The student's accuracy over the item (null when too few moves to judge). */
  accuracy: number | null;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  missedTactics: number;
  reviewedAt: string;
  hasComment: boolean;
};

export type PlayItemSummary = {
  /** `${source}:${sourceId}` — stable across pages. */
  key: string;
  source: PlaySource;
  sourceId: string;
  title: string;
  /** ISO-8601 UTC. */
  playedAt: string;
  result: string | null;
  studentMoveCount: number;
  classId: string | null;
  batchId: string | null;
  review: PlayReviewSummary | null;
};

export type PlayItem = PlayItemSummary & { segments: PlaySegment[] };

export const PLAY_FEED_PAGE_SIZE = 20;

export const playFeedQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  source: playSourceSchema.optional()
});
export type PlayFeedQuery = z.infer<typeof playFeedQuerySchema>;

/** Newest first; `nextCursor` is null on the last page. */
export type PlayFeedResponse = {
  items: PlayItemSummary[];
  nextCursor: string | null;
};

// ── Engine review ───────────────────────────────────────────

export type PlayFindingKind = "BLUNDER" | "MISTAKE" | "INACCURACY" | "MISSED_MATE" | "MISSED_WIN" | "MISSED_TACTIC";

export type PlayFinding = {
  kind: PlayFindingKind;
  segment: number;
  /** Ply of the student's move in the segment (1-based, as `PlayMove.ply`). */
  ply: number;
  fenBefore: string;
  playedSan: string;
  bestMoveSan: string | null;
  /** Expected-score points the move cost, 0–100, from the student's side. */
  winPercentLoss: number | null;
  /** MISSED_TACTIC: the motif (FORK, PIN, …). */
  motif: string | null;
};

export type PlayReview = PlayReviewSummary & {
  findings: PlayFinding[];
  studentMoves: number;
  /** Versions the numbers were made with (engine, classification, accuracy, rules). */
  versions: Record<string, string>;
  error: string | null;
};

export type AiPlayCommentView = {
  text: string;
  provider: string;
  model: string;
  createdAt: string;
};

export type PlayItemDetailResponse = {
  item: PlayItem;
  review: PlayReview | null;
  comment: AiPlayCommentView | null;
};

/** Weekly roll-up for the student page: themes and accuracy by source. */
export type PlayReviewRollup = {
  /** ISO-8601 UTC, inclusive. */
  since: string;
  reviewed: number;
  averageAccuracy: number | null;
  bySource: { source: PlaySource; reviewed: number; averageAccuracy: number | null; blunders: number }[];
  /** Most frequent finding kinds / missed motifs, most frequent first. */
  themes: { label: string; count: number }[];
};

// ── Outside-AI switch (consent) ─────────────────────────────

export const AI_CONSENT_CHANGED_BY = ["STUDENT", "COACH", "ADMIN"] as const;
export type AiConsentChangedBy = (typeof AI_CONSENT_CHANGED_BY)[number];

export const setAiReviewConsentRequestSchema = z
  .object({
    allowed: z.boolean(),
    /** Switching ON needs "my parent or guardian agrees" (or, for staff, "a parent agreed"). */
    guardianConfirmed: z.boolean().optional()
  })
  .refine((v) => !v.allowed || v.guardianConfirmed === true, {
    message: "A parent or guardian must agree before the outside AI is switched on.",
    path: ["guardianConfirmed"]
  });
export type SetAiReviewConsentRequest = z.infer<typeof setAiReviewConsentRequestSchema>;

export type AiReviewConsentState = {
  /** True only when the latest change switched it on for the current version. */
  allowed: boolean;
  /** ISO-8601 UTC of the latest change; null when never set. */
  changedAt: string | null;
  changedBy: AiConsentChangedBy | null;
  /** The version the client must show (and the student agree to). */
  currentVersion: number;
  /** On for an older version: the student is asked again. */
  needsReconsent: boolean;
  /** Whether comments are actually being written (every condition of `outsideAiAllowed`). */
  active: boolean;
  /** The parts of `outsideAiAllowed` other than consent, so the UI can say why it's idle. */
  academyEnabled: boolean;
  planIncludes: boolean;
  providerConfigured: boolean;
  /** The providers the student's play would go to now, named ("Groq or Google Gemini"). */
  providerName: string | null;
};

// ── Academy settings ────────────────────────────────────────

export type AiPlayReviewSettings = {
  /** Nightly engine review of every student's play (on by default). */
  engineReviewEnabled: boolean;
  /** Outside-AI comments for students who switched them on (off by default). */
  outsideAiEnabled: boolean;
  planIncludes: boolean;
  providerConfigured: boolean;
  providerName: string | null;
  consentedStudents: number;
};

export const updateAiPlayReviewSettingsRequestSchema = z
  .object({
    engineReviewEnabled: z.boolean().optional(),
    outsideAiEnabled: z.boolean().optional()
  })
  .refine((v) => v.engineReviewEnabled !== undefined || v.outsideAiEnabled !== undefined, {
    message: "Nothing to change."
  });
export type UpdateAiPlayReviewSettingsRequest = z.infer<typeof updateAiPlayReviewSettingsRequestSchema>;

// ── The one rule ────────────────────────────────────────────

export type OutsideAiInput = {
  academyEnabled: boolean;
  planIncludes: boolean;
  providerConfigured: boolean;
  /** The student's latest consent row, or null when never set. */
  consent: { allowed: boolean; version: number } | null;
};

/** A consent row counts only when it switched the AI on for the current wording. */
export function aiConsentIsCurrent(consent: { allowed: boolean; version: number } | null): boolean {
  return !!consent && consent.allowed && consent.version === AI_REVIEW_CONSENT_VERSION;
}

/**
 * The providers a student's play may go to: those of the feature's current
 * route that the student's current consent named. A provider the operator
 * added later is left out until the student agrees again.
 */
export function aiConsentCoveredProviders(
  consent: { allowed: boolean; version: number; providers: readonly string[] } | null,
  routeProviders: readonly AiProviderId[]
): AiProviderId[] {
  if (!consent || !aiConsentIsCurrent(consent)) return [];
  return routeProviders.filter((id) => consent.providers.includes(id));
}

/**
 * Outside-AI comments for a student: the academy switch is on, the plan
 * includes AI play review, a provider is configured, and the student's
 * current consent is on. Anything else: nothing leaves the server.
 */
export function outsideAiAllowed(input: OutsideAiInput): boolean {
  return input.academyEnabled && input.planIncludes && input.providerConfigured && aiConsentIsCurrent(input.consent);
}

// ── Pure helpers shared by the API and the web ──────────────

export const playItemKey = (source: PlaySource, sourceId: string) => `${source}:${sourceId}`;

/** Parse a `${source}:${sourceId}` key; null when malformed. */
export function parsePlayItemKey(key: string): { source: PlaySource; sourceId: string } | null {
  const at = key.indexOf(":");
  if (at <= 0) return null;
  const source = playSourceSchema.safeParse(key.slice(0, at));
  const sourceId = key.slice(at + 1);
  if (!source.success || !/^[A-Za-z0-9_.-]{1,120}$/.test(sourceId)) return null;
  return { source: source.data, sourceId };
}

export const PLAY_FINDING_LABELS: Record<PlayFindingKind, string> = {
  BLUNDER: "Blunder",
  INACCURACY: "Inaccuracy",
  MISSED_MATE: "Missed checkmate",
  MISSED_TACTIC: "Missed tactic",
  MISSED_WIN: "Missed win",
  MISTAKE: "Mistake"
};

const FINDING_RANK: Record<PlayFindingKind, number> = {
  BLUNDER: 0,
  INACCURACY: 5,
  MISSED_MATE: 1,
  MISSED_TACTIC: 3,
  MISSED_WIN: 2,
  MISTAKE: 4
};

/** Worst first (kind, then cost), at most `PLAY_REVIEW_MAX_FINDINGS`. */
export function rankPlayFindings(findings: PlayFinding[]): PlayFinding[] {
  return [...findings]
    .sort(
      (a, b) =>
        FINDING_RANK[a.kind] - FINDING_RANK[b.kind] ||
        (b.winPercentLoss ?? 0) - (a.winPercentLoss ?? 0) ||
        a.segment - b.segment ||
        a.ply - b.ply
    )
    .slice(0, PLAY_REVIEW_MAX_FINDINGS);
}

/** Mean of the non-null accuracies, rounded; null when there are none. */
export function averageAccuracy(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => typeof v === "number");
  if (known.length === 0) return null;
  return Math.round(known.reduce((sum, v) => sum + v, 0) / known.length);
}
