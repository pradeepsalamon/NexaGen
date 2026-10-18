import {
  ACCURACY_FORMULA_VERSION,
  GAME_TACTICS_VERSION,
  INSIGHT_THRESHOLDS,
  MOVE_CLASSIFICATIONS,
  MOVE_CLASSIFICATION_VERSION,
  type MotifStats,
  type MoveClassification,
} from '@nexa-chess/types';
import { aggregateInsights, onePerGame, type InsightRow } from './insights';

const counts = (over: Partial<Record<MoveClassification, number>> = {}) =>
  ({ ...Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c, 0])), GOOD: 30, ...over }) as Record<MoveClassification, number>;
const motif = (over: Partial<MotifStats>): MotifStats => ({
  allowed: 0,
  alternative: 0,
  found: 0,
  foundPlies: [],
  missed: 0,
  missedPlies: [],
  unknown: 0,
  ...over,
});
const phases = () => ({
  ENDGAME: { blunders: 0, lossSum: 0, mistakes: 0, moves: 0 },
  MIDDLEGAME: { blunders: 1, lossSum: 40, mistakes: 1, moves: 20 },
  OPENING: { blunders: 0, lossSum: 5, mistakes: 0, moves: 10 },
});

let n = 0;
const row = (over: Partial<InsightRow> = {}): InsightRow => {
  n += 1;
  return {
    accuracy: 80,
    accuracyVersion: ACCURACY_FORMULA_VERSION,
    analysisCreatedAt: new Date(2026, 0, 1, 0, n),
    analysisId: `a${n}`,
    classificationVersion: MOVE_CLASSIFICATION_VERSION,
    clock: null,
    counts: counts(),
    depth: 'STANDARD',
    eco: null,
    gameId: `g${n}`,
    openingName: null,
    phases: phases(),
    playedAt: new Date(Date.UTC(2026, 0, n)),
    rating: null,
    result: 'WIN',
    side: 'white',
    sourceKey: 'IMPORT',
    tactics: {},
    tacticsVersion: GAME_TACTICS_VERSION,
    ...over,
  };
};

describe('onePerGame', () => {
  it('keeps the deepest analysis of a game, then the newest', () => {
    const quick = row({ depth: 'QUICK', gameId: 'x' });
    const deep = row({ depth: 'DEEP', gameId: 'x' });
    const newerStandard = row({ depth: 'STANDARD', gameId: 'x' });
    expect(onePerGame([quick, newerStandard, deep])).toEqual([deep]);
  });
});

describe('aggregateInsights', () => {
  it('withholds rates and trends with too few games', () => {
    const insights = aggregateInsights('s', [row(), row()]);
    expect(insights.gamesAnalysed).toBe(2);
    expect(insights.errorRates).toMatchObject({ blunders: null, inaccuracies: null, mistakes: null });
    expect(insights.phases.MIDDLEGAME.errorRate).toBeNull();
    expect(insights.trend.verdict).toBe('NOT_ENOUGH_DATA');
  });

  it('reports rates per 100 judged moves once there are enough games', () => {
    const rows = [1, 2, 3].map(() => row({ counts: counts({ BLUNDER: 1, GOOD: 18, INACCURACY: 1 }) }));
    const insights = aggregateInsights('s', rows);
    expect(insights.errorRates.judgedMoves).toBe(60);
    expect(insights.errorRates.blunders).toBeCloseTo(5);
    expect(insights.errorRates.inaccuracies).toBeCloseTo(5);
  });

  it('never mixes algorithm versions, and says how many it left out', () => {
    const insights = aggregateInsights('s', [row(), row({ classificationVersion: 'nexa-classify-v0' })]);
    expect(insights.gamesAnalysed).toBe(1);
    expect(insights.excludedOtherVersions).toBe(1);
  });

  it('keeps White and Black apart', () => {
    const insights = aggregateInsights('s', [row({ accuracy: 90 }), row({ accuracy: 60, result: 'LOSS', side: 'black' })]);
    expect(insights.byColor.white).toMatchObject({ accuracy: 90, games: 1, wins: 1 });
    expect(insights.byColor.black).toMatchObject({ accuracy: 60, games: 1, losses: 1 });
  });

  describe('tactical motifs', () => {
    const T = INSIGHT_THRESHOLDS;

    it('uses opportunities as the denominator and needs enough of them', () => {
      const insights = aggregateInsights('s', [row({ tactics: { FORK: motif({ missed: 2, missedPlies: [10, 20] }) } })]);
      const fork = insights.motifs.find((m) => m.motif === 'FORK');
      expect(fork).toMatchObject({ missRate: null, opportunities: 2, verdict: 'NOT_ENOUGH_DATA' });
      expect(fork?.evidence.examples).toHaveLength(2);
    });

    it('calls a motif a weakness only with repeated misses across several games', () => {
      const rows = Array.from({ length: T.minGamesForWeakness }, () =>
        row({ tactics: { FORK: motif({ alternative: 0, found: 1, missed: 1, missedPlies: [12] }) } }),
      );
      const fork = aggregateInsights('s', rows).motifs.find((m) => m.motif === 'FORK');
      expect(fork).toMatchObject({ found: 3, missRate: 0.5, missed: 3, opportunities: 6, verdict: 'WEAKNESS' });
    });

    it('does not call several misses in ONE game a recurring weakness', () => {
      const fork = aggregateInsights('s', [row({ tactics: { FORK: motif({ missed: 6, missedPlies: [1, 2, 3, 4, 5, 6] }) } })])
        .motifs.find((m) => m.motif === 'FORK');
      expect(fork?.verdict).toBe('NEUTRAL');
    });

    it('recognises a strength', () => {
      const rows = [1, 2, 3].map(() => row({ tactics: { PIN: motif({ found: 2 }) } }));
      expect(aggregateInsights('s', rows).motifs.find((m) => m.motif === 'PIN')?.verdict).toBe('STRENGTH');
    });

    it('counts tactics the student handed the opponent separately', () => {
      const insights = aggregateInsights('s', [row({ tactics: { HANGING_PIECE: motif({ allowed: 2 }) } })]);
      expect(insights.motifs.find((m) => m.motif === 'HANGING_PIECE')).toMatchObject({ allowed: 2, opportunities: 0 });
    });
  });

  it('compares the recent window with the one before it', () => {
    const n = INSIGHT_THRESHOLDS.minGamesPerTrendWindow;
    const older = Array.from({ length: n }, (_, i) => row({ accuracy: 60, playedAt: new Date(Date.UTC(2025, 0, i + 1)) }));
    const newer = Array.from({ length: n }, (_, i) => row({ accuracy: 75, playedAt: new Date(Date.UTC(2026, 0, i + 1)) }));
    const insights = aggregateInsights('s', [...older, ...newer]);
    expect(insights.trend).toMatchObject({ previous: { accuracy: 60 }, recent: { accuracy: 75 }, verdict: 'IMPROVING' });
  });

  it('reports no time analysis without trustworthy clocks', () => {
    expect(aggregateInsights('s', [row(), row(), row()]).time).toBeNull();
    const clock = { clockedMoves: 30, lowTimeErrors: 2, lowTimeMoves: 5, otherErrors: 1 };
    const time = aggregateInsights('s', [row({ clock }), row({ clock }), row({ clock })]).time;
    expect(time).toMatchObject({ lowTimeErrorRate: 40, otherErrorRate: 4 });
  });

  it('keeps ratings per source, never merged', () => {
    const insights = aggregateInsights('s', [
      row({ playedAt: new Date(Date.UTC(2026, 1, 1)), rating: 1500, sourceKey: 'LICHESS' }),
      row({ playedAt: new Date(Date.UTC(2026, 1, 2)), rating: 1550, sourceKey: 'LICHESS' }),
      row({ rating: 1200, sourceKey: 'CHESS_COM' }),
    ]);
    expect(insights.ratings).toEqual(
      expect.arrayContaining([
        { games: 2, latest: 1550, source: 'LICHESS' },
        { games: 1, latest: 1200, source: 'CHESS_COM' },
      ]),
    );
  });

  it('lists openings only where the game record named one', () => {
    const insights = aggregateInsights('s', [row(), row({ eco: 'B13', openingName: 'Caro-Kann Defense' })]);
    expect(insights.openings).toEqual([expect.objectContaining({ eco: 'B13', games: 1, name: 'Caro-Kann Defense' })]);
  });
});
