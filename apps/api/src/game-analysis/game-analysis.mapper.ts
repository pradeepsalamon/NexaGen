import type { GameAnalysis, ChessGame } from '@prisma/client';
import type {
  GameEngineAnalysis,
  GameAnalysisReport,
  GameAnalysisSummary,
  GameReportMove,
  GameTactics,
  MoveClassification,
  SideAccuracy,
} from '@nexa-chess/types';
import { revisionEligibility } from './revision-eligibility';

/** What `reportJson` holds — derived data cached for reads. */
export type StoredReport = {
  moves: GameReportMove[];
  tactics: GameTactics;
  sides: Record<'white' | 'black', { accuracy: SideAccuracy; counts: Record<MoveClassification, number> }>;
  limitations: string[];
  hasClockData: boolean;
  limited: boolean;
};

export function toSummary(row: GameAnalysis, currentFingerprint: string | null): GameAnalysisSummary {
  return {
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    depth: row.depth,
    engine: row.engine,
    error: row.error,
    gameId: row.gameId,
    id: row.id,
    progress: { done: row.progressDone, total: row.progressTotal },
    stale: currentFingerprint !== null && currentFingerprint !== row.gameFingerprint,
    status: row.status,
    versions: {
      accuracy: row.accuracyVersion,
      classification: row.classificationVersion,
      convention: row.conventionVersion,
      tactics: row.tacticsVersion,
    },
  };
}

export function toReport(
  row: GameAnalysis,
  game: Pick<ChessGame, 'id' | 'title' | 'whiteName' | 'blackName' | 'result' | 'startFen' | 'whitePlayerId' | 'blackPlayerId'>,
  currentFingerprint: string | null,
): GameAnalysisReport | null {
  const stored = row.reportJson as StoredReport | null;
  if (!stored) return null;
  return {
    analysis: toSummary(row, currentFingerprint),
    game: {
      blackName: game.blackName,
      id: game.id,
      result: game.result,
      startFen: game.startFen,
      title: game.title,
      whiteName: game.whiteName,
    },
    hasClockData: stored.hasClockData,
    limitations: stored.limitations,
    limited: stored.limited,
    moves: stored.moves,
    sides: {
      black: { ...stored.sides.black, name: game.blackName, playerId: game.blackPlayerId, side: 'black' },
      white: { ...stored.sides.white, name: game.whiteName, playerId: game.whitePlayerId, side: 'white' },
    },
    revisionEligiblePlies: eligiblePlies(row, stored),
    tactics: stored.tactics,
  };
}

function eligiblePlies(row: GameAnalysis, stored: StoredReport): number[] {
  const engine = row.engineJson as GameEngineAnalysis | null;
  if (!engine) return [];
  return stored.tactics.opportunities.filter((o) => revisionEligibility(engine, o).eligible).map((o) => o.ply);
}
