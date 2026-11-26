// ──────────────────────────────────────────────────────────────
// Weak spots (docs/WEAK_SPOTS.md): what keeps going wrong in a student's
// play, judged by the engine, never guessed. One profile from the nightly
// play review's per-motif chance counts (every board the student played:
// class board, Storm/Racer, homework, matches, own games…) plus their puzzle
// results by theme. Pure and shared: the API builds it, the web shows it.
// ──────────────────────────────────────────────────────────────

import { z } from "zod";
import { INSIGHT_THRESHOLDS } from "./game-analysis-report";
import { TACTIC_MOTIF_LABELS, TACTIC_MOTIFS, type TacticMotif } from "./game-tactics";
import type { PlayFinding, PlaySource } from "./ai-review";
import { isCleanSolve, type TrainingResult } from "./puzzle-training";

/** Days of play a profile reads (WS-6). */
export const WEAK_SPOT_WINDOW_DAYS = 60;
/** The trend compares the latest half of the window with the half before. */
export const WEAK_SPOT_TREND_DAYS = 30;
/** Weak spots / strengths shown at most. */
export const WEAK_SPOT_TOP = 3;
/** Example positions per weak spot. */
export const WEAK_SPOT_EXAMPLES = 3;
/** A trend moves only on a miss-rate change of at least this much. */
export const WEAK_SPOT_TREND_CHANGE = 0.15;
/** Loss assumed for a miss the engine gave no number for (ranking only). */
const UNKNOWN_LOSS = 10;

/**
 * The same bar as game insights' "recurring weakness" (GAME_ANALYSIS.md §8):
 * denominators are chances, never games or moves.
 */
export const WEAK_SPOT_THRESHOLDS = {
  minOpportunitiesForRate: INSIGHT_THRESHOLDS.minOpportunitiesForRate,
  minMissesForWeakness: INSIGHT_THRESHOLDS.minMissesForWeakness,
  /** Different items (boards, games, runs) with a miss. */
  minItemsForWeakness: INSIGHT_THRESHOLDS.minGamesForWeakness,
  weaknessMissRate: INSIGHT_THRESHOLDS.weaknessMissRate,
  strengthFoundRate: INSIGHT_THRESHOLDS.strengthFoundRate
} as const;

/** The student's chances of one motif in one reviewed item. */
export type PlayTacticCounts = { found: number; missed: number; alternative: number; allowed: number };
/** Per motif; stored with each review (`ai_play_reviews.tacticsJson`). */
export type PlayTacticStats = Partial<Record<TacticMotif, PlayTacticCounts>>;

/** Lichess puzzle themes that practise each motif (practice picks, puzzle results). */
export const WEAK_SPOT_LICHESS_THEMES: Record<TacticMotif, readonly string[]> = {
  BACK_RANK_MATE: ["backRankMate"],
  DISCOVERED_ATTACK: ["discoveredAttack"],
  DISCOVERED_CHECK: ["discoveredCheck"],
  DOUBLE_ATTACK: ["fork"],
  DOUBLE_CHECK: ["doubleCheck"],
  FORK: ["fork"],
  HANGING_PIECE: ["hangingPiece"],
  INTERMEDIATE_MOVE: ["intermezzo"],
  MATE: ["mateIn1", "mateIn2", "mateIn3"],
  // No clean Lichess theme: shown, not practised from the catalogue.
  MATERIAL_GAIN: [],
  PIN: ["pin"],
  PROMOTION: ["promotion", "advancedPawn"],
  REMOVAL_OF_DEFENDER: ["capturingDefender", "deflection"],
  SKEWER: ["skewer"]
};

/**
 * What each one means and how to practise it, in words a child understands.
 * WS-4: students see a tip only after a coach or admin of their academy read
 * it (`resolveWeakSpotTip`); changing a text here asks every academy to read
 * it again.
 */
export const WEAK_SPOT_TIPS: Record<TacticMotif, string> = {
  BACK_RANK_MATE:
    "A king stuck behind its own pawns can be mated on the back rank. Before every move, check whether a rook or queen can reach the enemy's back rank, and give your own king an escape square.",
  DISCOVERED_ATTACK:
    "Moving one piece out of the way can let another piece behind it attack. Look for pieces lined up behind your own pieces.",
  DISCOVERED_CHECK:
    "Moving a piece out of the way can give check with the piece behind it, and the piece that moved can attack something else at the same time.",
  DOUBLE_ATTACK:
    "One move can attack two things at once. Look for a move that hits two loose pieces, or a piece and the king.",
  DOUBLE_CHECK:
    "Two pieces giving check at once: the king must move. Look for a discovered check where the moving piece also checks.",
  FORK: "One piece attacks two pieces at the same time. Knights and queens fork most often; look for squares that touch two targets.",
  HANGING_PIECE:
    "A piece nobody defends can simply be taken. Before every move, ask: what did my opponent leave undefended, and what did I?",
  INTERMEDIATE_MOVE:
    "Before recapturing, look for a stronger move first: a check or a threat that the opponent must answer.",
  MATE: "There was a forced checkmate. Always look at checks first: every check, then every capture, then every threat.",
  MATERIAL_GAIN:
    "There was a way to win material. Look at checks, captures and threats before choosing a quiet move.",
  PIN: "A pinned piece can't move without exposing something more valuable behind it. Look for pieces lined up with the king or queen.",
  PROMOTION:
    "A pawn close to the last rank can become a queen. Count who gets there first, and look for ways to clear its path.",
  REMOVAL_OF_DEFENDER:
    "Take or chase away the piece that defends something, and what it defended falls.",
  SKEWER:
    "Like a pin the other way round: attack a valuable piece so that when it moves, the piece behind it can be taken."
};

export type WeakSpotVerdict = "WEAKNESS" | "STRENGTH" | "NEUTRAL" | "NOT_ENOUGH_DATA";
export type WeakSpotTrend = "BETTER" | "SAME" | "WORSE";

/** One reviewed item, as the API reads it. */
export type WeakSpotPlayItem = {
  source: PlaySource;
  sourceId: string;
  /** ISO-8601 UTC. */
  playedAt: string;
  /** Null for a review written before chance counts were stored. */
  tactics: PlayTacticStats | null;
  findings: PlayFinding[];
};

export type WeakSpotExample = {
  source: PlaySource;
  sourceId: string;
  /** ISO-8601 UTC. */
  playedAt: string;
  segment: number;
  ply: number;
  /** The position the student had to move in. */
  fen: string;
  playedSan: string;
  bestMoveSan: string | null;
  /** Filled by the API (for the board arrows); null when it couldn't be read. */
  playedUci: string | null;
  bestMoveUci: string | null;
  winPercentLoss: number | null;
};

/** NOT_READ: no one in the academy read it yet; CHANGED: the built-in text changed since it was read. */
export type WeakSpotTipStatus = "NOT_READ" | "READ" | "CHANGED";

export type WeakSpotMotif = {
  motif: TacticMotif;
  label: string;
  /**
   * Staff: the academy's read wording, else the built-in tip. Student: the
   * read wording only, null until a coach read it.
   */
  tip: string | null;
  tipStatus: WeakSpotTipStatus;
  verdict: WeakSpotVerdict;
  /** Found + missed + alternative (an alternative cost less than a mistake). */
  opportunities: number;
  found: number;
  missed: number;
  alternative: number;
  /** The opponent's chances of this motif that the student's own move handed over. */
  allowed: number;
  /** Null below `minOpportunitiesForRate`. */
  missRate: number | null;
  /** Items (boards, games, runs) with at least one miss. */
  itemsWithMiss: number;
  /** Misses by where they happened, most first. */
  bySource: { source: PlaySource; missed: number }[];
  /** Mean expected-score loss of the misses with a number, 0–100. */
  averageLoss: number | null;
  /** Latest half of the window vs the half before; null without enough chances in both. */
  trend: WeakSpotTrend | null;
  /** Puzzles in these themes in the window; null when the motif has no theme or none were played. */
  puzzles: { attempts: number; clean: number } | null;
  practiceThemes: readonly string[];
  examples: WeakSpotExample[];
};

export type WeakSpotProfile = {
  windowDays: number;
  /** ISO-8601 UTC: the window's start. */
  since: string;
  reviewedItems: number;
  /** Reviewed items with chance counts (the rates come only from these). */
  itemsWithStats: number;
  puzzleAttempts: number;
  /** Worst first (misses × average loss), at most WEAK_SPOT_TOP. */
  weakSpots: WeakSpotMotif[];
  /** Most chances first, at most WEAK_SPOT_TOP. */
  strengths: WeakSpotMotif[];
  /** Every other motif the student met, most chances first. */
  others: WeakSpotMotif[];
};

export type WeakSpotProfileResponse = WeakSpotProfile;

export type WeakSpotAudience = "STAFF" | "STUDENT";

/** One academy's reading of a tip (`weak_spot_tip_reviews`). */
export type WeakSpotTipReading = { baseText: string; text: string };
export type WeakSpotTipReadings = Partial<Record<TacticMotif, WeakSpotTipReading>>;

/**
 * The one rule for what a tip says and who may see it (WS-4): a reading
 * counts only while the built-in text is still the one that was read.
 */
export function resolveWeakSpotTip(
  motif: TacticMotif,
  reading: WeakSpotTipReading | null | undefined
): { status: WeakSpotTipStatus; staffText: string; studentText: string | null } {
  const builtIn = WEAK_SPOT_TIPS[motif];
  if (!reading) return { staffText: builtIn, status: "NOT_READ", studentText: null };
  if (reading.baseText !== builtIn) return { staffText: builtIn, status: "CHANGED", studentText: null };
  return { staffText: reading.text, status: "READ", studentText: reading.text };
}

export type WeakSpotInput = {
  /** ISO-8601 UTC. */
  now: string;
  /** Who reads it: a student sees only tips their academy read (default STAFF). */
  audience?: WeakSpotAudience;
  tipReadings?: WeakSpotTipReadings;
  /** Reviewed (DONE) items in the window, any order. */
  items: WeakSpotPlayItem[];
  /** Finished puzzle attempts in the window, any order. */
  puzzles: TrainingResult[];
};

const emptyCounts = (): PlayTacticCounts => ({ allowed: 0, alternative: 0, found: 0, missed: 0 });
const chances = (c: PlayTacticCounts) => c.found + c.missed + c.alternative;
const round2 = (n: number) => Math.round(n * 100) / 100;

function trendOf(recent: PlayTacticCounts, earlier: PlayTacticCounts): WeakSpotTrend | null {
  const min = WEAK_SPOT_THRESHOLDS.minOpportunitiesForRate;
  if (chances(recent) < min || chances(earlier) < min) return null;
  const change = recent.missed / chances(recent) - earlier.missed / chances(earlier);
  if (change <= -WEAK_SPOT_TREND_CHANGE) return "BETTER";
  if (change >= WEAK_SPOT_TREND_CHANGE) return "WORSE";
  return "SAME";
}

function verdictOf(total: PlayTacticCounts, itemsWithMiss: number): { missRate: number | null; verdict: WeakSpotVerdict } {
  const t = WEAK_SPOT_THRESHOLDS;
  const n = chances(total);
  if (n < t.minOpportunitiesForRate) return { missRate: null, verdict: "NOT_ENOUGH_DATA" };
  const missRate = round2(total.missed / n);
  if (missRate >= t.weaknessMissRate && total.missed >= t.minMissesForWeakness && itemsWithMiss >= t.minItemsForWeakness) {
    return { missRate, verdict: "WEAKNESS" };
  }
  if ((total.found + total.alternative) / n >= t.strengthFoundRate) return { missRate, verdict: "STRENGTH" };
  return { missRate, verdict: "NEUTRAL" };
}

/**
 * The student's weak spots and strengths over the last WEAK_SPOT_WINDOW_DAYS.
 * Rates come only from items with chance counts; examples and the cost of a
 * miss come from the review's findings (worst first, at most 8 per item).
 */
export function buildWeakSpotProfile(input: WeakSpotInput): WeakSpotProfile {
  const now = Date.parse(input.now);
  const since = now - WEAK_SPOT_WINDOW_DAYS * 86_400_000;
  const split = now - WEAK_SPOT_TREND_DAYS * 86_400_000;
  const items = input.items
    .filter((item) => {
      const at = Date.parse(item.playedAt);
      return at >= since && at <= now;
    })
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt));
  const puzzles = input.puzzles.filter((p) => {
    const at = Date.parse(p.completedAt);
    return at >= since && at <= now;
  });

  const all: WeakSpotMotif[] = [];
  for (const motif of TACTIC_MOTIFS) {
    const total = emptyCounts();
    const recent = emptyCounts();
    const earlier = emptyCounts();
    const missesBySource = new Map<PlaySource, number>();
    let itemsWithMiss = 0;
    for (const item of items) {
      const c = item.tactics?.[motif];
      if (!c) continue;
      const half = Date.parse(item.playedAt) >= split ? recent : earlier;
      for (const target of [total, half]) {
        target.found += c.found;
        target.missed += c.missed;
        target.alternative += c.alternative;
        target.allowed += c.allowed;
      }
      if (c.missed > 0) {
        itemsWithMiss += 1;
        missesBySource.set(item.source, (missesBySource.get(item.source) ?? 0) + c.missed);
      }
    }

    const misses = items.flatMap((item) =>
      item.findings.filter((f) => f.kind === "MISSED_TACTIC" && f.motif === motif).map((finding) => ({ finding, item }))
    );
    if (chances(total) === 0 && total.allowed === 0 && misses.length === 0) continue;

    const losses = misses.map((m) => m.finding.winPercentLoss).filter((loss): loss is number => loss !== null);
    const averageLoss = losses.length ? Math.round((losses.reduce((a, b) => a + b, 0) / losses.length) * 10) / 10 : null;
    const themes = WEAK_SPOT_LICHESS_THEMES[motif];
    const themed = themes.length ? puzzles.filter((p) => p.themes.some((theme) => themes.includes(theme))) : [];
    // Newest first, one per item, so the examples show different games.
    const seen = new Set<string>();
    const examples: WeakSpotExample[] = [];
    for (const { finding, item } of misses) {
      const key = `${item.source}:${item.sourceId}`;
      if (seen.has(key) || examples.length >= WEAK_SPOT_EXAMPLES) continue;
      seen.add(key);
      examples.push({
        bestMoveSan: finding.bestMoveSan,
        bestMoveUci: null,
        fen: finding.fenBefore,
        playedAt: item.playedAt,
        playedSan: finding.playedSan,
        playedUci: null,
        ply: finding.ply,
        segment: finding.segment,
        source: item.source,
        sourceId: item.sourceId,
        winPercentLoss: finding.winPercentLoss
      });
    }

    const tip = resolveWeakSpotTip(motif, input.tipReadings?.[motif]);
    all.push({
      ...total,
      ...verdictOf(total, itemsWithMiss),
      averageLoss,
      bySource: [...missesBySource.entries()]
        .map(([source, missed]) => ({ missed, source }))
        .sort((a, b) => b.missed - a.missed || a.source.localeCompare(b.source)),
      examples,
      itemsWithMiss,
      label: TACTIC_MOTIF_LABELS[motif],
      motif,
      opportunities: chances(total),
      practiceThemes: themes,
      puzzles: themed.length ? { attempts: themed.length, clean: themed.filter(isCleanSolve).length } : null,
      tip: (input.audience ?? "STAFF") === "STUDENT" ? tip.studentText : tip.staffText,
      tipStatus: tip.status,
      trend: trendOf(recent, earlier)
    });
  }

  const cost = (m: WeakSpotMotif) => m.missed * (m.averageLoss ?? UNKNOWN_LOSS);
  const weakSpots = all
    .filter((m) => m.verdict === "WEAKNESS")
    .sort((a, b) => cost(b) - cost(a) || b.missed - a.missed || a.motif.localeCompare(b.motif))
    .slice(0, WEAK_SPOT_TOP);
  const strengths = all
    .filter((m) => m.verdict === "STRENGTH")
    .sort((a, b) => b.opportunities - a.opportunities || a.motif.localeCompare(b.motif))
    .slice(0, WEAK_SPOT_TOP);
  const shown = new Set([...weakSpots, ...strengths].map((m) => m.motif));
  const others = all
    .filter((m) => !shown.has(m.motif))
    .sort((a, b) => b.opportunities - a.opportunities || b.missed - a.missed || a.motif.localeCompare(b.motif));

  return {
    itemsWithStats: items.filter((item) => item.tactics !== null).length,
    others,
    puzzleAttempts: puzzles.length,
    reviewedItems: items.length,
    since: new Date(since).toISOString(),
    strengths,
    weakSpots,
    windowDays: WEAK_SPOT_WINDOW_DAYS
  };
}

// ── Contract: tips, homework, practice ─────────────────────────

export const weakSpotMotifSchema = z.enum(TACTIC_MOTIFS);

export const WEAK_SPOT_TIP_LIMITS = { max: 400, min: 20 } as const;

/** Read a tip (optionally in the academy's own words); students see it from then on. */
export const readWeakSpotTipRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(WEAK_SPOT_TIP_LIMITS.min, `Write at least ${WEAK_SPOT_TIP_LIMITS.min} characters.`)
    .max(WEAK_SPOT_TIP_LIMITS.max, `Keep it under ${WEAK_SPOT_TIP_LIMITS.max} characters.`)
});
export type ReadWeakSpotTipRequest = z.infer<typeof readWeakSpotTipRequestSchema>;

export type WeakSpotTipItem = {
  motif: TacticMotif;
  label: string;
  /** Our text (WEAK_SPOT_TIPS). */
  builtInText: string;
  /** What students see once read: the academy's wording, else the built-in text. */
  text: string;
  status: WeakSpotTipStatus;
  reviewedByName: string | null;
  /** ISO-8601 UTC. */
  reviewedAt: string | null;
};

export type WeakSpotTipsResponse = { tips: WeakSpotTipItem[] };

/** Homework picks: catalogue puzzles this far around the student's puzzle rating. */
export const WEAK_SPOT_HOMEWORK_RATING = { above: 150, below: 100 } as const;
export const WEAK_SPOT_HOMEWORK_SIZE = { default: 10, max: 20, min: 3 } as const;

export const weakSpotHomeworkRequestSchema = z.object({
  motif: weakSpotMotifSchema,
  count: z
    .number()
    .int()
    .min(WEAK_SPOT_HOMEWORK_SIZE.min)
    .max(WEAK_SPOT_HOMEWORK_SIZE.max)
    .default(WEAK_SPOT_HOMEWORK_SIZE.default)
});
export type WeakSpotHomeworkRequest = z.input<typeof weakSpotHomeworkRequestSchema>;

export type WeakSpotHomeworkResponse = {
  /** The new puzzle-set assignment, in the author's library and not assigned to anyone yet. */
  assignmentId: string;
  title: string;
  puzzleCount: number;
  targetRating: number;
};

/** Never names the student: the set may go to a whole batch. */
export const weakSpotHomeworkTitle = (motif: TacticMotif) => `${TACTIC_MOTIF_LABELS[motif]} practice`;

export function weakSpotHomeworkDescription(motif: TacticMotif, targetRating: number): string {
  return `Puzzles on ${TACTIC_MOTIF_LABELS[motif].toLowerCase()}, around puzzle rating ${targetRating}. ${WEAK_SPOT_TIPS[motif]}`;
}

/**
 * Rating bands (50 points wide, as `lichess_puzzles.ratingBand`) to look in,
 * nearest to the student's rating first, from WEAK_SPOT_HOMEWORK_RATING.below
 * under it to .above over it.
 */
export function weakSpotHomeworkBands(rating: number): number[] {
  const home = Math.floor(rating / 50);
  const low = Math.floor((rating - WEAK_SPOT_HOMEWORK_RATING.below) / 50);
  const high = Math.floor((rating + WEAK_SPOT_HOMEWORK_RATING.above) / 50);
  const bands: number[] = [];
  for (let b = low; b <= high; b += 1) if (b >= 0) bands.push(b);
  return bands.sort((a, b) => Math.abs(a - home) - Math.abs(b - home) || a - b);
}

/** Puzzle-training themes for the profile's weak spots, worst first (the WEAK slot). */
export function weakSpotTrainingThemes(profile: Pick<WeakSpotProfile, "weakSpots">): string[] {
  return [...new Set(profile.weakSpots.flatMap((spot) => spot.practiceThemes))];
}
