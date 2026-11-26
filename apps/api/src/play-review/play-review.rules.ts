import {
  PLAY_REVIEW_RULES_VERSION,
  classifyGame,
  rankPlayFindings,
  sideAccuracy,
  type ClassifiedGameMove,
  type GameEngineAnalysis,
  type MoveClassification,
  type PlayFinding,
  type PlayFindingKind,
  type PlayItem,
  type PlayTacticStats
} from "@nexa-chess/types";
import { detectGameTactics } from "../game-analysis/tactics/detect-tactics";

/** What one review row stores (`AiPlayReview`). */
export type BuiltPlayReview = {
  accuracy: number | null;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  missedTactics: number;
  studentMoves: number;
  findings: PlayFinding[];
  /** The student's chances per motif (weak spots, docs/WEAK_SPOTS.md). */
  tactics: PlayTacticStats;
  versions: Record<string, string>;
};

/** Classifications that become a finding, and as what. */
const FINDING_FOR: Partial<Record<MoveClassification, PlayFindingKind>> = {
  BLUNDER: "BLUNDER",
  INACCURACY: "INACCURACY",
  MATE_ALLOWED: "BLUNDER",
  MISSED_DRAW: "MISTAKE",
  MISSED_MATE: "MISSED_MATE",
  MISSED_WIN: "MISSED_WIN",
  MISTAKE: "MISTAKE"
};

/** Segments a review analyses: those with at least one of the student's moves. */
export function reviewableSegments(item: PlayItem): number[] {
  return item.segments.flatMap((segment, index) => (segment.moves.some((m) => m.byStudent) ? [index] : []));
}

/**
 * The engine review of one play item, from the engine output of each
 * reviewable segment. Only the STUDENT's moves are judged (an opponent's,
 * the engine's or a puzzle's setup moves never count); evaluations are the
 * shared White-relative ones (`classifyGame`), tactics the Game Analysis
 * detector. Pure: the caller runs the engine.
 */
export function buildPlayReview(
  item: PlayItem,
  analysed: { segment: number; engine: GameEngineAnalysis }[],
  engineName: string
): BuiltPlayReview {
  const judged: ClassifiedGameMove[] = [];
  const findings: PlayFinding[] = [];
  let missedTactics = 0;
  const tacticStats: PlayTacticStats = {};
  const statsFor = (motif: keyof PlayTacticStats) => (tacticStats[motif] ??= { allowed: 0, alternative: 0, found: 0, missed: 0 });
  const versions: Record<string, string> = { engine: engineName, rules: PLAY_REVIEW_RULES_VERSION };

  for (const { segment: index, engine } of analysed) {
    const segment = item.segments[index];
    if (!segment) continue;
    const classification = classifyGame(engine);
    const tactics = detectGameTactics(engine, classification);
    versions.accuracy = classification.accuracyVersion;
    versions.classification = classification.classificationVersion;
    versions.convention = classification.conventionVersion;
    versions.tactics = tactics.version;

    // classifyGame's ply is the move's 0-based index; PlayMove.ply is 1-based.
    const byStudent = (ply0: number) => segment.moves[ply0]?.byStudent === true;
    for (const move of classification.moves) {
      if (!byStudent(move.ply)) continue;
      judged.push(move);
      const kind = FINDING_FOR[move.classification];
      if (!kind) continue;
      const top = engine.positions[move.ply]?.lines.find((line) => line.rank === 1);
      findings.push({
        bestMoveSan: top?.pvSan[0] ?? null,
        fenBefore: engine.positions[move.ply]?.fen ?? "",
        kind,
        motif: null,
        playedSan: move.san,
        ply: move.ply + 1,
        segment: index,
        winPercentLoss: move.winPercentLoss === null ? null : Math.round(move.winPercentLoss * 10) / 10
      });
    }
    for (const chance of tactics.opportunities) {
      if (!byStudent(chance.ply)) {
        // The opponent's chance that the student's own move handed over (as game analysis counts it).
        if (chance.allowedByPly !== null && byStudent(chance.allowedByPly)) statsFor(chance.primaryMotif).allowed += 1;
        continue;
      }
      // UNKNOWN (the move wasn't classified) counts nowhere, as in game insights.
      if (chance.outcome === "FOUND") statsFor(chance.primaryMotif).found += 1;
      else if (chance.outcome === "ALTERNATIVE") statsFor(chance.primaryMotif).alternative += 1;
      else if (chance.outcome === "MISSED") statsFor(chance.primaryMotif).missed += 1;
      if (chance.outcome !== "MISSED") continue;
      missedTactics += 1;
      const played = classification.moves.find((m) => m.ply === chance.ply);
      findings.push({
        bestMoveSan: chance.lineSan[0] ?? null,
        fenBefore: chance.fen,
        kind: "MISSED_TACTIC",
        motif: chance.primaryMotif,
        playedSan: played?.san ?? "",
        ply: chance.ply + 1,
        segment: index,
        winPercentLoss: played?.winPercentLoss == null ? null : Math.round(played.winPercentLoss * 10) / 10
      });
    }
  }

  const count = (...labels: MoveClassification[]) => judged.filter((m) => labels.includes(m.classification)).length;
  return {
    accuracy: roundOrNull(judged.length ? sideAccuracy(judged).accuracy : null),
    blunders: count("BLUNDER", "MATE_ALLOWED"),
    findings: rankPlayFindings(findings),
    inaccuracies: count("INACCURACY"),
    missedTactics,
    mistakes: count("MISTAKE", "MISSED_WIN", "MISSED_MATE", "MISSED_DRAW"),
    studentMoves: judged.length,
    tactics: tacticStats,
    versions
  };
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}
