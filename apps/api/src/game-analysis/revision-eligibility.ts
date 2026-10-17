import {
  DEFAULT_MOVE_CLASSIFICATION_POLICY,
  winPercent,
  type GameEngineAnalysis,
  type SolutionMove,
  type TacticalOpportunity,
} from '@nexa-chess/types';
import { Chess } from '../common/chess/chess';

export type RevisionEligibility =
  | { eligible: true; solution: SolutionMove[]; kind: 'MATE' | 'UNIQUE_MOVE' }
  | { eligible: false; reason: string };

/**
 * Whether a missed tactic can become a puzzle whose answer is beyond doubt.
 *
 * - A forced mate: the whole engine line up to checkmate (the puzzle solver
 *   accepts any other mate, so an alternative mating move is never "wrong").
 * - A material tactic: only the first move, and only when the engine's second
 *   line from that same search is at least `onlyMoveGap` win% worse — i.e. the
 *   move is unique. Without MultiPV evidence it is refused: a position with
 *   several good moves makes an unfair puzzle.
 */
export function revisionEligibility(engine: GameEngineAnalysis, opp: TacticalOpportunity): RevisionEligibility {
  if (opp.outcome !== 'MISSED') return { eligible: false, reason: 'Only tactics that were missed become revision puzzles.' };
  const position = engine.positions[opp.ply];
  if (!position || position.status !== 'ANALYSED' || position.fen !== opp.fen) {
    return { eligible: false, reason: 'The analysis of this position is not available.' };
  }
  const top = position.lines.find((l) => l.rank === 1);
  if (!top || top.bound !== 'exact' || !top.evaluation) return { eligible: false, reason: 'The engine score here was not exact.' };

  if (opp.gain.kind === 'MATE') {
    const chess = new Chess(opp.fen);
    const solution: SolutionMove[] = [];
    for (const uci of top.pvUci) {
      try {
        const move = chess.move({ from: uci.slice(0, 2), promotion: uci.slice(4) || undefined, to: uci.slice(2, 4) });
        solution.push({ san: move.san, uci });
      } catch {
        return { eligible: false, reason: 'The mating line could not be replayed.' };
      }
      if (chess.isCheckmate()) return { eligible: true, kind: 'MATE', solution };
    }
    return { eligible: false, reason: 'The engine line does not reach checkmate.' };
  }

  const second = position.lines.find((l) => l.rank === 2);
  if (!second || second.bound !== 'exact' || !second.evaluation) {
    return { eligible: false, reason: 'There may be several good moves here, so it would not make a fair puzzle.' };
  }
  const side = position.sideToMove;
  const gap = winPercent(top.evaluation, side) - winPercent(second.evaluation, side);
  if (gap < DEFAULT_MOVE_CLASSIFICATION_POLICY.onlyMoveGap) {
    return { eligible: false, reason: 'Another move is nearly as good here, so it would not make a fair puzzle.' };
  }
  const chess = new Chess(opp.fen);
  try {
    const move = chess.move({
      from: opp.bestMoveUci.slice(0, 2),
      promotion: opp.bestMoveUci.slice(4) || undefined,
      to: opp.bestMoveUci.slice(2, 4),
    });
    return { eligible: true, kind: 'UNIQUE_MOVE', solution: [{ san: move.san, uci: opp.bestMoveUci }] };
  } catch {
    return { eligible: false, reason: 'The best move could not be replayed.' };
  }
}
