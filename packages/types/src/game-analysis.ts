// ──────────────────────────────────────────────────────────────
// Game analysis — evaluation handling, move classification, accuracy.
//
// Stockfish supplies scores and lines; everything that turns them into a
// judgement about a move lives here, pure, so the API, a future web report
// and the specs all run the same rules. Methodology and rationale:
// docs/GAME_ANALYSIS.md. NexaGen's labels and accuracy are its own — they are
// NOT calibrated to, and must never be presented as, Lichess or Chess.com
// figures.
//
// ONE CONVENTION: an `Evaluation` is always WHITE-RELATIVE (+ is good for
// White). UCI engines report from the SIDE TO MOVE; convert at the boundary
// with `normalizeUciScore` and nowhere else. Anything about "the player" goes
// through `winPercent(evaluation, side)` / `evaluationForSide`.
//
// Mate is never a big centipawn number: it is its own variant carrying the
// winner and the distance, so it cannot overflow, flip sign, or leak into a
// cp average.
// ──────────────────────────────────────────────────────────────

import type { z } from "zod";
import type { chessColorSchema } from "./core-schemas";

export const EVALUATION_CONVENTION_VERSION = "white-relative-v1";
export const MOVE_CLASSIFICATION_VERSION = "nexa-classify-v1";
export const ACCURACY_FORMULA_VERSION = "nexa-accuracy-v1";

/** "white" | "black" — the shared colour type (core-schemas `chessColorSchema`). */
type ChessColor = z.infer<typeof chessColorSchema>;

/** White-relative evaluation — the only shape stored or compared. */
export type Evaluation =
  | { kind: "cp"; cp: number }
  /** `moves` ≥ 0 full moves to mate; 0 = already checkmated on the board. */
  | { kind: "mate"; winner: ChessColor; moves: number };

/** A score exactly as a UCI engine prints it: from the SIDE TO MOVE. */
export type UciScore = { kind: "cp"; value: number } | { kind: "mate"; value: number };

/**
 * `exact` = a completed search line. `lower` / `upper` = an aspiration-window
 * fail (the true score is at least / at most this) — provisional, never
 * classified on.
 */
export type ScoreBound = "exact" | "lower" | "upper";

/** Engine centipawn scores beyond this carry no extra meaning (TB-win scores reach ~20000). */
export const EVALUATION_CP_LIMIT = 10_000;

/** Ordering score for a mate, above any centipawn value. */
const MATE_SCORE = 100_000;

export const oppositeSide = (side: ChessColor): ChessColor => (side === "white" ? "black" : "white");

/** Side to move from a FEN's second field; null when the FEN has none. */
export function sideToMoveFromFen(fen: string): ChessColor | null {
  const turn = fen.trim().split(/\s+/)[1];
  if (turn === "w") return "white";
  if (turn === "b") return "black";
  return null;
}

const clampCp = (cp: number) => Math.max(-EVALUATION_CP_LIMIT, Math.min(EVALUATION_CP_LIMIT, cp));
// `-0 || 0` → 0: a negated zero must not survive into stored data or equality checks.
const noNegativeZero = (n: number) => n || 0;

/**
 * UCI side-to-move score → White-relative evaluation. Returns null for
 * anything that is not a finite integer (a truncated or garbled engine line),
 * so callers treat it as "no evaluation" rather than as 0.
 *
 * UCI mate signs: `mate 3` = the side to move mates in 3; `mate -3` = it is
 * mated in 3; `mate 0` = it is already checkmated.
 */
export function normalizeUciScore(score: UciScore, sideToMove: ChessColor): Evaluation | null {
  if (!Number.isFinite(score.value) || !Number.isInteger(score.value)) return null;
  if (score.kind === "mate") {
    if (score.value > 0) return { kind: "mate", winner: sideToMove, moves: score.value };
    return { kind: "mate", winner: oppositeSide(sideToMove), moves: noNegativeZero(-score.value) };
  }
  const cp = clampCp(score.value);
  return { kind: "cp", cp: noNegativeZero(sideToMove === "white" ? cp : -cp) };
}

/** White-relative evaluation → the UCI side-to-move score (inverse of `normalizeUciScore`). */
export function toUciScore(evaluation: Evaluation, sideToMove: ChessColor): UciScore {
  if (evaluation.kind === "mate") {
    if (evaluation.moves === 0) return { kind: "mate", value: 0 };
    return {
      kind: "mate",
      value: evaluation.winner === sideToMove ? evaluation.moves : -evaluation.moves
    };
  }
  return { kind: "cp", value: noNegativeZero(sideToMove === "white" ? evaluation.cp : -evaluation.cp) };
}

/**
 * The existing `StockfishAnalysisResult` shape (pawns, side to move; `mate`
 * wins over `evaluation`) → White-relative. Null when it carries no score.
 */
export function evaluationFromEngineResult(
  result: { evaluation: number | null; mate: number | null },
  sideToMove: ChessColor
): Evaluation | null {
  if (result.mate !== null && result.mate !== undefined) {
    return normalizeUciScore({ kind: "mate", value: result.mate }, sideToMove);
  }
  if (result.evaluation === null || result.evaluation === undefined) return null;
  if (!Number.isFinite(result.evaluation)) return null;
  return normalizeUciScore({ kind: "cp", value: Math.round(result.evaluation * 100) }, sideToMove);
}

/** An evaluation from one player's point of view (+ = good for that player). */
export type PlayerEvaluation =
  | { kind: "cp"; cp: number }
  | { kind: "mate"; moves: number; /** true = this player delivers it */ forPlayer: boolean };

export function evaluationForSide(evaluation: Evaluation, side: ChessColor): PlayerEvaluation {
  if (evaluation.kind === "mate") {
    return { kind: "mate", moves: evaluation.moves, forPlayer: evaluation.winner === side };
  }
  return { kind: "cp", cp: noNegativeZero(side === "white" ? evaluation.cp : -evaluation.cp) };
}

/**
 * A single number that orders evaluations for `side`: higher is better.
 * Faster mates beat slower ones; being mated later beats being mated sooner.
 */
export function evaluationScore(evaluation: Evaluation, side: ChessColor): number {
  const own = evaluationForSide(evaluation, side);
  if (own.kind === "cp") return own.cp;
  return own.forPlayer ? MATE_SCORE - own.moves : -(MATE_SCORE - own.moves);
}

/**
 * Logistic slope mapping centipawns to an expected score. The constant is the
 * one Lichess publishes (fitted on rated games); NexaGen uses it as a sensible
 * prior and keeps it here, versioned, so it can be re-fitted without touching
 * callers. It does NOT make NexaGen's figures equal to Lichess's.
 */
export const WIN_PERCENT_K = 0.00368208;

/**
 * Expected score (0–100) for `side`. Mate is exactly 100 or 0 — never an
 * extrapolated centipawn value — so it can't produce NaN or >100.
 */
export function winPercent(evaluation: Evaluation, side: ChessColor): number {
  const own = evaluationForSide(evaluation, side);
  if (own.kind === "mate") return own.forPlayer ? 100 : 0;
  return 50 + 50 * (2 / (1 + Math.exp(-WIN_PERCENT_K * clampCp(own.cp))) - 1);
}

/** "+1.23", "-0.40", "0.00", "#3" (White mates), "#-2" (Black mates). */
export function formatEvaluation(evaluation: Evaluation): string {
  if (evaluation.kind === "mate") {
    return evaluation.winner === "white" ? `#${evaluation.moves}` : `#-${evaluation.moves}`;
  }
  const pawns = evaluation.cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

// ──────────────────────────────────────────────────────────────
// Engine output for one game — what the API's per-game analysis returns and
// what Phase 4 will store. Every evaluation is White-relative.
// ──────────────────────────────────────────────────────────────

export const GAME_ANALYSIS_DEPTHS = ["QUICK", "STANDARD", "DEEP"] as const;
export type GameAnalysisDepth = (typeof GAME_ANALYSIS_DEPTHS)[number];

export type GameAnalysisEngineConfig = {
  depth: GameAnalysisDepth;
  /** Per-position think time. */
  movetimeMs: number;
  /** Stop a position early once this depth completes (0 = no cap). */
  maxDepth: number;
  /** Lines per position. ≥2 is needed for only-move and missed-draw evidence. */
  multiPv: number;
  /**
   * When the played move is not among the MultiPV lines, search it on its own
   * (`go searchmoves`) from the same position instead of relying only on the
   * next position's evaluation.
   */
  rootMoveSearch: boolean;
  /** Positions searched at once (each still capped by the background lane). */
  concurrency: number;
  /** Wall-clock budget for the whole game; positions left over are `skipped`. */
  budgetMs: number;
};

/**
 * Presets. QUICK is a skim and must be labelled as such; none of them is
 * "exhaustive". Numbers are sized for the 2-vCPU production box.
 */
export const GAME_ANALYSIS_PRESETS: Record<GameAnalysisDepth, GameAnalysisEngineConfig> = {
  QUICK: {
    budgetMs: 60_000,
    concurrency: 1,
    depth: "QUICK",
    maxDepth: 14,
    movetimeMs: 250,
    multiPv: 1,
    rootMoveSearch: false
  },
  STANDARD: {
    budgetMs: 180_000,
    concurrency: 1,
    depth: "STANDARD",
    maxDepth: 18,
    movetimeMs: 800,
    multiPv: 2,
    rootMoveSearch: false
  },
  DEEP: {
    budgetMs: 600_000,
    concurrency: 1,
    depth: "DEEP",
    maxDepth: 22,
    movetimeMs: 2000,
    multiPv: 3,
    rootMoveSearch: true
  }
};

export const MAX_GAME_ANALYSIS_MULTIPV = 5;

export type EngineLine = {
  /** 1 = the engine's top line. */
  rank: number;
  evaluation: Evaluation | null;
  bound: ScoreBound;
  /** Depth the score was reported at (0 for a terminal position). */
  depth: number;
  pvUci: string[];
  pvSan: string[];
};

export type EnginePositionStatus =
  /** Searched; `lines` holds the result. */
  | "ANALYSED"
  /** Game over on the board — evaluated by the rules, not the engine. */
  | "TERMINAL"
  /** The engine failed (crash, timeout, unavailable). */
  | "FAILED"
  /** Not searched: the game's budget ran out first. */
  | "SKIPPED";

export type EnginePosition = {
  /** Half-moves played before this position (0 = start). */
  ply: number;
  fen: string;
  sideToMove: ChessColor;
  legalMoveCount: number;
  status: EnginePositionStatus;
  terminal: "CHECKMATE" | "STALEMATE" | "DRAW" | null;
  lines: EngineLine[];
  error: string | null;
};

export type EnginePlayedMove = {
  /** Index into the game's moves; played from `positions[ply]`. */
  ply: number;
  side: ChessColor;
  uci: string;
  san: string;
  /** The played move searched on its own from `positions[ply]`, when done. */
  rootMoveLine: EngineLine | null;
};

export type GameEngineAnalysis = {
  conventionVersion: string;
  /** Engine id as it introduced itself ("Stockfish 17.1"), null if unknown. */
  engine: string | null;
  config: GameAnalysisEngineConfig;
  startFen: string;
  /** moves.length + 1 entries (the position after the last move included). */
  positions: EnginePosition[];
  moves: EnginePlayedMove[];
  /** Set when the move list stopped being legal; later moves are dropped. */
  truncated: { ply: number; reason: string } | null;
  /** Every position ANALYSED or TERMINAL. */
  complete: boolean;
  budgetExhausted: boolean;
};

// ──────────────────────────────────────────────────────────────
// Move classification
// ──────────────────────────────────────────────────────────────

export const MOVE_CLASSIFICATIONS = [
  "BEST",
  "GOOD",
  "INACCURACY",
  "MISTAKE",
  "BLUNDER",
  "MISSED_WIN",
  "MISSED_MATE",
  "MISSED_DRAW",
  "MATE_ALLOWED",
  "FORCED",
  "UNCLASSIFIED"
] as const;
export type MoveClassification = (typeof MOVE_CLASSIFICATIONS)[number];

export const MOVE_CLASSIFICATION_LABELS: Record<MoveClassification, string> = {
  BEST: "Best move",
  BLUNDER: "Blunder",
  FORCED: "Forced move",
  GOOD: "Good move",
  INACCURACY: "Inaccuracy",
  MATE_ALLOWED: "Allowed checkmate",
  MISSED_DRAW: "Missed draw",
  MISSED_MATE: "Missed checkmate",
  MISSED_WIN: "Missed win",
  MISTAKE: "Mistake",
  UNCLASSIFIED: "Not classified"
};

/** The three plain-severity labels a cap can clamp to. */
type SeverityLabel = "GOOD" | "INACCURACY" | "MISTAKE" | "BLUNDER";
const SEVERITY_RANK: Record<SeverityLabel, number> = { BLUNDER: 3, GOOD: 0, INACCURACY: 1, MISTAKE: 2 };

/** All thresholds are expected-score (win%) points from the mover's view, 0–100. */
export type MoveClassificationPolicy = {
  version: string;
  /** Loss at/above these → inaccuracy / mistake / blunder. */
  inaccuracyLoss: number;
  mistakeLoss: number;
  blunderLoss: number;
  /**
   * A move matching a lower MultiPV line within this loss is still BEST. Only
   * applies to a score from the SAME search — cross-search noise never earns it.
   */
  bestMaxLoss: number;
  /** Mover is "winning" at/above, "losing" at/below. */
  winningWinPercent: number;
  losingWinPercent: number;
  /** While the mover stays winning, a loss is shown at most as this. */
  capWhileStillWinning: SeverityLabel;
  /** In an already-lost position that stays lost, at most this. */
  capWhileAlreadyLost: SeverityLabel;
  /** Mates further away than this are not called "missed" / "allowed" by name. */
  missedMateMaxMoves: number;
  mateAllowedMaxMoves: number;
  /** |cp| at/below this counts as a drawn evaluation (missed-draw evidence). */
  drawnMaxCp: number;
  /** Second line this much worse than the top one → the top move was an only move. */
  onlyMoveGap: number;
  /** A searched (non-terminal) score below this depth is too shallow to judge. */
  minDepth: number;
};

export const DEFAULT_MOVE_CLASSIFICATION_POLICY: MoveClassificationPolicy = {
  bestMaxLoss: 1,
  blunderLoss: 15,
  capWhileAlreadyLost: "INACCURACY",
  capWhileStillWinning: "INACCURACY",
  drawnMaxCp: 30,
  inaccuracyLoss: 5,
  losingWinPercent: 20,
  mateAllowedMaxMoves: 5,
  minDepth: 12,
  missedMateMaxMoves: 5,
  mistakeLoss: 10,
  onlyMoveGap: 20,
  version: MOVE_CLASSIFICATION_VERSION,
  winningWinPercent: 80
};

/** Throws on a policy whose thresholds contradict each other. */
export function assertValidClassificationPolicy(policy: MoveClassificationPolicy): void {
  const problems: string[] = [];
  const pct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
  for (const key of [
    "bestMaxLoss",
    "inaccuracyLoss",
    "mistakeLoss",
    "blunderLoss",
    "winningWinPercent",
    "losingWinPercent",
    "onlyMoveGap"
  ] as const) {
    if (!pct(policy[key])) problems.push(`${key} must be between 0 and 100`);
  }
  if (!(policy.bestMaxLoss < policy.inaccuracyLoss)) problems.push("bestMaxLoss must be below inaccuracyLoss");
  if (!(policy.inaccuracyLoss < policy.mistakeLoss)) problems.push("inaccuracyLoss must be below mistakeLoss");
  if (!(policy.mistakeLoss < policy.blunderLoss)) problems.push("mistakeLoss must be below blunderLoss");
  if (!(policy.losingWinPercent < 50 && policy.winningWinPercent > 50)) {
    problems.push("losingWinPercent must be below 50 and winningWinPercent above it");
  }
  for (const key of ["missedMateMaxMoves", "mateAllowedMaxMoves", "drawnMaxCp", "minDepth"] as const) {
    if (!Number.isInteger(policy[key]) || policy[key] < 0) problems.push(`${key} must be a non-negative integer`);
  }
  if (problems.length) throw new Error(`Invalid move classification policy: ${problems.join("; ")}`);
}

/** Where the played move's evaluation came from — same-search is the fairest. */
export type AfterEvaluationSource = "ENGINE_BEST" | "MULTIPV_LINE" | "ROOT_MOVE" | "NEXT_POSITION";

/** Why a move was left UNCLASSIFIED. */
export type ClassificationLimit =
  | "NO_EVALUATION_BEFORE"
  | "NO_EVALUATION_AFTER"
  | "PROVISIONAL_SCORE"
  | "SHALLOW_SEARCH";

/** Machine-readable evidence a report turns into a sentence. */
export type ClassificationReason =
  | "ONLY_LEGAL_MOVE"
  | "ENGINE_TOP_MOVE"
  | "WITHIN_BEST_MARGIN"
  | "ONLY_MOVE"
  | "HAD_FORCED_MATE"
  | "ALLOWED_FORCED_MATE"
  | "KEPT_FORCED_MATE"
  | "ALREADY_BEING_MATED"
  | "DRAW_WAS_ONLY_RESOURCE"
  | "WINNING_POSITION_LOST"
  | "CAPPED_STILL_WINNING"
  | "CAPPED_ALREADY_LOST";

/** Everything the classifier needs about one played move. */
export type MoveEvidence = {
  side: ChessColor;
  playedUci: string;
  legalMoveCount: number;
  /** Lines from the position before the move (rank order). */
  linesBefore: EngineLine[];
  /** Whether `linesBefore` came from a real search (vs. not searched / failed). */
  beforeSearched: boolean;
  /** The played move searched alone from the same position, if done. */
  rootMoveLine: EngineLine | null;
  /** Top line of the position after the move (that position's own search or terminal rule). */
  nextPositionLine: EngineLine | null;
  /** True when the position after is terminal (its score needs no depth). */
  nextPositionTerminal: boolean;
};

export type ClassifiedMove = {
  classification: MoveClassification;
  /** Set only for UNCLASSIFIED. */
  limitedBy: ClassificationLimit | null;
  reasons: ClassificationReason[];
  /** The engine's top move from the position before (UCI), if known. */
  bestMoveUci: string | null;
  evaluationBefore: Evaluation | null;
  evaluationAfter: Evaluation | null;
  afterSource: AfterEvaluationSource | null;
  /** Mover's expected score before (best play) and after the played move. */
  winPercentBefore: number | null;
  winPercentAfter: number | null;
  /** max(0, before − after) — what the move cost, in win% points. */
  winPercentLoss: number | null;
  /** The played move was the only one that kept the evaluation (needs MultiPV ≥ 2). */
  onlyMove: boolean;
};

const isExact = (line: EngineLine | null | undefined): line is EngineLine & { evaluation: Evaluation } =>
  !!line && line.bound === "exact" && line.evaluation !== null;

const unclassified = (
  limit: ClassificationLimit,
  partial: Partial<ClassifiedMove> = {}
): ClassifiedMove => ({
  afterSource: null,
  bestMoveUci: null,
  classification: "UNCLASSIFIED",
  evaluationAfter: null,
  evaluationBefore: null,
  limitedBy: limit,
  onlyMove: false,
  reasons: [],
  winPercentAfter: null,
  winPercentBefore: null,
  winPercentLoss: null,
  ...partial
});

const mateFor = (evaluation: Evaluation, side: ChessColor) =>
  evaluation.kind === "mate" && evaluation.winner === side;
const mateAgainst = (evaluation: Evaluation, side: ChessColor) =>
  evaluation.kind === "mate" && evaluation.winner !== side;

const roundTo = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * Classify one played move. Pure and deterministic. Rules, in order (see
 * docs/GAME_ANALYSIS.md for the reasoning):
 *
 * 1. Only one legal move → FORCED (no engine needed).
 * 2. No usable top line before, a provisional (bound) score, or a search
 *    shallower than `minDepth` → UNCLASSIFIED. A label is never guessed.
 * 3. The played move's score comes from the same search when possible: the
 *    engine's own move, else a matching MultiPV line, else a root-move search,
 *    else the next position's evaluation (already White-relative). A score
 *    better than the best line is clamped (horizon noise is not a gain).
 * 4. Engine top move → BEST. Mate rules next (MATE_ALLOWED / MISSED_MATE /
 *    still mating / already being mated), then MISSED_DRAW (needs MultiPV
 *    evidence that the draw was the only resource), MISSED_WIN, then the plain
 *    win%-loss thresholds, then the still-winning / already-lost caps.
 */
export function classifyMove(
  evidence: MoveEvidence,
  policy: MoveClassificationPolicy = DEFAULT_MOVE_CLASSIFICATION_POLICY
): ClassifiedMove {
  const side = evidence.side;
  const playedUci = evidence.playedUci.toLowerCase();

  if (evidence.legalMoveCount === 1) {
    return {
      ...unclassified("NO_EVALUATION_BEFORE"),
      bestMoveUci: playedUci,
      classification: "FORCED",
      limitedBy: null,
      reasons: ["ONLY_LEGAL_MOVE"]
    };
  }

  const top = evidence.linesBefore.find((line) => line.rank === 1) ?? null;
  if (!evidence.beforeSearched || !top || top.evaluation === null) return unclassified("NO_EVALUATION_BEFORE");
  const bestMoveUci = top.pvUci[0]?.toLowerCase() ?? null;
  if (top.bound !== "exact") return unclassified("PROVISIONAL_SCORE", { bestMoveUci });
  if (top.depth < policy.minDepth) return unclassified("SHALLOW_SEARCH", { bestMoveUci });

  const evaluationBefore = top.evaluation;
  const winBefore = winPercent(evaluationBefore, side);
  const base = { bestMoveUci, evaluationBefore, winPercentBefore: roundTo(winBefore, 2) };

  // Only-move evidence: the second line (same search) is far worse.
  const second = evidence.linesBefore.find((line) => line.rank === 2) ?? null;
  const secondWin = isExact(second) ? winPercent(second.evaluation, side) : null;

  // ── Pick the played move's evaluation (rule 3).
  let after: Evaluation;
  let afterSource: AfterEvaluationSource;
  const sameSearch = evidence.linesBefore.find((line) => line.pvUci[0]?.toLowerCase() === playedUci);
  if (bestMoveUci !== null && playedUci === bestMoveUci) {
    after = evaluationBefore;
    afterSource = "ENGINE_BEST";
  } else if (sameSearch && sameSearch.evaluation !== null) {
    if (sameSearch.bound !== "exact") return unclassified("PROVISIONAL_SCORE", base);
    if (sameSearch.depth < policy.minDepth) return unclassified("SHALLOW_SEARCH", base);
    after = sameSearch.evaluation;
    afterSource = "MULTIPV_LINE";
  } else if (evidence.rootMoveLine && evidence.rootMoveLine.evaluation !== null) {
    if (evidence.rootMoveLine.bound !== "exact") return unclassified("PROVISIONAL_SCORE", base);
    if (evidence.rootMoveLine.depth < policy.minDepth) return unclassified("SHALLOW_SEARCH", base);
    after = evidence.rootMoveLine.evaluation;
    afterSource = "ROOT_MOVE";
  } else if (evidence.nextPositionLine && evidence.nextPositionLine.evaluation !== null) {
    if (evidence.nextPositionLine.bound !== "exact") return unclassified("PROVISIONAL_SCORE", base);
    if (!evidence.nextPositionTerminal && evidence.nextPositionLine.depth < policy.minDepth) {
      return unclassified("SHALLOW_SEARCH", base);
    }
    after = evidence.nextPositionLine.evaluation;
    afterSource = "NEXT_POSITION";
  } else {
    return unclassified("NO_EVALUATION_AFTER", base);
  }

  const rawWinAfter = winPercent(after, side);
  // Searching the played move again can come back a hair above the best line —
  // horizon noise, not a better move than the engine's.
  const winAfter = Math.min(rawWinAfter, winBefore);
  const loss = winBefore - winAfter;
  const onlyMove =
    secondWin !== null && afterSource === "ENGINE_BEST" && winBefore - secondWin >= policy.onlyMoveGap;

  const result = (
    classification: MoveClassification,
    reasons: ClassificationReason[]
  ): ClassifiedMove => ({
    ...base,
    afterSource,
    classification,
    evaluationAfter: after,
    limitedBy: null,
    onlyMove,
    reasons: onlyMove ? [...reasons, "ONLY_MOVE"] : reasons,
    winPercentAfter: roundTo(winAfter, 2),
    winPercentLoss: roundTo(loss, 2)
  });

  if (afterSource === "ENGINE_BEST") return result("BEST", ["ENGINE_TOP_MOVE"]);

  // ── Mate transitions (decided by mate status, not by a win% difference).
  if (mateAgainst(after, side) && !mateAgainst(evaluationBefore, side)) {
    if (after.kind === "mate" && after.moves <= policy.mateAllowedMaxMoves) {
      return result(
        "MATE_ALLOWED",
        mateFor(evaluationBefore, side) ? ["ALLOWED_FORCED_MATE", "HAD_FORCED_MATE"] : ["ALLOWED_FORCED_MATE"]
      );
    }
  }
  if (mateFor(evaluationBefore, side) && !mateFor(after, side)) {
    if (evaluationBefore.kind === "mate" && evaluationBefore.moves <= policy.missedMateMaxMoves) {
      return result("MISSED_MATE", ["HAD_FORCED_MATE"]);
    }
  }
  if (mateFor(evaluationBefore, side) && mateFor(after, side)) {
    // As fast as the best line is the best move. A fresh search of the next
    // position counts from one move later; a line of the same search does not.
    if (evaluationBefore.kind === "mate" && after.kind === "mate") {
      const bestDistance =
        afterSource === "NEXT_POSITION" ? evaluationBefore.moves - 1 : evaluationBefore.moves;
      if (after.moves <= bestDistance) return result("BEST", ["WITHIN_BEST_MARGIN"]);
    }
    // Still mating, just not the fastest way: the result is unchanged.
    return result("GOOD", ["KEPT_FORCED_MATE"]);
  }
  if (mateAgainst(evaluationBefore, side) && mateAgainst(after, side)) {
    // Every move loses; a quicker mate is not a meaningful error to teach.
    return result("GOOD", ["ALREADY_BEING_MATED"]);
  }

  // ── Missed draw: the engine held a draw, it was the only resource (the
  // second line already loses), and the played move loses.
  if (
    evaluationBefore.kind === "cp" &&
    Math.abs(evaluationBefore.cp) <= policy.drawnMaxCp &&
    secondWin !== null &&
    secondWin <= policy.losingWinPercent &&
    winAfter <= policy.losingWinPercent
  ) {
    return result("MISSED_DRAW", ["DRAW_WAS_ONLY_RESOURCE"]);
  }

  // ── Missed win: a winning position no longer winning, at mistake size or more.
  if (
    winBefore >= policy.winningWinPercent &&
    winAfter < policy.winningWinPercent &&
    loss >= policy.mistakeLoss
  ) {
    return result("MISSED_WIN", ["WINNING_POSITION_LOST"]);
  }

  // ── Plain thresholds.
  let label: SeverityLabel =
    loss >= policy.blunderLoss
      ? "BLUNDER"
      : loss >= policy.mistakeLoss
        ? "MISTAKE"
        : loss >= policy.inaccuracyLoss
          ? "INACCURACY"
          : "GOOD";
  const reasons: ClassificationReason[] = [];

  if (winAfter >= policy.winningWinPercent && SEVERITY_RANK[label] > SEVERITY_RANK[policy.capWhileStillWinning]) {
    label = policy.capWhileStillWinning;
    reasons.push("CAPPED_STILL_WINNING");
  }
  if (
    winBefore <= policy.losingWinPercent &&
    winAfter <= policy.losingWinPercent &&
    SEVERITY_RANK[label] > SEVERITY_RANK[policy.capWhileAlreadyLost]
  ) {
    label = policy.capWhileAlreadyLost;
    reasons.push("CAPPED_ALREADY_LOST");
  }

  if (label === "GOOD" && afterSource === "MULTIPV_LINE" && loss <= policy.bestMaxLoss) {
    return result("BEST", ["WITHIN_BEST_MARGIN"]);
  }
  return result(label, reasons);
}

/** Build each move's evidence from a per-game engine result. */
export function moveEvidenceFromGame(game: GameEngineAnalysis): MoveEvidence[] {
  return game.moves.map((move) => {
    const before = game.positions[move.ply];
    const next = game.positions[move.ply + 1] ?? null;
    const nextTop = next?.lines.find((line) => line.rank === 1) ?? null;
    return {
      beforeSearched: before?.status === "ANALYSED",
      legalMoveCount: before?.legalMoveCount ?? 0,
      linesBefore: before?.status === "ANALYSED" ? before.lines : [],
      nextPositionLine: next && (next.status === "ANALYSED" || next.status === "TERMINAL") ? nextTop : null,
      nextPositionTerminal: next?.status === "TERMINAL",
      playedUci: move.uci,
      rootMoveLine: move.rootMoveLine,
      side: move.side
    };
  });
}

// ──────────────────────────────────────────────────────────────
// Accuracy
// ──────────────────────────────────────────────────────────────

export type AccuracyPolicy = {
  version: string;
  /** Fewer eligible moves than this → no accuracy (too little to say). */
  minEligibleMoves: number;
  /** Eligible / (all the side's moves − forced) below this → no accuracy. */
  minCoverage: number;
};

export const DEFAULT_ACCURACY_POLICY: AccuracyPolicy = {
  minCoverage: 0.8,
  minEligibleMoves: 5,
  version: ACCURACY_FORMULA_VERSION
};

/**
 * Per-move accuracy (0–100) from the win% the move cost. An exponential decay
 * (coefficients as published by Lichess, re-used as a starting point): a
 * 0-point loss scores 100, ~5 points ≈ 80, ~15 ≈ 50, ~40 ≈ 15.
 */
export function moveAccuracyFromLoss(winPercentLoss: number): number {
  if (!Number.isFinite(winPercentLoss)) return 0;
  const loss = Math.max(0, Math.min(100, winPercentLoss));
  const raw = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

export type SideAccuracy = {
  formulaVersion: string;
  /** Null when there is not enough analysed evidence — never a guess. */
  accuracy: number | null;
  insufficientReason: "TOO_FEW_MOVES" | "LOW_COVERAGE" | null;
  totalMoves: number;
  eligibleMoves: number;
  forcedMoves: number;
  unclassifiedMoves: number;
};

/**
 * Game accuracy for one side: the mean of the arithmetic and the harmonic
 * mean of per-move accuracies. The arithmetic mean alone lets many easy moves
 * hide a blunder; the harmonic mean is dominated by the worst moves; their
 * average keeps both visible. Per-move values are floored at 1 inside the
 * harmonic mean so a single 0 cannot zero the game.
 *
 * Eligible = classified moves (FORCED and UNCLASSIFIED are excluded).
 */
export function sideAccuracy(
  moves: Pick<ClassifiedMove, "classification" | "winPercentLoss">[],
  policy: AccuracyPolicy = DEFAULT_ACCURACY_POLICY
): SideAccuracy {
  const forcedMoves = moves.filter((m) => m.classification === "FORCED").length;
  const eligible = moves.filter(
    (m) => m.classification !== "FORCED" && m.classification !== "UNCLASSIFIED" && m.winPercentLoss !== null
  );
  const unclassifiedMoves = moves.length - forcedMoves - eligible.length;
  const base = {
    eligibleMoves: eligible.length,
    forcedMoves,
    formulaVersion: policy.version,
    totalMoves: moves.length,
    unclassifiedMoves
  };

  if (eligible.length < policy.minEligibleMoves) {
    return { ...base, accuracy: null, insufficientReason: "TOO_FEW_MOVES" };
  }
  const judgeable = moves.length - forcedMoves;
  if (judgeable > 0 && eligible.length / judgeable < policy.minCoverage) {
    return { ...base, accuracy: null, insufficientReason: "LOW_COVERAGE" };
  }

  const values = eligible.map((m) => moveAccuracyFromLoss(m.winPercentLoss as number));
  const arithmetic = values.reduce((a, b) => a + b, 0) / values.length;
  const harmonic = values.length / values.reduce((a, v) => a + 1 / Math.max(1, v), 0);
  const accuracy = Math.max(0, Math.min(100, (arithmetic + harmonic) / 2));
  return { ...base, accuracy: roundTo(accuracy, 1), insufficientReason: null };
}

// ──────────────────────────────────────────────────────────────
// Whole game
// ──────────────────────────────────────────────────────────────

export type ClassifiedGameMove = ClassifiedMove & {
  ply: number;
  side: ChessColor;
  uci: string;
  san: string;
};

export type GameClassification = {
  conventionVersion: string;
  classificationVersion: string;
  accuracyVersion: string;
  moves: ClassifiedGameMove[];
  counts: Record<ChessColor, Record<MoveClassification, number>>;
  accuracy: Record<ChessColor, SideAccuracy>;
  /** True when the engine data was incomplete (failed / skipped positions, truncation). */
  limited: boolean;
};

const emptyCounts = (): Record<MoveClassification, number> =>
  Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c, 0])) as Record<MoveClassification, number>;

/** Classify every move of an engine-analysed game and score both sides. */
export function classifyGame(
  game: GameEngineAnalysis,
  policy: MoveClassificationPolicy = DEFAULT_MOVE_CLASSIFICATION_POLICY,
  accuracyPolicy: AccuracyPolicy = DEFAULT_ACCURACY_POLICY
): GameClassification {
  assertValidClassificationPolicy(policy);
  const evidence = moveEvidenceFromGame(game);
  const moves: ClassifiedGameMove[] = game.moves.map((move, i) => ({
    ...classifyMove(evidence[i], policy),
    ply: move.ply,
    san: move.san,
    side: move.side,
    uci: move.uci
  }));

  const counts = { black: emptyCounts(), white: emptyCounts() };
  for (const move of moves) counts[move.side][move.classification] += 1;

  return {
    accuracy: {
      black: sideAccuracy(moves.filter((m) => m.side === "black"), accuracyPolicy),
      white: sideAccuracy(moves.filter((m) => m.side === "white"), accuracyPolicy)
    },
    accuracyVersion: accuracyPolicy.version,
    classificationVersion: policy.version,
    conventionVersion: EVALUATION_CONVENTION_VERSION,
    counts,
    limited: !game.complete || game.truncated !== null,
    moves
  };
}
