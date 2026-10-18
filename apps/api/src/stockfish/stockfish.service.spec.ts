import {
  normalizeEngineFen,
  parseUciInfoLine,
  rawLines,
  searchDepthFor,
  toEngineLine,
  uciLineToSan,
  type RawLine,
} from './stockfish.service';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const emptyAcc = () => ({
  evaluation: null as number | null,
  mate: null as number | null,
  bestMove: '',
  depth: 0,
  pv: [] as string[],
});

describe('parseUciInfoLine', () => {
  it('reads a centipawn score as pawns and clears mate', () => {
    const acc = parseUciInfoLine(
      'info depth 20 seldepth 28 score cp 34 nodes 1 pv e2e4 e7e5',
      emptyAcc(),
    );
    expect(acc.evaluation).toBeCloseTo(0.34);
    expect(acc.mate).toBeNull();
    expect(acc.depth).toBe(20);
  });

  it('reads a mate score and clears the cp evaluation', () => {
    const acc = parseUciInfoLine('info depth 12 score mate -3 pv h5f7', emptyAcc());
    expect(acc.mate).toBe(-3);
    expect(acc.evaluation).toBeNull();
  });

  it('captures the principal variation in order', () => {
    const acc = parseUciInfoLine(
      'info depth 15 score cp 10 pv e2e4 e7e5 g1f3 b8c6',
      emptyAcc(),
    );
    expect(acc.pv).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  });

  it('ignores non-info lines', () => {
    const acc = emptyAcc();
    expect(parseUciInfoLine('bestmove e2e4 ponder e7e5', acc)).toBe(acc);
    expect(acc.depth).toBe(0);
  });
});

describe('uciLineToSan', () => {
  it('converts a UCI line to SAN from the given position', () => {
    expect(uciLineToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('keeps a token it cannot replay as raw UCI', () => {
    expect(uciLineToSan(START_FEN, ['e2e4', 'a1a8'])).toEqual(['e4', 'a1a8']);
  });

  it('returns the input untouched when the FEN is invalid', () => {
    expect(uciLineToSan('garbage', ['e2e4'])).toEqual(['e2e4']);
  });

  it('handles promotion moves', () => {
    expect(uciLineToSan('8/P6k/8/8/8/8/7K/8 w - - 0 1', ['a7a8q'])).toEqual(['a8=Q']);
  });
});

describe('searchDepthFor', () => {
  it('stops a weakened engine one ply past its skill level', () => {
    expect(searchDepthFor(0, 20)).toBe(1);
    expect(searchDepthFor(5, 20)).toBe(6);
    expect(searchDepthFor(19, 0)).toBe(20);
  });

  it('clamps and rounds the skill level', () => {
    expect(searchDepthFor(-3, 0)).toBe(1);
    expect(searchDepthFor(4.6, 0)).toBe(6);
  });

  it('falls back to the analysis cap at full strength', () => {
    expect(searchDepthFor(20, 18)).toBe(18);
    expect(searchDepthFor(undefined, 18)).toBe(18);
    expect(searchDepthFor(undefined, 0)).toBeUndefined();
  });
});

describe('normalizeEngineFen', () => {
  it('passes the start position through unchanged', () => {
    expect(normalizeEngineFen(START_FEN)).toEqual({ ok: true, fen: START_FEN });
  });

  it('drops castling rights the pieces cannot back', () => {
    // Set-up position: kings on their squares but no rooks.
    const out = normalizeEngineFen('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1');
    expect(out).toEqual({ ok: true, fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' });
  });

  it('drops an en passant square with no pawn behind it', () => {
    const out = normalizeEngineFen('4k3/8/8/8/8/8/8/4K3 w - e6 0 1');
    expect(out).toEqual({ ok: true, fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' });
  });

  it('rejects the side not to move being in check', () => {
    // White rook gives check to the black king, but it is White to move.
    const out = normalizeEngineFen('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1');
    expect(out.ok).toBe(false);
  });

  it('rejects a pawn on the back rank', () => {
    const out = normalizeEngineFen('P3k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(out.ok).toBe(false);
  });
});

describe('parseUciInfoLine — provisional scores and MultiPV', () => {
  const acc = (multiPv = 1) => ({
    ...emptyAcc(),
    ...(multiPv > 1 ? { lines: [] as RawLine[] } : {}),
  });

  it('marks a lower/upper bound score as provisional when it is all there is', () => {
    const lower = parseUciInfoLine('info depth 14 score cp 50 lowerbound pv e2e4', acc());
    expect(lower).toMatchObject({ bound: 'lower', evaluation: 0.5 });
    const upper = parseUciInfoLine('info depth 14 score mate 3 upperbound pv e2e4', acc());
    expect(upper).toMatchObject({ bound: 'upper', mate: 3 });
  });

  it('never lets a bound line overwrite an exact score or its PV', () => {
    const a = acc();
    parseUciInfoLine('info depth 15 score cp 30 pv e2e4 e7e5', a);
    parseUciInfoLine('info depth 16 score cp 95 lowerbound pv d2d4', a);
    expect(a).toMatchObject({ bound: 'exact', evaluation: 0.3, pv: ['e2e4', 'e7e5'], scoreDepth: 15 });
    // The search depth still advances for the panel.
    expect(a.depth).toBe(16);
  });

  it('lets a later exact score replace a provisional one', () => {
    const a = acc();
    parseUciInfoLine('info depth 16 score cp 95 lowerbound pv d2d4', a);
    parseUciInfoLine('info depth 16 score cp 41 pv e2e4', a);
    expect(a).toMatchObject({ bound: 'exact', evaluation: 0.41, pv: ['e2e4'], scoreDepth: 16 });
  });

  it('ignores info string lines', () => {
    const a = acc();
    parseUciInfoLine('info string NNUE evaluation using nn-1c0000000000.nnue score', a);
    expect(a).toEqual(acc());
  });

  it('collects every MultiPV line by rank and keeps line 1 as the top-level result', () => {
    const a = acc(3);
    parseUciInfoLine('info depth 18 multipv 1 score cp 40 pv e2e4 e7e5', a);
    parseUciInfoLine('info depth 18 multipv 3 score cp -10 pv g1f3', a);
    parseUciInfoLine('info depth 18 multipv 2 score cp 25 pv d2d4', a);
    expect(a.evaluation).toBeCloseTo(0.4);
    expect(a.pv).toEqual(['e2e4', 'e7e5']);
    expect(a.lines?.map((l) => [l.rank, l.evaluation, l.pv[0]])).toEqual([
      [1, 0.4, 'e2e4'],
      [2, 0.25, 'd2d4'],
      [3, -0.1, 'g1f3'],
    ]);
  });

  it('keeps an exact MultiPV line when a bound line for the same rank follows', () => {
    const a = acc(2);
    parseUciInfoLine('info depth 18 multipv 2 score cp 25 pv d2d4', a);
    parseUciInfoLine('info depth 19 multipv 2 score cp 60 upperbound pv c2c4', a);
    expect(a.lines?.[0]).toMatchObject({ bound: 'exact', depth: 18, evaluation: 0.25, pv: ['d2d4'], rank: 2 });
  });

  it('does not collect lines when MultiPV was not asked for (existing callers)', () => {
    const a = acc();
    parseUciInfoLine('info depth 18 multipv 1 score cp 40 pv e2e4', a);
    expect('lines' in a).toBe(false);
  });
});

describe('toEngineLine / rawLines', () => {
  const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

  it('converts a side-to-move score to White-relative with SAN', () => {
    const line = toEngineLine(BLACK_TO_MOVE, {
      bound: 'exact',
      depth: 20,
      evaluation: 0.35,
      mate: null,
      pv: ['e7e5', 'g1f3'],
      rank: 1,
    });
    expect(line).toEqual({
      bound: 'exact',
      depth: 20,
      evaluation: { cp: -35, kind: 'cp' },
      pvSan: ['e5', 'Nf3'],
      pvUci: ['e7e5', 'g1f3'],
      rank: 1,
    });
  });

  it('converts a mate for the side to move into a winner', () => {
    const line = toEngineLine(BLACK_TO_MOVE, { bound: 'exact', depth: 9, evaluation: null, mate: 2, pv: [], rank: 1 });
    expect(line.evaluation).toEqual({ kind: 'mate', moves: 2, winner: 'black' });
  });

  it('builds a single line from a non-MultiPV result, falling back to bestmove', () => {
    expect(
      rawLines({ bestMove: 'e2e4', depth: 12, evaluation: 0.2, mate: null, pv: [], scoreDepth: 11 }),
    ).toEqual([{ bound: 'exact', depth: 11, evaluation: 0.2, mate: null, pv: ['e2e4'], rank: 1 }]);
    expect(rawLines({ bestMove: '', depth: 0, evaluation: null, mate: null, pv: [] })).toEqual([]);
  });
});
