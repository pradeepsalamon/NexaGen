import {
  ACCURACY_FORMULA_VERSION,
  DEFAULT_ACCURACY_POLICY,
  DEFAULT_MOVE_CLASSIFICATION_POLICY,
  MOVE_CLASSIFICATION_VERSION,
  WIN_PERCENT_K,
  assertValidClassificationPolicy,
  classifyGame,
  classifyMove,
  evaluationForSide,
  evaluationFromEngineResult,
  evaluationScore,
  formatEvaluation,
  moveAccuracyFromLoss,
  normalizeUciScore,
  sideAccuracy,
  sideToMoveFromFen,
  toUciScore,
  winPercent,
  type ClassifiedMove,
  type EngineLine,
  type Evaluation,
  type GameEngineAnalysis,
  type MoveEvidence,
  type UciScore,
} from '@nexa-chess/types';

// Shared, pure game-analysis rules (packages/types/src/game-analysis.ts).
// Every evaluation below is WHITE-RELATIVE unless a test says otherwise.

const cp = (value: number): Evaluation => ({ kind: 'cp', cp: value });
const mate = (winner: 'white' | 'black', moves: number): Evaluation => ({ kind: 'mate', moves, winner });

/** The White-relative cp that gives White this expected score (inverse logistic). */
const cpForWhiteWin = (w: number) => -Math.log(100 / w - 1) / WIN_PERCENT_K;

const line = (
  rank: number,
  evaluation: Evaluation | null,
  move: string,
  extra: Partial<EngineLine> = {},
): EngineLine => ({
  bound: 'exact',
  depth: 20,
  evaluation,
  pvSan: [],
  pvUci: [move],
  rank,
  ...extra,
});

/** Evidence for White playing `played` (default: not the engine move) from a 30-move position. */
const evidence = (over: Partial<MoveEvidence> = {}): MoveEvidence => ({
  beforeSearched: true,
  legalMoveCount: 30,
  linesBefore: [line(1, cp(0), 'e2e4')],
  nextPositionLine: null,
  nextPositionTerminal: false,
  playedUci: 'a2a3',
  rootMoveLine: null,
  side: 'white',
  ...over,
});

/** White moves from `before` (win% for White) to `after`. */
const whiteMove = (beforeWin: number, afterWin: number, over: Partial<MoveEvidence> = {}) =>
  classifyMove(
    evidence({
      linesBefore: [line(1, cp(cpForWhiteWin(beforeWin)), 'e2e4')],
      nextPositionLine: line(1, cp(cpForWhiteWin(afterWin)), 'e7e5'),
      ...over,
    }),
  );

/** Mirror an evidence record: Black plays the same move from the colour-flipped position. */
const mirrorEval = (e: Evaluation | null): Evaluation | null =>
  e === null
    ? null
    : e.kind === 'cp'
      ? { kind: 'cp', cp: -e.cp }
      : { kind: 'mate', moves: e.moves, winner: e.winner === 'white' ? 'black' : 'white' };
const mirrorLine = (l: EngineLine | null): EngineLine | null => (l ? { ...l, evaluation: mirrorEval(l.evaluation) } : null);
const mirror = (ev: MoveEvidence): MoveEvidence => ({
  ...ev,
  linesBefore: ev.linesBefore.map((l) => mirrorLine(l) as EngineLine),
  nextPositionLine: mirrorLine(ev.nextPositionLine),
  rootMoveLine: mirrorLine(ev.rootMoveLine),
  side: ev.side === 'white' ? 'black' : 'white',
});

const essence = (m: ClassifiedMove) => ({
  classification: m.classification,
  limitedBy: m.limitedBy,
  loss: m.winPercentLoss,
  reasons: m.reasons,
});

describe('evaluation normalisation (side to move → White-relative)', () => {
  it('keeps a cp score as is when White is to move and negates it when Black is', () => {
    expect(normalizeUciScore({ kind: 'cp', value: 34 }, 'white')).toEqual(cp(34));
    expect(normalizeUciScore({ kind: 'cp', value: 34 }, 'black')).toEqual(cp(-34));
    expect(normalizeUciScore({ kind: 'cp', value: -120 }, 'black')).toEqual(cp(120));
  });

  it('never produces a negative zero', () => {
    const zero = normalizeUciScore({ kind: 'cp', value: 0 }, 'black');
    expect(zero).toEqual(cp(0));
    expect(Object.is((zero as { cp: number }).cp, -0)).toBe(false);
  });

  it('turns mate signs into a winner and a distance', () => {
    expect(normalizeUciScore({ kind: 'mate', value: 3 }, 'white')).toEqual(mate('white', 3));
    expect(normalizeUciScore({ kind: 'mate', value: 3 }, 'black')).toEqual(mate('black', 3));
    expect(normalizeUciScore({ kind: 'mate', value: -2 }, 'white')).toEqual(mate('black', 2));
    expect(normalizeUciScore({ kind: 'mate', value: -2 }, 'black')).toEqual(mate('white', 2));
  });

  it('reads mate 0 as the side to move already checkmated', () => {
    expect(normalizeUciScore({ kind: 'mate', value: 0 }, 'white')).toEqual(mate('black', 0));
    expect(normalizeUciScore({ kind: 'mate', value: 0 }, 'black')).toEqual(mate('white', 0));
  });

  it('rejects non-integer, NaN and infinite scores instead of treating them as 0', () => {
    expect(normalizeUciScore({ kind: 'cp', value: Number.NaN }, 'white')).toBeNull();
    expect(normalizeUciScore({ kind: 'cp', value: Infinity }, 'white')).toBeNull();
    expect(normalizeUciScore({ kind: 'cp', value: 1.5 }, 'white')).toBeNull();
    expect(normalizeUciScore({ kind: 'mate', value: 2.5 }, 'black')).toBeNull();
  });

  it('clamps out-of-range centipawn scores (tablebase wins) without overflowing', () => {
    expect(normalizeUciScore({ kind: 'cp', value: 20_000 }, 'white')).toEqual(cp(10_000));
    expect(normalizeUciScore({ kind: 'cp', value: 20_000 }, 'black')).toEqual(cp(-10_000));
  });

  it('round-trips through toUciScore for both sides', () => {
    const samples: UciScore[] = [
      { kind: 'cp', value: 0 },
      { kind: 'cp', value: 57 },
      { kind: 'cp', value: -312 },
      { kind: 'mate', value: 0 },
      { kind: 'mate', value: 4 },
      { kind: 'mate', value: -7 },
    ];
    for (const side of ['white', 'black'] as const) {
      for (const score of samples) {
        expect(toUciScore(normalizeUciScore(score, side) as Evaluation, side)).toEqual(score);
      }
    }
  });

  it('reads the existing StockfishAnalysisResult shape (pawns; mate wins)', () => {
    expect(evaluationFromEngineResult({ evaluation: 0.34, mate: null }, 'black')).toEqual(cp(-34));
    expect(evaluationFromEngineResult({ evaluation: 1.5, mate: 2 }, 'white')).toEqual(mate('white', 2));
    expect(evaluationFromEngineResult({ evaluation: null, mate: null }, 'white')).toBeNull();
    expect(evaluationFromEngineResult({ evaluation: Number.NaN, mate: null }, 'white')).toBeNull();
  });

  it('reads the side to move from a FEN', () => {
    expect(sideToMoveFromFen('8/8/8/8/8/8/8/K6k w - - 0 1')).toBe('white');
    expect(sideToMoveFromFen('8/8/8/8/8/8/8/K6k b - - 0 1')).toBe('black');
    expect(sideToMoveFromFen('garbage')).toBeNull();
  });
});

describe('player-relative evaluation', () => {
  it('shows each player their own view', () => {
    expect(evaluationForSide(cp(150), 'white')).toEqual({ cp: 150, kind: 'cp' });
    expect(evaluationForSide(cp(150), 'black')).toEqual({ cp: -150, kind: 'cp' });
    expect(evaluationForSide(mate('black', 3), 'black')).toEqual({ forPlayer: true, kind: 'mate', moves: 3 });
    expect(evaluationForSide(mate('black', 3), 'white')).toEqual({ forPlayer: false, kind: 'mate', moves: 3 });
  });

  it('orders evaluations: faster mates first, being mated later beats sooner', () => {
    const ordered = [mate('white', 1), mate('white', 3), cp(900), cp(0), cp(-900), mate('black', 5), mate('black', 1)];
    const scores = ordered.map((e) => evaluationScore(e, 'white'));
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // Black's view is the exact reverse.
    const black = ordered.map((e) => evaluationScore(e, 'black'));
    expect([...black].sort((a, b) => a - b)).toEqual(black);
  });

  it('formats White-relative evaluations', () => {
    expect(formatEvaluation(cp(123))).toBe('+1.23');
    expect(formatEvaluation(cp(-40))).toBe('-0.40');
    expect(formatEvaluation(cp(0))).toBe('0.00');
    expect(formatEvaluation(mate('white', 3))).toBe('#3');
    expect(formatEvaluation(mate('black', 2))).toBe('#-2');
  });
});

describe('winPercent', () => {
  it('is 50 at equality for both sides', () => {
    expect(winPercent(cp(0), 'white')).toBeCloseTo(50, 10);
    expect(winPercent(cp(0), 'black')).toBeCloseTo(50, 10);
  });

  it('is complementary between the two sides', () => {
    for (const v of [-2500, -300, -35, 0, 12, 180, 900]) {
      expect(winPercent(cp(v), 'white') + winPercent(cp(v), 'black')).toBeCloseTo(100, 10);
    }
  });

  it('increases with the evaluation for White and decreases for Black', () => {
    const values = [-1000, -200, -50, 0, 50, 200, 1000];
    const white = values.map((v) => winPercent(cp(v), 'white'));
    expect([...white].sort((a, b) => a - b)).toEqual(white);
    const black = values.map((v) => winPercent(cp(v), 'black'));
    expect([...black].sort((a, b) => b - a)).toEqual(black);
  });

  it('pins mate to exactly 100 / 0, including an already-checkmated board', () => {
    expect(winPercent(mate('white', 7), 'white')).toBe(100);
    expect(winPercent(mate('white', 7), 'black')).toBe(0);
    expect(winPercent(mate('black', 0), 'white')).toBe(0);
    expect(winPercent(mate('black', 0), 'black')).toBe(100);
  });

  it('stays inside 0–100 and finite for extreme centipawn values', () => {
    for (const v of [-1e9, -10_000, 10_000, 1e9]) {
      const w = winPercent(cp(v), 'white');
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(100);
    }
  });
});

describe('classification policy', () => {
  it('accepts the default policy', () => {
    expect(() => assertValidClassificationPolicy(DEFAULT_MOVE_CLASSIFICATION_POLICY)).not.toThrow();
    expect(DEFAULT_MOVE_CLASSIFICATION_POLICY.version).toBe(MOVE_CLASSIFICATION_VERSION);
  });

  it('rejects thresholds out of order or out of range', () => {
    const p = DEFAULT_MOVE_CLASSIFICATION_POLICY;
    expect(() => assertValidClassificationPolicy({ ...p, mistakeLoss: 4 })).toThrow(/inaccuracyLoss/);
    expect(() => assertValidClassificationPolicy({ ...p, blunderLoss: 9 })).toThrow(/mistakeLoss/);
    expect(() => assertValidClassificationPolicy({ ...p, winningWinPercent: 40 })).toThrow(/winningWinPercent/);
    expect(() => assertValidClassificationPolicy({ ...p, blunderLoss: 120 })).toThrow(/between 0 and 100/);
    expect(() => assertValidClassificationPolicy({ ...p, minDepth: -1 })).toThrow(/minDepth/);
  });
});

describe('classifyMove', () => {
  describe('evidence requirements', () => {
    it('labels the only legal move FORCED without needing any evaluation', () => {
      const result = classifyMove(evidence({ beforeSearched: false, legalMoveCount: 1, linesBefore: [] }));
      expect(result.classification).toBe('FORCED');
      expect(result.reasons).toEqual(['ONLY_LEGAL_MOVE']);
      expect(result.limitedBy).toBeNull();
    });

    it('refuses to classify without a top line before the move', () => {
      expect(classifyMove(evidence({ linesBefore: [] })).limitedBy).toBe('NO_EVALUATION_BEFORE');
      expect(classifyMove(evidence({ beforeSearched: false })).limitedBy).toBe('NO_EVALUATION_BEFORE');
      expect(classifyMove(evidence({ linesBefore: [line(1, null, 'e2e4')] })).limitedBy).toBe(
        'NO_EVALUATION_BEFORE',
      );
    });

    it('refuses to classify on a provisional (bound) score', () => {
      for (const bound of ['lower', 'upper'] as const) {
        const before = classifyMove(evidence({ linesBefore: [line(1, cp(0), 'e2e4', { bound })] }));
        expect(before).toMatchObject({ classification: 'UNCLASSIFIED', limitedBy: 'PROVISIONAL_SCORE' });

        const after = classifyMove(
          evidence({ nextPositionLine: line(1, cp(-900), 'e7e5', { bound }) }),
        );
        expect(after).toMatchObject({ classification: 'UNCLASSIFIED', limitedBy: 'PROVISIONAL_SCORE' });
      }
    });

    it('refuses to classify a search shallower than the policy minimum', () => {
      const shallow = classifyMove(evidence({ linesBefore: [line(1, cp(0), 'e2e4', { depth: 8 })] }));
      expect(shallow.limitedBy).toBe('SHALLOW_SEARCH');
      const shallowAfter = classifyMove(evidence({ nextPositionLine: line(1, cp(-900), 'e7e5', { depth: 8 }) }));
      expect(shallowAfter.limitedBy).toBe('SHALLOW_SEARCH');
    });

    it('does not require depth from a terminal next position', () => {
      const result = classifyMove(
        evidence({
          nextPositionLine: line(1, cp(0), '', { depth: 0 }),
          nextPositionTerminal: true,
        }),
      );
      expect(result.classification).toBe('GOOD');
    });

    it('reports a missing after-evaluation rather than guessing', () => {
      expect(classifyMove(evidence()).limitedBy).toBe('NO_EVALUATION_AFTER');
    });
  });

  describe('best and only moves', () => {
    it('labels the engine top move BEST from the same search', () => {
      const result = classifyMove(evidence({ playedUci: 'E2E4' }));
      expect(result).toMatchObject({
        afterSource: 'ENGINE_BEST',
        classification: 'BEST',
        winPercentLoss: 0,
      });
    });

    it('marks an only move when the second line is far worse', () => {
      const result = classifyMove(
        evidence({ linesBefore: [line(1, cp(100), 'e2e4'), line(2, cp(-300), 'd2d4')], playedUci: 'e2e4' }),
      );
      expect(result.onlyMove).toBe(true);
      expect(result.reasons).toContain('ONLY_MOVE');
    });

    it('does not mark an only move without a second line or with a close one', () => {
      expect(classifyMove(evidence({ playedUci: 'e2e4' })).onlyMove).toBe(false);
      const close = classifyMove(
        evidence({ linesBefore: [line(1, cp(30), 'e2e4'), line(2, cp(20), 'd2d4')], playedUci: 'e2e4' }),
      );
      expect(close.onlyMove).toBe(false);
    });

    it('scores a move matching a lower MultiPV line from that same search', () => {
      const result = classifyMove(
        evidence({
          linesBefore: [line(1, cp(30), 'e2e4'), line(2, cp(26), 'd2d4')],
          // A conflicting next-position score must lose to the same-search one.
          nextPositionLine: line(1, cp(-500), 'e7e5'),
          playedUci: 'd2d4',
        }),
      );
      expect(result).toMatchObject({ afterSource: 'MULTIPV_LINE', classification: 'BEST' });
      expect(result.reasons).toEqual(['WITHIN_BEST_MARGIN']);
    });

    it('never awards BEST for a near-equal score from a different search', () => {
      const result = classifyMove(
        evidence({ linesBefore: [line(1, cp(30), 'e2e4')], nextPositionLine: line(1, cp(29), 'e7e5') }),
      );
      expect(result).toMatchObject({ afterSource: 'NEXT_POSITION', classification: 'GOOD' });
    });

    it('prefers a root-move search over the next position', () => {
      const result = classifyMove(
        evidence({
          nextPositionLine: line(1, cp(0), 'e7e5'),
          rootMoveLine: line(1, cp(-400), 'a2a3'),
        }),
      );
      expect(result.afterSource).toBe('ROOT_MOVE');
      expect(result.classification).toBe('BLUNDER');
    });

    it('treats a played move scored above the best line as no loss (horizon noise)', () => {
      const result = classifyMove(evidence({ nextPositionLine: line(1, cp(80), 'e7e5') }));
      expect(result).toMatchObject({ classification: 'GOOD', winPercentLoss: 0 });
    });
  });

  describe('win% thresholds (equal position, defaults 5 / 10 / 15)', () => {
    it.each([
      [4.99, 'GOOD'],
      [5.01, 'INACCURACY'],
      [9.99, 'INACCURACY'],
      [10.01, 'MISTAKE'],
      [14.99, 'MISTAKE'],
      [15.01, 'BLUNDER'],
      [40, 'BLUNDER'],
    ])('a loss of %s points is %s', (loss, expected) => {
      expect(whiteMove(50, 50 - loss).classification).toBe(expected);
    });

    it('honours a custom policy', () => {
      const strict = { ...DEFAULT_MOVE_CLASSIFICATION_POLICY, blunderLoss: 30, inaccuracyLoss: 2, mistakeLoss: 4 };
      const ev = evidence({ nextPositionLine: line(1, cp(cpForWhiteWin(47)), 'e7e5') });
      expect(classifyMove(ev, strict).classification).toBe('INACCURACY');
      expect(classifyMove(ev).classification).toBe('GOOD');
    });
  });

  describe('position-aware rules', () => {
    it('caps a loss while still clearly winning', () => {
      const result = whiteMove(97, 84); // −13 would be a mistake, but White still wins
      expect(result.classification).toBe('INACCURACY');
      expect(result.reasons).toContain('CAPPED_STILL_WINNING');
    });

    it('calls a won position that stops winning a MISSED_WIN', () => {
      const result = whiteMove(92, 55);
      expect(result.classification).toBe('MISSED_WIN');
      expect(result.reasons).toEqual(['WINNING_POSITION_LOST']);
    });

    it('does not call a small slip from a won position a missed win', () => {
      expect(whiteMove(82, 78).classification).not.toBe('MISSED_WIN');
    });

    it('caps a loss inside an already-lost position', () => {
      const result = whiteMove(15, 2);
      expect(result.classification).toBe('INACCURACY');
      expect(result.reasons).toContain('CAPPED_ALREADY_LOST');
    });

    it('still calls a real collapse from equality a blunder', () => {
      expect(whiteMove(50, 10).classification).toBe('BLUNDER');
    });
  });

  describe('missed draw (needs MultiPV evidence)', () => {
    const drawEvidence = (second: Evaluation | null) =>
      evidence({
        linesBefore: second
          ? [line(1, cp(0), 'e2e4'), line(2, second, 'd2d4')]
          : [line(1, cp(0), 'e2e4')],
        nextPositionLine: line(1, cp(-700), 'e7e5'),
      });

    it('is MISSED_DRAW when the drawing move was the only resource', () => {
      const result = classifyMove(drawEvidence(cp(-600)));
      expect(result.classification).toBe('MISSED_DRAW');
      expect(result.reasons).toEqual(['DRAW_WAS_ONLY_RESOURCE']);
    });

    it('is a plain blunder without a second line', () => {
      expect(classifyMove(drawEvidence(null)).classification).toBe('BLUNDER');
    });

    it('is a plain blunder when other moves also held', () => {
      expect(classifyMove(drawEvidence(cp(-10))).classification).toBe('BLUNDER');
    });

    it('needs the top line to actually be a draw', () => {
      const result = classifyMove(
        evidence({
          linesBefore: [line(1, cp(-150), 'e2e4'), line(2, cp(-700), 'd2d4')],
          nextPositionLine: line(1, cp(-700), 'e7e5'),
        }),
      );
      expect(result.classification).not.toBe('MISSED_DRAW');
    });
  });

  describe('mate transitions', () => {
    it('is MISSED_MATE when a short forced mate is dropped', () => {
      const result = classifyMove(
        evidence({ linesBefore: [line(1, mate('white', 3), 'd1h5')], nextPositionLine: line(1, cp(600), 'e7e5') }),
      );
      expect(result.classification).toBe('MISSED_MATE');
      expect(result.reasons).toEqual(['HAD_FORCED_MATE']);
    });

    it('does not name a long mate as missed', () => {
      const result = classifyMove(
        evidence({ linesBefore: [line(1, mate('white', 12), 'd1h5')], nextPositionLine: line(1, cp(600), 'e7e5') }),
      );
      expect(result.classification).not.toBe('MISSED_MATE');
    });

    it('accepts a slower mate as GOOD', () => {
      const result = classifyMove(
        evidence({ linesBefore: [line(1, mate('white', 2), 'd1h5')], nextPositionLine: line(1, mate('white', 4), 'e7e5') }),
      );
      expect(result).toMatchObject({ classification: 'GOOD', reasons: ['KEPT_FORCED_MATE'], winPercentLoss: 0 });
    });

    it('is BEST when the move keeps the fastest mate', () => {
      const result = classifyMove(
        evidence({ linesBefore: [line(1, mate('white', 2), 'd1h5')], nextPositionLine: line(1, mate('white', 1), 'e7e5') }),
      );
      expect(result).toMatchObject({ classification: 'BEST', reasons: ['WITHIN_BEST_MARGIN'] });
    });

    it('is MATE_ALLOWED when a playable position walks into a short mate', () => {
      const result = classifyMove(evidence({ nextPositionLine: line(1, mate('black', 2), 'd8h4') }));
      expect(result.classification).toBe('MATE_ALLOWED');
      expect(result.winPercentLoss).toBe(50);
    });

    it('records both facts when a mate was missed and one allowed', () => {
      const result = classifyMove(
        evidence({ linesBefore: [line(1, mate('white', 1), 'd1h5')], nextPositionLine: line(1, mate('black', 1), 'd8h4') }),
      );
      expect(result.classification).toBe('MATE_ALLOWED');
      expect(result.reasons).toEqual(['ALLOWED_FORCED_MATE', 'HAD_FORCED_MATE']);
    });

    it('treats a long allowed mate by its win% loss, not by name', () => {
      const result = classifyMove(evidence({ nextPositionLine: line(1, mate('black', 9), 'd8h4') }));
      expect(result.classification).toBe('BLUNDER');
    });

    it('does not blame a player already being mated', () => {
      const result = classifyMove(
        evidence({ linesBefore: [line(1, mate('black', 6), 'e2e4')], nextPositionLine: line(1, mate('black', 2), 'd8h4') }),
      );
      expect(result).toMatchObject({ classification: 'GOOD', reasons: ['ALREADY_BEING_MATED'] });
    });

    it('handles a checkmated next position (mate 0)', () => {
      const result = classifyMove(
        evidence({
          linesBefore: [line(1, cp(20), 'e2e4')],
          nextPositionLine: line(1, mate('black', 0), '', { depth: 0 }),
          nextPositionTerminal: true,
        }),
      );
      expect(result.classification).toBe('MATE_ALLOWED');
    });
  });

  describe('symmetry and determinism', () => {
    const scenarios: Array<[string, MoveEvidence]> = [
      ['best', evidence({ playedUci: 'e2e4' })],
      ['blunder', evidence({ nextPositionLine: line(1, cp(-500), 'e7e5') })],
      ['inaccuracy', evidence({ linesBefore: [line(1, cp(40), 'e2e4')], nextPositionLine: line(1, cp(-20), 'e7e5') })],
      ['missed win', evidence({ linesBefore: [line(1, cp(900), 'e2e4')], nextPositionLine: line(1, cp(50), 'e7e5') })],
      ['still winning', evidence({ linesBefore: [line(1, cp(1200), 'e2e4')], nextPositionLine: line(1, cp(500), 'e7e5') })],
      ['already lost', evidence({ linesBefore: [line(1, cp(-500), 'e2e4')], nextPositionLine: line(1, cp(-1500), 'e7e5') })],
      ['missed mate', evidence({ linesBefore: [line(1, mate('white', 2), 'e2e4')], nextPositionLine: line(1, cp(300), 'e7e5') })],
      ['mate allowed', evidence({ nextPositionLine: line(1, mate('black', 1), 'e7e5') })],
      [
        'missed draw',
        evidence({
          linesBefore: [line(1, cp(0), 'e2e4'), line(2, cp(-800), 'd2d4')],
          nextPositionLine: line(1, cp(-800), 'e7e5'),
        }),
      ],
    ];

    it.each(scenarios)('classifies the colour-mirrored "%s" move identically for Black', (_name, ev) => {
      expect(essence(classifyMove(mirror(ev)))).toEqual(essence(classifyMove(ev)));
    });

    it('returns identical results for identical inputs', () => {
      for (const [, ev] of scenarios) {
        expect(classifyMove(ev)).toEqual(classifyMove(structuredClone(ev)));
      }
    });
  });
});

describe('accuracy', () => {
  it('scores a lossless move ~100 and decreases with the loss', () => {
    expect(moveAccuracyFromLoss(0)).toBeCloseTo(100, 3);
    const losses = [0, 2, 5, 10, 15, 30, 60, 100];
    const values = losses.map(moveAccuracyFromLoss);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('stays within 0–100 for any input', () => {
    for (const loss of [-50, 0, 100, 1000, Number.NaN, Infinity]) {
      const v = moveAccuracyFromLoss(loss);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  const moves = (...losses: Array<number | 'FORCED' | 'UNCLASSIFIED'>) =>
    losses.map((loss) =>
      typeof loss === 'number'
        ? { classification: 'GOOD' as const, winPercentLoss: loss }
        : { classification: loss, winPercentLoss: null },
    );

  it('gives a clean game ~100', () => {
    const result = sideAccuracy(moves(0, 0, 0, 0, 0, 0));
    expect(result.accuracy).toBeCloseTo(100, 0);
    expect(result.formulaVersion).toBe(ACCURACY_FORMULA_VERSION);
  });

  it('lets one blunder pull the score below the plain average', () => {
    const losses = [0, 0, 0, 0, 0, 0, 0, 0, 0, 50];
    const result = sideAccuracy(moves(...losses));
    const plainAverage = losses.map(moveAccuracyFromLoss).reduce((a, b) => a + b) / losses.length;
    expect(result.accuracy).not.toBeNull();
    expect(result.accuracy as number).toBeLessThan(plainAverage);
    expect(result.accuracy as number).toBeGreaterThan(0);
  });

  it('stays inside 0–100 when every move is a total loss', () => {
    const result = sideAccuracy(moves(100, 100, 100, 100, 100));
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.accuracy).toBeLessThanOrEqual(100);
  });

  it('excludes forced moves instead of rewarding them', () => {
    const withForced = sideAccuracy(moves(10, 10, 10, 10, 10, 'FORCED', 'FORCED', 'FORCED'));
    const without = sideAccuracy(moves(10, 10, 10, 10, 10));
    expect(withForced.accuracy).toBe(without.accuracy);
    expect(withForced.forcedMoves).toBe(3);
  });

  it('returns null with a reason when there are too few moves', () => {
    expect(sideAccuracy(moves(0, 0, 0, 0))).toMatchObject({ accuracy: null, insufficientReason: 'TOO_FEW_MOVES' });
  });

  it('returns null with a reason when too much of the game is unclassified', () => {
    const result = sideAccuracy(moves(0, 0, 0, 0, 0, 'UNCLASSIFIED', 'UNCLASSIFIED', 'UNCLASSIFIED'));
    expect(result).toMatchObject({ accuracy: null, insufficientReason: 'LOW_COVERAGE', unclassifiedMoves: 3 });
  });

  it('is deterministic', () => {
    const input = moves(3, 0, 12, 7, 0, 25, 1);
    expect(sideAccuracy(input)).toEqual(sideAccuracy(input));
    expect(DEFAULT_ACCURACY_POLICY.version).toBe(ACCURACY_FORMULA_VERSION);
  });
});

describe('classifyGame', () => {
  // Fool's mate: 1.f3 e5 2.g4?? Qh4#, with hand-written engine output
  // (f3: +0.30 → −0.60 for White, an 8-point loss).
  const position = (ply: number, side: 'white' | 'black', lines: EngineLine[], over: object = {}) => ({
    error: null,
    fen: `fen-${ply}`,
    legalMoveCount: 20,
    lines,
    ply,
    sideToMove: side,
    status: 'ANALYSED' as const,
    terminal: null,
    ...over,
  });
  const game = (over: Partial<GameEngineAnalysis> = {}): GameEngineAnalysis => ({
    complete: true,
    budgetExhausted: false,
    config: {
      budgetMs: 60_000,
      concurrency: 1,
      depth: 'STANDARD',
      maxDepth: 18,
      movetimeMs: 800,
      multiPv: 2,
      rootMoveSearch: false,
    },
    conventionVersion: 'white-relative-v1',
    engine: 'Stockfish 17.1',
    moves: [
      { ply: 0, rootMoveLine: null, san: 'f3', side: 'white', uci: 'f2f3' },
      { ply: 1, rootMoveLine: null, san: 'e5', side: 'black', uci: 'e7e5' },
      { ply: 2, rootMoveLine: null, san: 'g4', side: 'white', uci: 'g2g4' },
      { ply: 3, rootMoveLine: null, san: 'Qh4#', side: 'black', uci: 'd8h4' },
    ],
    positions: [
      position(0, 'white', [line(1, cp(30), 'e2e4')]),
      position(1, 'black', [line(1, cp(-60), 'e7e5')]),
      position(2, 'white', [line(1, cp(-70), 'b1c3')]),
      position(3, 'black', [line(1, mate('black', 1), 'd8h4')]),
      position(4, 'white', [line(1, mate('black', 0), '', { depth: 0 })], {
        legalMoveCount: 0,
        status: 'TERMINAL',
        terminal: 'CHECKMATE',
      }),
    ],
    startFen: 'fen-0',
    truncated: null,
    ...over,
  });

  it('classifies every move and counts them per side', () => {
    const result = classifyGame(game());
    expect(result.moves.map((m) => [m.san, m.classification])).toEqual([
      ['f3', 'INACCURACY'],
      ['e5', 'BEST'],
      ['g4', 'MATE_ALLOWED'],
      ['Qh4#', 'BEST'],
    ]);
    expect(result.counts.white.MATE_ALLOWED).toBe(1);
    expect(result.counts.black.BEST).toBe(2);
    expect(result.limited).toBe(false);
    expect(result.classificationVersion).toBe(MOVE_CLASSIFICATION_VERSION);
    // Two moves each is far below the minimum: no accuracy is invented.
    expect(result.accuracy.white).toMatchObject({ accuracy: null, insufficientReason: 'TOO_FEW_MOVES' });
  });

  it('flags a game whose engine data is incomplete or truncated', () => {
    expect(classifyGame(game({ complete: false })).limited).toBe(true);
    expect(classifyGame(game({ truncated: { ply: 4, reason: 'x' } })).limited).toBe(true);
  });

  it('leaves moves around a failed position unclassified', () => {
    const g = game();
    g.positions[1] = { ...g.positions[1], error: 'crash', lines: [], status: 'FAILED' };
    const result = classifyGame({ ...g, complete: false });
    // f3's score had to come from the failed position after it.
    expect(result.moves[0]).toMatchObject({ classification: 'UNCLASSIFIED', limitedBy: 'NO_EVALUATION_AFTER' });
    // e5 is played FROM the failed position.
    expect(result.moves[1]).toMatchObject({ classification: 'UNCLASSIFIED', limitedBy: 'NO_EVALUATION_BEFORE' });
    // g4 is untouched.
    expect(result.moves[2].classification).toBe('MATE_ALLOWED');
  });

  it('refuses an invalid policy', () => {
    expect(() => classifyGame(game(), { ...DEFAULT_MOVE_CLASSIFICATION_POLICY, mistakeLoss: 1 })).toThrow();
  });
});
