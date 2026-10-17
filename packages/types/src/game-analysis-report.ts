// ──────────────────────────────────────────────────────────────
// Game analysis — persisted reports, PGN helpers, phases, explanations.
//
// Pure: no chess library. The API builds reports with these; the web renders
// them; docs/GAME_ANALYSIS.md describes every rule.
// ──────────────────────────────────────────────────────────────

import { z } from "zod";
import type { chessColorSchema } from "./core-schemas";
import type {
  ClassificationLimit,
  ClassificationReason,
  ClassifiedGameMove,
  EngineLine,
  GameAnalysisDepth,
  MoveClassification,
  SideAccuracy
} from "./game-analysis";
import type { GameTactics, TacticMotif } from "./game-tactics";

type ChessColor = z.infer<typeof chessColorSchema>;

// ── PGN text ─────────────────────────────────────────────────────

export const PGN_IMPORT_LIMITS = {
  /** Characters of PGN text per request. */
  maxChars: 1_000_000,
  /** Games per request. */
  maxGames: 100,
  /** Plies per game (longer games are refused, not truncated silently). */
  maxPlies: 600
} as const;

const HEADER_LINE = /^\s*\[\s*[A-Za-z0-9_]+\s+"(?:[^"\\]|\\.)*"\s*\]\s*$/;

/**
 * Split a multi-game PGN into one text per game: a new game starts at a
 * header line that follows movetext. BOM and CRLF are normalised. Text with
 * no movetext and no headers is dropped.
 */
export function splitPgnGames(raw: string, maxGames: number = PGN_IMPORT_LIMITS.maxGames): string[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const games: string[] = [];
  let current: string[] = [];
  let sawMoves = false;
  const flush = () => {
    const body = current.join("\n").trim();
    if (body) games.push(body);
    current = [];
    sawMoves = false;
  };
  for (const line of text.split("\n")) {
    if (HEADER_LINE.test(line)) {
      if (sawMoves) {
        flush();
        if (games.length >= maxGames) return games;
      }
    } else if (line.trim() !== "" && !line.trim().startsWith("%")) {
      sawMoves = true;
    }
    current.push(line);
  }
  flush();
  return games.slice(0, maxGames);
}

/** `[%clk 0:03:21.4]` in a move comment → milliseconds left; null if absent or malformed. */
export function parseClockComment(comment: string | undefined | null): number | null {
  if (!comment) return null;
  const match = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/.exec(comment);
  if (!match) return null;
  const ms = (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000;
  return Number.isFinite(ms) ? Math.round(ms) : null;
}

/** "600+5" → { initialMs, incrementMs }; null for "-", correspondence ("1/259200") or garbage. */
export function parseTimeControl(value: string | undefined | null): { initialMs: number; incrementMs: number } | null {
  const match = value ? /^(\d+)(?:\+(\d+))?$/.exec(value.trim()) : null;
  if (!match) return null;
  return { incrementMs: Number(match[2] ?? 0) * 1000, initialMs: Number(match[1]) * 1000 };
}

// ── Game phases ──────────────────────────────────────────────────

export const GAME_PHASES = ["OPENING", "MIDDLEGAME", "ENDGAME"] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export const GAME_PHASE_RULES = {
  /** Knights, bishops, rooks and queens left (both sides) at or below → endgame. */
  endgameMaxPieces: 6,
  /** At or below → the opening is over. */
  middlegameMaxPieces: 10,
  /** Fewer than this many pieces left on a side's own back rank → developed: opening over. */
  backRankDevelopedBelow: 4,
  /** Safety cap: the opening never runs past this many plies. */
  openingMaxPlies: 40
} as const;

function placementStats(fen: string) {
  const rows = fen.trim().split(/\s+/)[0]?.split("/") ?? [];
  const pieces = (rows.join("").match(/[nbrqNBRQ]/g) ?? []).length;
  const count = (row: string | undefined, re: RegExp) => (row?.match(re) ?? []).length;
  return {
    blackBackRank: count(rows[0], /[a-z]/g),
    pieces,
    whiteBackRank: count(rows[7], /[A-Z]/g)
  };
}

/**
 * Phase of each position, from the board rather than the move number alone:
 * the opening lasts until pieces are traded down (≤ 10 minor/major pieces),
 * either side has developed off its back rank (< 4 pieces left there), or
 * ply 40; the endgame starts at ≤ 6 minor/major pieces. Phases never go
 * backwards.
 */
export function gamePhases(fens: string[]): GamePhase[] {
  const out: GamePhase[] = [];
  let phase: GamePhase = "OPENING";
  fens.forEach((fen, ply) => {
    const s = placementStats(fen);
    if (s.pieces <= GAME_PHASE_RULES.endgameMaxPieces) phase = "ENDGAME";
    else if (
      phase === "OPENING" &&
      (s.pieces <= GAME_PHASE_RULES.middlegameMaxPieces ||
        s.whiteBackRank < GAME_PHASE_RULES.backRankDevelopedBelow ||
        s.blackBackRank < GAME_PHASE_RULES.backRankDevelopedBelow ||
        ply >= GAME_PHASE_RULES.openingMaxPlies)
    ) {
      phase = "MIDDLEGAME";
    }
    out.push(phase);
  });
  return out;
}

// ── Reports ──────────────────────────────────────────────────────

export const GAME_ANALYSIS_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] as const;
export type GameAnalysisStatus = (typeof GAME_ANALYSIS_STATUSES)[number];

export const GAME_ANALYSIS_STATUS_LABELS: Record<GameAnalysisStatus, string> = {
  CANCELLED: "Cancelled",
  COMPLETED: "Complete",
  FAILED: "Failed",
  PARTIAL: "Incomplete",
  QUEUED: "Waiting",
  RUNNING: "Analysing"
};

export const isFinishedAnalysis = (s: GameAnalysisStatus) => s === "COMPLETED" || s === "PARTIAL";
export const isActiveAnalysis = (s: GameAnalysisStatus) => s === "QUEUED" || s === "RUNNING";

export type GameAnalysisSummary = {
  id: string;
  gameId: string;
  depth: GameAnalysisDepth;
  status: GameAnalysisStatus;
  progress: { done: number; total: number };
  engine: string | null;
  versions: {
    convention: string;
    classification: string | null;
    accuracy: string | null;
    tactics: string | null;
  };
  error: string | null;
  /** The game's moves changed since this analysis was made. */
  stale: boolean;
  createdAt: string;
  completedAt: string | null;
};

export type GameReportMove = ClassifiedGameMove & {
  fenBefore: string;
  fenAfter: string;
  phase: GamePhase;
  /** The engine's top move from the position before (SAN), if searched. */
  bestMoveSan: string | null;
  /** The engine's top line from the position before (SAN, ≤ 10 plies). */
  lineSan: string[];
  /** Mover's clock after the move, when the PGN carried one. */
  clockMs: number | null;
  /** One sentence for the student. */
  explanation: string;
};

export type GameReportSide = {
  side: ChessColor;
  name: string;
  playerId: string | null;
  accuracy: SideAccuracy;
  counts: Record<MoveClassification, number>;
};

export type GameAnalysisReport = {
  analysis: GameAnalysisSummary;
  game: {
    id: string;
    title: string;
    whiteName: string;
    blackName: string;
    result: string;
    startFen: string;
  };
  sides: Record<ChessColor, GameReportSide>;
  moves: GameReportMove[];
  tactics: GameTactics;
  /** True when some positions could not be analysed — never shown as complete. */
  limited: boolean;
  /** Plain reasons the report is limited (budget, failed positions, truncated PGN). */
  limitations: string[];
  /** Per-move clocks covered enough of the game to talk about time. */
  hasClockData: boolean;
  /** Plies of missed tactics that can become a fair revision puzzle (verified unique answer or forced mate). */
  revisionEligiblePlies: number[];
};

export type TacticRevisionResponse = {
  puzzleId: string;
  revisionItemId: string;
  /** It was already in the student's revision (kept, made due now). */
  alreadyAdded: boolean;
};

export type GameAnalysisStateResponse = {
  /** Latest analysis of this game's current moves (any depth), or null. */
  analysis: GameAnalysisSummary | null;
  report: GameAnalysisReport | null;
  canRequest: boolean;
  /** Why a request would be refused right now (engine off, daily limit...). */
  requestBlockedReason: string | null;
};

export const requestGameAnalysisRequestSchema = z.object({
  depth: z.enum(["QUICK", "STANDARD", "DEEP"]).default("STANDARD")
});
export type RequestGameAnalysisRequest = z.input<typeof requestGameAnalysisRequestSchema>;

// ── Explanations ─────────────────────────────────────────────────

const LIMIT_TEXT: Record<ClassificationLimit, string> = {
  NO_EVALUATION_AFTER: "The position after this move wasn't analysed, so it isn't judged.",
  NO_EVALUATION_BEFORE: "This position wasn't analysed, so the move isn't judged.",
  PROVISIONAL_SCORE: "The engine's score here was only provisional, so the move isn't judged.",
  SHALLOW_SEARCH: "The engine didn't search deep enough here to judge the move."
};

const lossText = (loss: number | null) =>
  loss !== null && loss >= 1 ? ` It cost about ${Math.round(loss)} points of winning chances.` : "";

/** One plain sentence about a classified move (English; the reasons drive it). */
export function explainMove(
  move: Pick<ClassifiedGameMove, "classification" | "limitedBy" | "reasons" | "winPercentLoss" | "onlyMove">,
  bestMoveSan: string | null
): string {
  const best = bestMoveSan ? ` ${bestMoveSan} was stronger.` : "";
  const has = (r: ClassificationReason) => move.reasons.includes(r);
  switch (move.classification) {
    case "UNCLASSIFIED":
      return move.limitedBy ? LIMIT_TEXT[move.limitedBy] : "This move isn't judged.";
    case "FORCED":
      return "The only legal move.";
    case "BEST":
      return move.onlyMove ? "The best move — and the only one that kept the position." : "The engine's choice.";
    case "GOOD":
      if (has("KEPT_FORCED_MATE")) return "Still a forced checkmate, just not the fastest.";
      if (has("ALREADY_BEING_MATED")) return "Every move here loses to checkmate.";
      return "A good move that keeps the evaluation.";
    case "INACCURACY":
      return has("CAPPED_STILL_WINNING")
        ? `Not the most precise, but you were still winning.${best}`
        : has("CAPPED_ALREADY_LOST")
          ? `The position was already lost; this didn't change the result.${best}`
          : `A small slip.${lossText(move.winPercentLoss)}${best}`;
    case "MISTAKE":
      return `A mistake.${lossText(move.winPercentLoss)}${best}`;
    case "BLUNDER":
      return `A blunder that changes the game.${lossText(move.winPercentLoss)}${best}`;
    case "MISSED_WIN":
      return `You were winning, and this let the advantage go.${best}`;
    case "MISSED_MATE":
      return `There was a forced checkmate.${best}`;
    case "MISSED_DRAW":
      return `Only one move held the draw, and this wasn't it.${best}`;
    case "MATE_ALLOWED":
      return has("HAD_FORCED_MATE")
        ? `You had a forced mate, and this allows one against you instead.${best}`
        : `This allows a forced checkmate.${best}`;
  }
}

export const REPORT_LIMITATION_TEXT = {
  BUDGET: "The analysis ran out of time before every position was searched.",
  FAILED_POSITIONS: "The engine failed on some positions; moves around them aren't judged.",
  TRUNCATED: "The game record stops being legal partway through; later moves were not analysed.",
  QUICK: "This was a quick analysis — a skim, not a deep review.",
  NO_HISTORY: "Repetition draws can't be seen by the engine (it sees each position on its own)."
} as const;

// ── Insights (aggregation over many analysed games) ──────────────

/** Minimum evidence before any trend or weakness is stated. Tuned in docs/GAME_ANALYSIS.md §9. */
export const INSIGHT_THRESHOLDS = {
  /** Fewer analysed games → only counts are shown, no rates or trends. */
  minGamesForRates: 3,
  /** A motif needs this many opportunities before a miss rate is shown. */
  minOpportunitiesForRate: 5,
  /** …and this many misses, in this many distinct games, to be called recurring. */
  minMissesForWeakness: 3,
  minGamesForWeakness: 3,
  /** Miss rate at/above which a motif counts as a weakness (with the above). */
  weaknessMissRate: 0.5,
  /** Found rate at/above (with ≥ minOpportunitiesForRate) → a strength. */
  strengthFoundRate: 0.7,
  /** Each trend window needs this many games. */
  minGamesPerTrendWindow: 5,
  /** Accuracy change smaller than this (points) is "no clear change". */
  trendMinAccuracyDelta: 3,
  /** Per-move clocks on at least this share of the side's moves, or no time analysis. */
  minClockCoverage: 0.8,
  /** "Low on time": below this share of the starting clock… */
  lowTimeShare: 0.1,
  /** …or below this many ms, whichever is larger. */
  lowTimeMs: 30_000
} as const;

export type MotifStats = {
  found: number;
  missed: number;
  alternative: number;
  unknown: number;
  allowed: number;
  /** Plies (position index) of the misses / finds, for example positions. */
  missedPlies: number[];
  foundPlies: number[];
};

export type PhaseStats = { moves: number; mistakes: number; blunders: number; lossSum: number };

export type ClockStats = {
  /** Side's moves made while low on time / all moves with a clock. */
  lowTimeMoves: number;
  clockedMoves: number;
  /** Mistakes+blunders (incl. missed win/mate/draw, mate allowed) while low on time / otherwise. */
  lowTimeErrors: number;
  otherErrors: number;
};

export type InsightEvidence = {
  /** Distinct analysed games the statement rests on. */
  games: number;
  /** Positions / opportunities counted. */
  samples: number;
  /** Up to 5 example positions: analysis id + ply. */
  examples: { analysisId: string; gameId: string; ply: number }[];
};

export type MotifInsight = {
  motif: TacticMotif;
  opportunities: number;
  found: number;
  missed: number;
  /** Null until `minOpportunitiesForRate`. */
  missRate: number | null;
  /** Times the student's own move handed the opponent this tactic. */
  allowed: number;
  verdict: "WEAKNESS" | "STRENGTH" | "NOT_ENOUGH_DATA" | "NEUTRAL";
  evidence: InsightEvidence;
};

export type AccuracyTrend = {
  verdict: "IMPROVING" | "DECLINING" | "STEADY" | "NOT_ENOUGH_DATA";
  recent: { games: number; accuracy: number | null };
  previous: { games: number; accuracy: number | null };
};

export type StudentGameInsights = {
  studentId: string;
  /** Only analyses of these versions are combined; older ones are excluded and counted. */
  versions: { classification: string; accuracy: string; tactics: string };
  gamesAnalysed: number;
  excludedOtherVersions: number;
  byColor: Record<ChessColor, { games: number; accuracy: number | null; wins: number; draws: number; losses: number }>;
  /** Per 100 judged moves; null below `minGamesForRates`. */
  errorRates: { inaccuracies: number | null; mistakes: number | null; blunders: number | null; judgedMoves: number };
  counts: Record<MoveClassification, number>;
  phases: Record<GamePhase, PhaseStats & { errorRate: number | null }>;
  motifs: MotifInsight[];
  trend: AccuracyTrend;
  /** Null unless clocks covered enough moves. */
  time: (ClockStats & { lowTimeErrorRate: number | null; otherErrorRate: number | null }) | null;
  /** Per source, never merged: the latest rating seen and the games behind it. */
  ratings: { source: string; latest: number; games: number }[];
  openings: { eco: string | null; name: string | null; color: ChessColor; games: number; wins: number; draws: number; losses: number; accuracy: number | null }[];
  thresholds: typeof INSIGHT_THRESHOLDS;
};

export type AnalysedGameItem = {
  analysisId: string;
  gameId: string;
  title: string;
  playedAt: string;
  side: ChessColor;
  result: "WIN" | "LOSS" | "DRAW" | "UNKNOWN";
  opponentName: string;
  accuracy: number | null;
  status: GameAnalysisStatus;
  depth: GameAnalysisDepth;
  mistakes: number;
  blunders: number;
  missedTactics: number;
  source: string;
  timeControl: string | null;
  openingName: string | null;
};

export type AnalysedGameListResponse = {
  items: AnalysedGameItem[];
  page: number;
  pageSize: number;
  total: number;
};

export const ANALYSED_GAME_RESULTS = ["WIN", "LOSS", "DRAW", "UNKNOWN"] as const;

/** Lines shown in a report (SAN), capped. */
export const REPORT_LINE_PLIES = 10;

/** Safe accessor for a line's SAN in reports. */
export const lineSanForReport = (line: EngineLine | null | undefined) => (line?.pvSan ?? []).slice(0, REPORT_LINE_PLIES);
