import { parseUciInfoLine, uciLineToSan } from './stockfish.service';

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
