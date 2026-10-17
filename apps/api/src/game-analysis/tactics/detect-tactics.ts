import type { Square } from 'chess.js';
import {
  DEFAULT_MOVE_CLASSIFICATION_POLICY,
  DEFAULT_TACTIC_DETECTION_POLICY,
  sortMotifEvidence,
  winPercent,
  type ClassifiedGameMove,
  type EngineLine,
  type GameClassification,
  type GameEngineAnalysis,
  type MoveClassification,
  type MoveClassificationPolicy,
  type TacticDetectionPolicy,
  type TacticGain,
  type TacticMotifEvidence,
  type TacticOutcome,
  type TacticalOpportunity,
  type GameTactics,
} from '@nexa-chess/types';
import { Chess } from '../../common/chess/chess';
import { isBackRankMate, isDefended, materialBalance, motifsOfMove, other } from './board';

/** A played move this bad that leaves the opponent a tactic "allowed" it. */
const ALLOWING: ReadonlySet<MoveClassification> = new Set([
  'MISTAKE',
  'BLUNDER',
  'MISSED_WIN',
  'MISSED_MATE',
  'MISSED_DRAW',
  'MATE_ALLOWED',
]);

type LineReplay = {
  /** Mover's material balance after each ply of the line (index 0 = after the first move). */
  balances: number[];
  fens: string[];
  san: string[];
  /** The board after the last move that replayed. */
  final: Chess;
};

function replayLine(fen: string, uci: string[], maxPlies: number): LineReplay {
  const chess = new Chess(fen);
  const mover = chess.turn();
  const out: LineReplay = { balances: [], fens: [fen], final: chess, san: [] };
  for (const move of uci.slice(0, maxPlies)) {
    try {
      const played = chess.move({ from: move.slice(0, 2), promotion: move.slice(4) || undefined, to: move.slice(2, 4) });
      out.san.push(played.san);
    } catch {
      break;
    }
    out.balances.push(materialBalance(chess, mover));
    out.fens.push(chess.fen());
  }
  return out;
}

/**
 * Material the line wins for the mover, measured after the opponent's reply
 * (an even ply) so a capture that is simply recaptured counts as nothing. A
 * one-move line counts its own capture only when the square is safe.
 */
function lineMaterial(replay: LineReplay, fen: string, firstUci: string): number | null {
  const n = replay.balances.length;
  if (n === 0) return null;
  if (n === 1) {
    const board = new Chess(replay.fens[1]);
    const mover = new Chess(fen).turn();
    const to = firstUci.slice(2, 4) as Square;
    return isDefended(board, to, other(mover)) ? null : replay.balances[0];
  }
  return replay.balances[n % 2 === 0 ? n - 1 : n - 2];
}

const topLine = (lines: EngineLine[]) => lines.find((l) => l.rank === 1) ?? null;

/** Which squares a pattern threatens (the pieces it is meant to win). */
const TARGETS: Partial<Record<TacticMotifEvidence['motif'], (squares: string[]) => string[]>> = {
  DISCOVERED_ATTACK: (sq) => sq.slice(1),
  DOUBLE_ATTACK: (sq) => sq.slice(1),
  FORK: (sq) => sq.slice(1),
  PIN: (sq) => sq.slice(1),
  SKEWER: (sq) => sq.slice(1),
};

/**
 * A board pattern is only credited when the engine line exploits it: one of
 * the pieces it targets is captured by the side's own moves later in the line
 * (or, for a forced mate, the pattern is a check that drives it). A fork that
 * wins nothing it forks isn't why the line works. Checks, captures and
 * promotions are their own evidence and always pass.
 */
function isRealised(m: TacticMotifEvidence, lineUci: string[], replay: LineReplay, gain: TacticGain): boolean {
  const targetsOf = TARGETS[m.motif];
  if (!targetsOf) return true;
  const targets = new Set(targetsOf(m.squares));
  for (let i = m.atLinePly; i < lineUci.length; i += 2) {
    const to = lineUci[i].slice(2, 4);
    if (!targets.has(to)) continue;
    // A capture: the target square held an enemy piece just before this move.
    const board = new Chess(replay.fens[i]);
    const occupant = board.get(to as Square);
    if (occupant && occupant.color !== board.turn()) return true;
  }
  return gain.kind === 'MATE' && m.squares.length > 0 && replay.final.isCheckmate() && targets.has(kingSquare(replay.fens[m.atLinePly], m) ?? '');
}

/** For a mate: the enemy king's square if the pattern targets it. */
function kingSquare(fen: string, m: TacticMotifEvidence): string | null {
  const board = new Chess(fen);
  const enemy = other(board.turn());
  return m.squares.slice(1).find((s) => board.get(s as Square)?.type === 'k' && board.get(s as Square)?.color === enemy) ?? null;
}

/** Sequence-based motifs, read off the engine line rather than one board. */
export function sequenceMotifs(
  fen: string,
  line: string[],
  previous: { uci: string; fenBefore: string } | null,
): TacticMotifEvidence[] {
  const out: TacticMotifEvidence[] = [];
  if (line.length < 3) return out;
  const board = new Chess(fen);
  const mover = board.turn();
  const enemy = other(mover);
  const first = line[0];
  const third = line[2];
  const firstTo = first.slice(2, 4) as Square;
  const thirdTo = third.slice(2, 4) as Square;

  // Removal of the defender: take a piece that guarded something, then take that.
  const removed = board.get(firstTo);
  if (removed && removed.color === enemy) {
    const guarded = board
      .board()
      .flat()
      .filter((p) => p && p.color === enemy && p.square !== firstTo && p.type !== 'p' && p.type !== 'k')
      .filter((p) => board.attackers(p!.square, enemy).includes(firstTo) && board.attackers(p!.square, mover).length > 0);
    const target = guarded.find((p) => p!.square === thirdTo);
    if (target) out.push({ atLinePly: 0, confidence: 'INFERRED', motif: 'REMOVAL_OF_DEFENDER', squares: [firstTo, thirdTo] });
  }

  // Intermediate move: the opponent just captured; a recapture was there, but
  // the line plays something else first and recaptures later.
  if (previous) {
    const prevBoard = new Chess(previous.fenBefore);
    const captureSquare = previous.uci.slice(2, 4) as Square;
    const victim = prevBoard.get(captureSquare);
    if (victim && victim.color === mover) {
      const canRecapture = board.moves({ verbose: true }).some((m) => m.to === captureSquare);
      const recapturedLater = [line[2], line[4]].some((m) => m && m.slice(2, 4) === captureSquare);
      if (canRecapture && firstTo !== captureSquare && recapturedLater) {
        out.push({ atLinePly: 0, confidence: 'INFERRED', motif: 'INTERMEDIATE_MOVE', squares: [first.slice(0, 2), captureSquare] });
      }
    }
  }
  return out;
}

function outcomeFor(move: ClassifiedGameMove | undefined, bestUci: string, policy: MoveClassificationPolicy): TacticOutcome {
  if (!move) return 'UNKNOWN';
  if (move.uci === bestUci) return 'FOUND';
  if (move.classification === 'UNCLASSIFIED') return 'UNKNOWN';
  if (move.classification === 'FORCED') return 'FOUND';
  if (ALLOWING.has(move.classification)) return 'MISSED';
  if (move.winPercentLoss !== null && move.winPercentLoss >= policy.mistakeLoss) return 'MISSED';
  return 'ALTERNATIVE';
}

/**
 * Tactical opportunities in an analysed game. A position qualifies when its
 * engine line (exact, deep enough) wins material or forces mate AND the
 * mover's expected score jumped since the previous position — i.e. the
 * opponent's last move gave it away. That second test keeps a sound
 * sacrifice, a recapture, or the middle of a combination already under way
 * from being reported as a fresh tactic.
 */
export function detectGameTactics(
  game: GameEngineAnalysis,
  classification: GameClassification,
  policy: TacticDetectionPolicy = DEFAULT_TACTIC_DETECTION_POLICY,
  classificationPolicy: MoveClassificationPolicy = DEFAULT_MOVE_CLASSIFICATION_POLICY,
): GameTactics {
  const opportunities: TacticalOpportunity[] = [];
  const movesByPly = new Map(classification.moves.map((m) => [m.ply, m]));

  for (const position of game.positions) {
    if (position.status !== 'ANALYSED') continue;
    const played = game.moves[position.ply];
    // The final position has no decision to judge.
    if (!played) continue;
    const top = topLine(position.lines);
    if (!top || top.bound !== 'exact' || top.evaluation === null || top.depth < classificationPolicy.minDepth) continue;
    const firstUci = top.pvUci[0]?.toLowerCase();
    if (!firstUci) continue;

    const side = position.sideToMove;
    const winNow = winPercent(top.evaluation, side);
    const prev = position.ply > 0 ? game.positions[position.ply - 1] : null;
    const prevTop = prev && (prev.status === 'ANALYSED' || prev.status === 'TERMINAL') ? topLine(prev.lines) : null;
    if (position.ply > 0 && (!prevTop || prevTop.evaluation === null || prevTop.bound !== 'exact')) continue;
    const winBefore = prevTop?.evaluation ? winPercent(prevTop.evaluation, side) : 50;
    // A forced mate is new evidence whenever it wasn't already forced before the
    // opponent's move — even in a won position, where win% can't jump far.
    const mateIsNew =
      top.evaluation.kind === 'mate' &&
      top.evaluation.winner === side &&
      !(prevTop?.evaluation?.kind === 'mate' && prevTop.evaluation.winner === side);
    if (!mateIsNew && winNow - winBefore < policy.minWinPercentJump) continue;

    const replay = replayLine(position.fen, top.pvUci, policy.maxLinePlies);
    let gain: TacticGain | null = null;
    if (top.evaluation.kind === 'mate') {
      if (top.evaluation.winner === side && top.evaluation.moves <= policy.maxMateMoves) {
        gain = { kind: 'MATE', moves: top.evaluation.moves };
      }
    } else {
      const end = lineMaterial(replay, position.fen, firstUci);
      // Baseline = the balance before the opponent's last move, so winning
      // back what they just took is not a tactic.
      const baseline = prev ? materialBalance(new Chess(prev.fen), side === 'white' ? 'w' : 'b') : materialBalance(new Chess(position.fen), side === 'white' ? 'w' : 'b');
      if (end !== null && end - baseline >= policy.minMaterialGain) gain = { kind: 'MATERIAL', pawns: end - baseline };
    }
    if (!gain) continue;

    const lineUci = top.pvUci.slice(0, replay.san.length).map((u) => u.toLowerCase());
    let motifs: TacticMotifEvidence[] = motifsOfMove(position.fen, firstUci, 0);
    // The side's second move of the line can carry the pattern (a check first, then the fork).
    if (lineUci.length >= 3 && replay.fens.length >= 3) {
      const later = motifsOfMove(replay.fens[2], lineUci[2], 2)
        // A capture on the second move is just the material being collected.
        .filter((m) => m.motif !== 'HANGING_PIECE')
        .map((m) => ({ ...m, confidence: 'INFERRED' as const }));
      motifs = [...motifs, ...later];
    }
    // A pattern only counts when the line actually cashes it in.
    motifs = motifs.filter((m) => isRealised(m, lineUci, replay, gain!));
    const previousMove = position.ply > 0 && prev ? { fenBefore: prev.fen, uci: game.moves[position.ply - 1].uci } : null;
    motifs = [...motifs, ...sequenceMotifs(position.fen, top.pvUci.map((u) => u.toLowerCase()), previousMove)];

    if (gain.kind === 'MATE') {
      motifs.push({ atLinePly: 0, confidence: 'CONFIRMED', motif: 'MATE', squares: [] });
      if (replay.final.isCheckmate() && isBackRankMate(replay.final)) {
        motifs.push({ atLinePly: replay.san.length - 1, confidence: 'CONFIRMED', motif: 'BACK_RANK_MATE', squares: [] });
      }
    }
    if (motifs.length === 0) motifs.push({ atLinePly: 0, confidence: 'CONFIRMED', motif: 'MATERIAL_GAIN', squares: [] });

    // One entry per motif (the strongest evidence wins).
    const seen = new Set<string>();
    const sorted = sortMotifEvidence(motifs).filter((m) => (seen.has(m.motif) ? false : (seen.add(m.motif), true)));

    const playedMove = movesByPly.get(position.ply);
    const opponentMove = position.ply > 0 ? movesByPly.get(position.ply - 1) : undefined;
    opportunities.push({
      allowedByPly: opponentMove && ALLOWING.has(opponentMove.classification) ? opponentMove.ply : null,
      bestMoveUci: firstUci,
      fen: position.fen,
      gain,
      lineSan: replay.san,
      lineUci: top.pvUci.slice(0, replay.san.length),
      motifs: sorted,
      outcome: outcomeFor(playedMove, firstUci, classificationPolicy),
      playedUci: played.uci,
      ply: position.ply,
      primaryMotif: sorted[0].motif,
      side,
    });
  }

  return { opportunities, version: policy.version };
}
