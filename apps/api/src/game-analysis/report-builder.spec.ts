import {
  explainMove,
  gamePhases,
  parseClockComment,
  parseTimeControl,
  splitPgnGames,
  type ClassificationReason,
} from '@nexa-chess/types';
import { clockStats, gameFingerprint, gameMovesFromPgn, resultFor } from './report-builder';

const PGN_WITH_CLOCKS = `[Event "Rated blitz game"]
[White "alice"]
[Black "bob"]
[Result "1-0"]
[TimeControl "180+2"]

1. e4 { [%clk 0:03:00] } 1... e5 { [%clk 0:02:58.5] } 2. Nf3 { [%clk 0:02:59] } 1-0`;

describe('splitPgnGames', () => {
  it('splits a multi-game file at each header block that follows movetext', () => {
    const text = `${PGN_WITH_CLOCKS}\n\n[Event "Two"]\n[White "x"]\n[Black "y"]\n\n1. d4 d5 *\n\n[Event "Three"]\n\n1. c4 *`;
    const games = splitPgnGames(text);
    expect(games).toHaveLength(3);
    expect(games[1]).toContain('[Event "Two"]');
    expect(games[2]).toContain('1. c4');
  });

  it('normalises BOM and CRLF, and drops empty input', () => {
    expect(splitPgnGames('﻿[Event "A"]\r\n\r\n1. e4 *\r\n')).toEqual(['[Event "A"]\n\n1. e4 *']);
    expect(splitPgnGames('  \n\n ')).toEqual([]);
  });

  it('stops at the game limit', () => {
    const many = Array.from({ length: 5 }, (_, i) => `[Event "${i}"]\n\n1. e4 *`).join('\n\n');
    expect(splitPgnGames(many, 2)).toHaveLength(2);
  });
});

describe('PGN clocks and time controls', () => {
  it('reads [%clk] comments in milliseconds', () => {
    expect(parseClockComment('[%clk 0:03:00]')).toBe(180_000);
    expect(parseClockComment(' [%clk 1:02:03.4] ')).toBe(3_723_400);
    expect(parseClockComment('a plain comment')).toBeNull();
    expect(parseClockComment(undefined)).toBeNull();
  });

  it('parses base+increment time controls only', () => {
    expect(parseTimeControl('180+2')).toEqual({ incrementMs: 2000, initialMs: 180_000 });
    expect(parseTimeControl('600')).toEqual({ incrementMs: 0, initialMs: 600_000 });
    expect(parseTimeControl('-')).toBeNull();
    expect(parseTimeControl('1/259200')).toBeNull();
  });

  it('extracts the mainline and per-move clocks from a stored PGN', () => {
    expect(gameMovesFromPgn(PGN_WITH_CLOCKS)).toEqual({
      clocksMs: [180_000, 178_500, 179_000],
      movesUci: ['e2e4', 'e7e5', 'g1f3'],
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    });
  });
});

describe('gameFingerprint', () => {
  it('is stable for the same moves and changes when the mainline changes', () => {
    const a = gameFingerprint({ movesUci: ['e2e4', 'e7e5'], startFen: 'x' });
    expect(gameFingerprint({ movesUci: ['e2e4', 'e7e5'], startFen: 'x' })).toBe(a);
    expect(gameFingerprint({ movesUci: ['e2e4', 'c7c5'], startFen: 'x' })).not.toBe(a);
    expect(gameFingerprint({ movesUci: ['e2e4', 'e7e5'], startFen: 'y' })).not.toBe(a);
  });
});

describe('gamePhases', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const DEVELOPED = 'r2q1rk1/ppp2ppp/2n2n2/3pp3/1b1PP3/2NBBN2/PPPQ1PPP/R4RK1 w - - 0 9';
  const ENDGAME = '8/5k2/8/3r4/8/2B5/5K2/3R4 w - - 0 50';

  it('starts in the opening and moves on when pieces leave the back rank', () => {
    expect(gamePhases([START, DEVELOPED])).toEqual(['OPENING', 'MIDDLEGAME']);
  });

  it('enters the endgame when few pieces are left, and never goes back', () => {
    expect(gamePhases([START, ENDGAME, START])).toEqual(['OPENING', 'ENDGAME', 'ENDGAME']);
  });

  it('ends the opening at the ply cap even with an undeveloped board', () => {
    const fens = Array.from({ length: 42 }, () => START);
    const phases = gamePhases(fens);
    expect(phases[39]).toBe('OPENING');
    expect(phases[40]).toBe('MIDDLEGAME');
  });
});

describe('clockStats', () => {
  const move = (clockMs: number | null, classification = 'GOOD') =>
    ({ classification, clockMs }) as Parameters<typeof clockStats>[0][number];

  it('is null when clocks cover too few of the moves', () => {
    expect(clockStats([move(1000), move(null), move(null)], 180_000)).toBeNull();
    expect(clockStats([], 180_000)).toBeNull();
  });

  it('separates errors made low on time from the rest', () => {
    const stats = clockStats(
      [move(170_000), move(150_000, 'MISTAKE'), move(12_000, 'BLUNDER'), move(9_000), move(8_000, 'MISSED_WIN')],
      180_000,
    );
    // Low = below max(30s, 10% of 3 min) = 30s.
    expect(stats).toEqual({ clockedMoves: 5, lowTimeErrors: 2, lowTimeMoves: 3, otherErrors: 1 });
  });
});

describe('resultFor', () => {
  it('reads the result from each side', () => {
    expect(resultFor('1-0', 'white')).toBe('WIN');
    expect(resultFor('1-0', 'black')).toBe('LOSS');
    expect(resultFor('0-1', 'black')).toBe('WIN');
    expect(resultFor('1/2-1/2', 'white')).toBe('DRAW');
    expect(resultFor('*', 'white')).toBe('UNKNOWN');
  });
});

describe('explainMove', () => {
  const base = { limitedBy: null, onlyMove: false, reasons: [] as ClassificationReason[], winPercentLoss: 22 };

  it('explains an unclassified move with its reason, never a judgement', () => {
    expect(explainMove({ ...base, classification: 'UNCLASSIFIED', limitedBy: 'PROVISIONAL_SCORE' }, null)).toMatch(/provisional/);
  });

  it('names the stronger move and the cost', () => {
    const text = explainMove({ ...base, classification: 'BLUNDER' }, 'Nf3');
    expect(text).toContain('Nf3 was stronger');
    expect(text).toContain('22 points');
  });

  it('tells a still-winning inaccuracy apart from a plain one', () => {
    expect(explainMove({ ...base, classification: 'INACCURACY', reasons: ['CAPPED_STILL_WINNING'] }, 'Qd2')).toMatch(/still winning/);
  });
});
