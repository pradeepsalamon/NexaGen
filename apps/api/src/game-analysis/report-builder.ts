import { createHash } from 'crypto';
import {
  INSIGHT_THRESHOLDS,
  MOVE_CLASSIFICATIONS,
  REPORT_LIMITATION_TEXT,
  classifyGame,
  explainMove,
  gamePhases,
  lineSanForReport,
  lineThroughPath,
  parseClockComment,
  parsePgnToMoveTree,
  parseTimeControl,
  type ClockStats,
  type GameClassification,
  type GameEngineAnalysis,
  type GamePhase,
  type GameReportMove,
  type GameTactics,
  type MotifStats,
  type MoveClassification,
  type PhaseStats,
  type TacticMotif,
} from '@nexa-chess/types';
import { createMoveTreeChess } from '../common/chess/move-tree-chess';
import { detectGameTactics } from './tactics/detect-tactics';

/** What the analyser needs from a stored game. */
export type GameMoves = { startFen: string; movesUci: string[]; clocksMs: (number | null)[] };

/** Mainline + per-move clocks from a stored PGN. Throws when the PGN no longer parses. */
export function gameMovesFromPgn(pgn: string): GameMoves {
  const parsed = parsePgnToMoveTree(pgn, createMoveTreeChess);
  const nodes = lineThroughPath(parsed.tree, []).nodes;
  return {
    clocksMs: nodes.map((n) => parseClockComment(n.comment)),
    movesUci: nodes.map((n) => n.uci),
    startFen: parsed.tree.rootFen,
  };
}

/** Identity of a game's moves: a changed mainline is a different thing to analyse. */
export function gameFingerprint(moves: Pick<GameMoves, 'startFen' | 'movesUci'>): string {
  return createHash('sha256').update(`${moves.startFen}\n${moves.movesUci.join(' ')}`).digest('hex');
}

/** Errors worth counting (what a coach would call a mistake or worse). */
export const ERROR_CLASSES: ReadonlySet<MoveClassification> = new Set([
  'MISTAKE',
  'BLUNDER',
  'MISSED_WIN',
  'MISSED_MATE',
  'MISSED_DRAW',
  'MATE_ALLOWED',
]);
const BLUNDER_CLASSES: ReadonlySet<MoveClassification> = new Set(['BLUNDER', 'MISSED_MATE', 'MATE_ALLOWED']);

export type SideSummary = {
  movesTotal: number;
  movesEligible: number;
  accuracy: number | null;
  counts: Record<MoveClassification, number>;
  tactics: Partial<Record<TacticMotif, MotifStats>>;
  phases: Record<GamePhase, PhaseStats>;
  clock: ClockStats | null;
};

export type BuiltAnalysis = {
  classification: GameClassification;
  tactics: GameTactics;
  moves: GameReportMove[];
  sides: Record<'white' | 'black', SideSummary>;
  limitations: string[];
  hasClockData: boolean;
};

const emptyMotif = (): MotifStats => ({ allowed: 0, alternative: 0, found: 0, foundPlies: [], missed: 0, missedPlies: [], unknown: 0 });
const emptyPhases = (): Record<GamePhase, PhaseStats> => ({
  ENDGAME: { blunders: 0, lossSum: 0, mistakes: 0, moves: 0 },
  MIDDLEGAME: { blunders: 0, lossSum: 0, mistakes: 0, moves: 0 },
  OPENING: { blunders: 0, lossSum: 0, mistakes: 0, moves: 0 },
});

/**
 * Turn stored engine output into everything a report and the insights need.
 * Pure: re-running it on the same input gives the same output, which is what
 * lets a new classification version be re-derived without Stockfish.
 */
export function buildAnalysis(
  engine: GameEngineAnalysis,
  clocksMs: (number | null)[],
  timeControl: string | null,
): BuiltAnalysis {
  const classification = classifyGame(engine);
  const tactics = detectGameTactics(engine, classification);
  const phases = gamePhases(engine.positions.map((p) => p.fen));

  const moves: GameReportMove[] = classification.moves.map((m) => {
    const before = engine.positions[m.ply];
    const top = before?.status === 'ANALYSED' ? before.lines.find((l) => l.rank === 1) : undefined;
    const bestMoveSan = top?.pvSan[0] ?? null;
    return {
      ...m,
      bestMoveSan,
      clockMs: clocksMs[m.ply] ?? null,
      explanation: explainMove(m, bestMoveSan),
      fenAfter: engine.positions[m.ply + 1]?.fen ?? '',
      fenBefore: before?.fen ?? '',
      lineSan: lineSanForReport(top),
      phase: phases[m.ply] ?? 'MIDDLEGAME',
    };
  });

  const control = parseTimeControl(timeControl);
  const sides = { black: summarize('black'), white: summarize('white') };

  function summarize(side: 'white' | 'black'): SideSummary {
    const own = moves.filter((m) => m.side === side);
    const tacticStats: Partial<Record<TacticMotif, MotifStats>> = {};
    for (const opp of tactics.opportunities) {
      if (opp.side === side) {
        const stats = (tacticStats[opp.primaryMotif] ??= emptyMotif());
        const key = opp.outcome === 'FOUND' ? 'found' : opp.outcome === 'MISSED' ? 'missed' : opp.outcome === 'ALTERNATIVE' ? 'alternative' : 'unknown';
        stats[key] += 1;
        if (key === 'missed') stats.missedPlies.push(opp.ply);
        if (key === 'found') stats.foundPlies.push(opp.ply);
      } else if (opp.allowedByPly !== null) {
        // The opponent's tactic this side's own move handed over.
        (tacticStats[opp.primaryMotif] ??= emptyMotif()).allowed += 1;
      }
    }

    const phaseStats = emptyPhases();
    for (const m of own) {
      if (m.classification === 'UNCLASSIFIED' || m.classification === 'FORCED') continue;
      const stats = phaseStats[m.phase];
      stats.moves += 1;
      stats.lossSum += m.winPercentLoss ?? 0;
      if (BLUNDER_CLASSES.has(m.classification)) stats.blunders += 1;
      else if (ERROR_CLASSES.has(m.classification)) stats.mistakes += 1;
    }

    return {
      accuracy: classification.accuracy[side].accuracy,
      clock: clockStats(own, control?.initialMs ?? null),
      counts: classification.counts[side],
      movesEligible: classification.accuracy[side].eligibleMoves,
      movesTotal: own.length,
      phases: phaseStats,
      tactics: tacticStats,
    };
  }

  const limitations: string[] = [];
  if (engine.budgetExhausted) limitations.push(REPORT_LIMITATION_TEXT.BUDGET);
  if (engine.positions.some((p) => p.status === 'FAILED')) limitations.push(REPORT_LIMITATION_TEXT.FAILED_POSITIONS);
  if (engine.truncated) limitations.push(REPORT_LIMITATION_TEXT.TRUNCATED);
  if (engine.config.depth === 'QUICK') limitations.push(REPORT_LIMITATION_TEXT.QUICK);
  limitations.push(REPORT_LIMITATION_TEXT.NO_HISTORY);

  return {
    classification,
    hasClockData: sides.white.clock !== null || sides.black.clock !== null,
    limitations,
    moves,
    sides,
    tactics,
  };
}

/**
 * Time-pressure numbers, only when per-move clocks cover enough of the side's
 * moves (`minClockCoverage`). "Low on time" = below `lowTimeShare` of the
 * starting clock or `lowTimeMs`, whichever is larger; without a parseable
 * time control only `lowTimeMs` applies.
 */
export function clockStats(moves: Pick<GameReportMove, 'clockMs' | 'classification'>[], initialMs: number | null): ClockStats | null {
  if (moves.length === 0) return null;
  const clocked = moves.filter((m) => m.clockMs !== null);
  if (clocked.length / moves.length < INSIGHT_THRESHOLDS.minClockCoverage) return null;
  const threshold = Math.max(INSIGHT_THRESHOLDS.lowTimeMs, initialMs ? initialMs * INSIGHT_THRESHOLDS.lowTimeShare : 0);
  const stats: ClockStats = { clockedMoves: clocked.length, lowTimeErrors: 0, lowTimeMoves: 0, otherErrors: 0 };
  for (const m of clocked) {
    const low = (m.clockMs as number) < threshold;
    const error = ERROR_CLASSES.has(m.classification);
    if (low) stats.lowTimeMoves += 1;
    if (error && low) stats.lowTimeErrors += 1;
    else if (error) stats.otherErrors += 1;
  }
  return stats;
}

/** Result from one side's point of view. */
export function resultFor(result: string, side: 'white' | 'black'): 'WIN' | 'LOSS' | 'DRAW' | 'UNKNOWN' {
  if (result === '1/2-1/2') return 'DRAW';
  if (result === '1-0') return side === 'white' ? 'WIN' : 'LOSS';
  if (result === '0-1') return side === 'black' ? 'WIN' : 'LOSS';
  return 'UNKNOWN';
}

export const emptyCounts = () =>
  Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c, 0])) as Record<MoveClassification, number>;
