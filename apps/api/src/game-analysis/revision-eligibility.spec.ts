import type { EngineLine, Evaluation, GameEngineAnalysis, TacticalOpportunity } from '@nexa-chess/types';
import { revisionEligibility } from './revision-eligibility';

const FORK_FEN = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
const MATE_FEN = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';

const line = (rank: number, evaluation: Evaluation, pv: string[]): EngineLine => ({
  bound: 'exact',
  depth: 20,
  evaluation,
  pvSan: [],
  pvUci: pv,
  rank,
});

function engineWith(fen: string, lines: EngineLine[]): GameEngineAnalysis {
  return {
    budgetExhausted: false,
    complete: true,
    config: { budgetMs: 1, concurrency: 1, depth: 'STANDARD', maxDepth: 18, movetimeMs: 800, multiPv: 2, rootMoveSearch: false },
    conventionVersion: 'white-relative-v1',
    engine: 'test',
    moves: [],
    positions: [{ error: null, fen, legalMoveCount: 20, lines, ply: 0, sideToMove: 'white', status: 'ANALYSED', terminal: null }],
    startFen: fen,
    truncated: null,
  };
}

const opp = (over: Partial<TacticalOpportunity>): TacticalOpportunity => ({
  allowedByPly: null,
  bestMoveUci: 'd5c7',
  fen: FORK_FEN,
  gain: { kind: 'MATERIAL', pawns: 5 },
  lineSan: [],
  lineUci: [],
  motifs: [],
  outcome: 'MISSED',
  playedUci: 'e1e2',
  ply: 0,
  primaryMotif: 'FORK',
  side: 'white',
  ...over,
});

describe('revisionEligibility', () => {
  it('accepts a missed material tactic whose best move is clearly unique', () => {
    const engine = engineWith(FORK_FEN, [line(1, { cp: 500, kind: 'cp' }, ['d5c7']), line(2, { cp: -150, kind: 'cp' }, ['e1e2'])]);
    expect(revisionEligibility(engine, opp({}))).toEqual({
      eligible: true,
      kind: 'UNIQUE_MOVE',
      solution: [{ san: 'Nc7+', uci: 'd5c7' }],
    });
  });

  it('refuses without a second line (several good moves are possible)', () => {
    const engine = engineWith(FORK_FEN, [line(1, { cp: 500, kind: 'cp' }, ['d5c7'])]);
    expect(revisionEligibility(engine, opp({}))).toMatchObject({ eligible: false, reason: expect.stringMatching(/several good moves/) });
  });

  it('refuses when another move is nearly as good', () => {
    const engine = engineWith(FORK_FEN, [line(1, { cp: 500, kind: 'cp' }, ['d5c7']), line(2, { cp: 420, kind: 'cp' }, ['d5b6'])]);
    expect(revisionEligibility(engine, opp({})).eligible).toBe(false);
  });

  it('refuses a tactic that was found or played equally well', () => {
    const engine = engineWith(FORK_FEN, [line(1, { cp: 500, kind: 'cp' }, ['d5c7']), line(2, { cp: -150, kind: 'cp' }, ['e1e2'])]);
    expect(revisionEligibility(engine, opp({ outcome: 'FOUND' })).eligible).toBe(false);
    expect(revisionEligibility(engine, opp({ outcome: 'ALTERNATIVE' })).eligible).toBe(false);
  });

  it('turns a forced mate into its whole mating line', () => {
    const engine = engineWith(MATE_FEN, [line(1, { kind: 'mate', moves: 1, winner: 'white' }, ['a1a8'])]);
    expect(revisionEligibility(engine, opp({ bestMoveUci: 'a1a8', fen: MATE_FEN, gain: { kind: 'MATE', moves: 1 } }))).toEqual({
      eligible: true,
      kind: 'MATE',
      solution: [{ san: 'Ra8#', uci: 'a1a8' }],
    });
  });

  it('refuses a mating line that does not actually reach mate', () => {
    const engine = engineWith(MATE_FEN, [line(1, { kind: 'mate', moves: 2, winner: 'white' }, ['a1a7'])]);
    expect(revisionEligibility(engine, opp({ bestMoveUci: 'a1a7', fen: MATE_FEN, gain: { kind: 'MATE', moves: 2 } })).eligible).toBe(false);
  });

  it('refuses when the stored position does not match the tactic', () => {
    const engine = engineWith(MATE_FEN, [line(1, { cp: 500, kind: 'cp' }, ['d5c7'])]);
    expect(revisionEligibility(engine, opp({})).eligible).toBe(false);
  });
});
