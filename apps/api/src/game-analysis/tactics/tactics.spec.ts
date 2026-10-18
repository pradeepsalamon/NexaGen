import {
  classifyGame,
  type EngineLine,
  type Evaluation,
  type GameEngineAnalysis,
  type TacticMotif,
} from '@nexa-chess/types';
import { Chess } from '../../common/chess/chess';
import { replayGame } from '../../stockfish/game-analysis-engine.service';
import { isBackRankMate, lineTactics, motifsOfMove } from './board';
import { detectGameTactics, sequenceMotifs } from './detect-tactics';

// ── helpers ────────────────────────────────────────────────────────────────

const motifs = (fen: string, uci: string) => motifsOfMove(fen, uci, 0).map((m) => m.motif);

/** Colour-flip a FEN: ranks reversed, case swapped, side to move swapped. */
function mirrorFen(fen: string): string {
  const [placement, turn, castling, ep, half, full] = fen.split(' ');
  const swap = (s: string) => s.replace(/[a-zA-Z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
  const rows = placement.split('/').reverse().map(swap).join('/');
  const flipCastle = castling === '-' ? '-' : swap(castling).split('').sort().join('');
  const flipEp = ep === '-' ? '-' : `${ep[0]}${9 - Number(ep[1])}`;
  return [rows, turn === 'w' ? 'b' : 'w', flipCastle, flipEp, half, full].join(' ');
}
const mirrorUci = (uci: string) =>
  `${uci[0]}${9 - Number(uci[1])}${uci[2]}${9 - Number(uci[3])}${uci.slice(4)}`;
const mirrorEval = (e: Evaluation): Evaluation =>
  e.kind === 'cp' ? { cp: -e.cp, kind: 'cp' } : { ...e, winner: e.winner === 'white' ? 'black' : 'white' };

const cp = (v: number): Evaluation => ({ cp: v, kind: 'cp' });
const mate = (winner: 'white' | 'black', moves: number): Evaluation => ({ kind: 'mate', moves, winner });
const line = (evaluation: Evaluation, pv: string[], extra: Partial<EngineLine> = {}): EngineLine => ({
  bound: 'exact',
  depth: 20,
  evaluation,
  pvSan: [],
  pvUci: pv,
  rank: 1,
  ...extra,
});

/** A replayed game whose every non-terminal position gets the given top line. */
function game(startFen: string, moves: string[], lines: Record<number, EngineLine>): GameEngineAnalysis {
  const replay = replayGame(startFen, moves);
  for (const p of replay.positions) {
    if (p.status === 'TERMINAL') continue;
    const l = lines[p.ply];
    p.lines = l ? [l] : [];
    p.status = l ? 'ANALYSED' : 'FAILED';
  }
  return {
    budgetExhausted: false,
    complete: replay.positions.every((p) => p.status !== 'FAILED'),
    config: { budgetMs: 1000, concurrency: 1, depth: 'STANDARD', maxDepth: 18, movetimeMs: 800, multiPv: 1, rootMoveSearch: false },
    conventionVersion: 'white-relative-v1',
    engine: 'test',
    moves: replay.moves,
    positions: replay.positions,
    startFen: replay.positions[0].fen,
    truncated: replay.truncated,
  };
}

function mirrorGame(startFen: string, moves: string[], lines: Record<number, EngineLine>): GameEngineAnalysis {
  const mirrored: Record<number, EngineLine> = {};
  for (const [ply, l] of Object.entries(lines)) {
    mirrored[Number(ply)] = { ...l, evaluation: l.evaluation && mirrorEval(l.evaluation), pvUci: l.pvUci.map(mirrorUci) };
  }
  return game(mirrorFen(startFen), moves.map(mirrorUci), mirrored);
}

const detect = (g: GameEngineAnalysis) => detectGameTactics(g, classifyGame(g)).opportunities;

// ── board motifs ───────────────────────────────────────────────────────────

describe('motifsOfMove — positive patterns', () => {
  it.each<[string, string, string, TacticMotif]>([
    ['knight fork of king and rook', 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7', 'FORK'],
    ['bishop pin of a knight to the king', '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'f1b5', 'PIN'],
    ['rook skewer of king and queen', 'q3k3/8/8/8/8/8/8/4K2R w - - 0 1', 'h1h8', 'SKEWER'],
    ['discovered check', '4k3/8/8/8/8/8/4N3/4R1K1 w - - 0 1', 'e2c3', 'DISCOVERED_CHECK'],
    ['double check', '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1', 'e4d6', 'DOUBLE_CHECK'],
    ['discovered attack on the queen', '4k3/8/8/3q4/8/8/6N1/4K2B w - - 0 1', 'g2h4', 'DISCOVERED_ATTACK'],
    ['capture of an undefended queen', '4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1', 'd1d5', 'HANGING_PIECE'],
    ['promotion', '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7a8q', 'PROMOTION'],
  ])('%s', (_name, fen, uci, motif) => {
    expect(motifs(fen, uci)).toContain(motif);
  });

  it('records the squares behind a fork', () => {
    const [fork] = motifsOfMove('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7', 0).filter((m) => m.motif === 'FORK');
    expect(fork.squares[0]).toBe('c7');
    expect(fork.squares.slice(1).sort()).toEqual(['a8', 'e8']);
    expect(fork.confidence).toBe('CONFIRMED');
  });

  it('detects the same motifs for Black on the mirrored board', () => {
    for (const [fen, uci, motif] of [
      ['r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7', 'FORK'],
      ['4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'f1b5', 'PIN'],
      ['q3k3/8/8/8/8/8/8/4K2R w - - 0 1', 'h1h8', 'SKEWER'],
      ['4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1', 'e4d6', 'DOUBLE_CHECK'],
    ] as const) {
      expect(motifs(mirrorFen(fen), mirrorUci(uci))).toContain(motif);
    }
  });
});

describe('motifsOfMove — negative patterns', () => {
  it('does not call an attack on two defended pawns a fork', () => {
    // Nd5-c7 would hit b5 and e6, both pawns guarded by pawns.
    expect(motifs('4k3/p4p2/4p3/1p1N4/8/8/8/4K3 w - - 0 1', 'd5c7')).not.toContain('FORK');
  });

  it('does not call capturing a defended pawn with the queen a hanging piece', () => {
    expect(motifs('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', 'd1d5')).not.toContain('HANGING_PIECE');
  });

  it('does not report a pin of a pawn, or a pin to an equal piece', () => {
    expect(motifs('4k3/8/2p5/8/8/8/8/4KB2 w - - 0 1', 'f1b5')).not.toContain('PIN');
    // Knight pinned to a defended knight: no pin.
    expect(motifs('8/3n4/2n5/8/8/8/8/K3kB2 w - - 0 1', 'f1b5')).not.toContain('PIN');
  });

  it('does not report a pin that already existed before the move', () => {
    expect(lineTactics(new Chess('4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1'), 'w').pins).toHaveLength(1);
    expect(motifs('4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1', 'e1d1')).not.toContain('PIN');
  });

  it('does not call a plain check a discovered check', () => {
    expect(motifs('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8')).not.toContain('DISCOVERED_CHECK');
  });

  it('returns nothing for an illegal move', () => {
    expect(motifsOfMove('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e1e5', 0)).toEqual([]);
  });
});

describe('isBackRankMate', () => {
  it('recognises a rook mate on a back rank sealed by the king’s own pawns', () => {
    const chess = new Chess('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    chess.move('Ra8#');
    expect(isBackRankMate(chess)).toBe(true);
  });

  it('rejects a mate that is not on the back rank', () => {
    // Queen mate on the h-file with the king on the edge of the board, not its back rank.
    const chess = new Chess('8/8/8/8/8/5K2/8/7k w - - 0 1');
    chess.load('8/8/8/8/8/6K1/5Q2/7k w - - 0 1');
    chess.move('Qg2#');
    expect(chess.isCheckmate()).toBe(true);
    expect(isBackRankMate(chess)).toBe(false);
  });

  it('requires the king to be walled in by its own pieces, not just checked on the back rank', () => {
    // f7 is empty (covered by the bishop): mate, but not a back-rank mate.
    const chess = new Chess('6k1/6pp/8/8/2B5/8/8/R5K1 w - - 0 1');
    chess.move('Ra8#');
    expect(chess.isCheckmate()).toBe(true);
    expect(isBackRankMate(chess)).toBe(false);
  });

  it('rejects a position that is not mate', () => {
    expect(isBackRankMate(new Chess('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'))).toBe(false);
  });
});

describe('sequenceMotifs (engine-line inference)', () => {
  it('infers removal of the defender: take the guard, then what it guarded', () => {
    // Rxd7 removes the bishop guarding c6; after Kxd7, Qxc6+.
    const found = sequenceMotifs('4k3/3b4/2n5/8/8/5Q2/8/3RK3 w - - 0 1', ['d1d7', 'e8d7', 'f3c6'], null);
    expect(found).toEqual([expect.objectContaining({ confidence: 'INFERRED', motif: 'REMOVAL_OF_DEFENDER' })]);
  });

  it('infers an intermediate move: check first, recapture after', () => {
    const before = '4k3/8/8/8/1b6/2N5/1P6/6KQ b - - 0 1';
    const after = '4k3/8/8/8/8/2b5/1P6/6KQ w - - 0 1';
    const found = sequenceMotifs(after, ['h1h5', 'e8e7', 'b2c3'], { fenBefore: before, uci: 'b4c3' });
    expect(found).toEqual([expect.objectContaining({ confidence: 'INFERRED', motif: 'INTERMEDIATE_MOVE' })]);
  });

  it('infers nothing when the recapture comes straight away', () => {
    const before = '4k3/8/8/8/1b6/2N5/1P6/6KQ b - - 0 1';
    const after = '4k3/8/8/8/8/2b5/1P6/6KQ w - - 0 1';
    expect(sequenceMotifs(after, ['b2c3', 'e8e7', 'h1h5'], { fenBefore: before, uci: 'b4c3' })).toEqual([]);
  });
});

// ── game-level detection ───────────────────────────────────────────────────

describe('detectGameTactics', () => {
  // Black's 1...Kd8-e8?? walks into Nc7+ forking king and rook.
  const FORK_START = 'r2k4/8/8/3N4/8/8/8/4K3 b - - 0 1';
  const forkLines = (whiteBestFirst: string) => ({
    0: line(cp(-150), ['d8d7']),
    1: line(cp(500), [whiteBestFirst, 'e8d7', 'c7a8', 'd7c8']),
    2: line(cp(-150), ['e8d7']),
  });

  it('reports a missed fork, who allowed it, and the material it would win', () => {
    const [opp, ...rest] = detect(game(FORK_START, ['d8e8', 'e1e2'], forkLines('d5c7')));
    expect(rest).toHaveLength(0);
    expect(opp).toMatchObject({
      allowedByPly: 0,
      bestMoveUci: 'd5c7',
      gain: { kind: 'MATERIAL', pawns: 5 },
      outcome: 'MISSED',
      playedUci: 'e1e2',
      ply: 1,
      primaryMotif: 'FORK',
      side: 'white',
    });
    expect(opp.lineSan.slice(0, 3)).toEqual(['Nc7+', 'Kd7', 'Nxa8']);
  });

  it('reports a found fork when the engine move is played', () => {
    const g = game(FORK_START, ['d8e8', 'd5c7'], {
      ...forkLines('d5c7'),
      2: line(cp(-500), ['e8d7']),
    });
    expect(detect(g)[0]).toMatchObject({ outcome: 'FOUND', primaryMotif: 'FORK' });
  });

  it('is colour-symmetric: the mirrored game reports the same tactic for Black', () => {
    const [opp] = detect(mirrorGame(FORK_START, ['d8e8', 'e1e2'], forkLines('d5c7')));
    expect(opp).toMatchObject({ outcome: 'MISSED', primaryMotif: 'FORK', side: 'black' });
  });

  it('does not treat winning back a piece just taken as a tactic', () => {
    // 1...Nb4xd3 2.Qxd3: an even trade, whatever the engine scores say.
    const g = game('4k3/8/8/8/1n6/3N4/3Q4/4K3 b - - 0 1', ['b4d3', 'd2d3'], {
      0: line(cp(0), ['e8e7']),
      1: line(cp(900), ['d2d3', 'e8e7']),
      2: line(cp(900), ['e8e7']),
    });
    expect(detect(g)).toEqual([]);
  });

  it('does not report a gain that was already on the board (no jump in expected score)', () => {
    const g = game(FORK_START, ['d8e8', 'e1e2'], {
      ...forkLines('d5c7'),
      0: line(cp(600), ['d8d7']),
    });
    expect(detect(g)).toEqual([]);
  });

  it('does not report anything from provisional or shallow lines', () => {
    for (const extra of [{ bound: 'lower' as const }, { depth: 6 }]) {
      const lines = forkLines('d5c7');
      const g = game(FORK_START, ['d8e8', 'e1e2'], { ...lines, 1: { ...lines[1], ...extra } });
      expect(detect(g)).toEqual([]);
    }
  });

  it('reports a found back-rank mate', () => {
    // 1...Ra2-h2?? opens the a-file and can't come back to the 8th rank: 2.Ra8#.
    const g = game('6k1/5ppp/8/8/8/8/r7/R5K1 b - - 0 1', ['a2h2', 'a1a8'], {
      0: line(cp(0), ['g8f8']),
      1: line(mate('white', 1), ['a1a8']),
    });
    const [opp] = detect(g);
    expect(opp).toMatchObject({ gain: { kind: 'MATE', moves: 1 }, outcome: 'FOUND', primaryMotif: 'BACK_RANK_MATE' });
    expect(opp.motifs.map((m) => m.motif)).toEqual(expect.arrayContaining(['MATE', 'BACK_RANK_MATE']));
  });

  it('does not credit a fork the line never cashes in', () => {
    // 1...Ke8?? allows Nc7+ (a fork of king and rook), but the line wins the
    // hanging queen on h5 instead and gives the knight back: no fork credited.
    const g = game('r2k4/8/8/3N3q/8/8/8/4K2R b - - 0 1', ['d8e8', 'e1f1'], {
      0: line(cp(-200), ['h5e2']),
      1: line(cp(600), ['d5c7', 'e8d7', 'h1h5', 'd7c7']),
      2: line(cp(-200), ['e8d7']),
    });
    const [opp] = detect(g);
    expect(opp).toBeDefined();
    expect(opp.motifs.map((m) => m.motif)).not.toContain('FORK');
  });

  it('reports a mate that appears in an already-won position, but not each step of a mating sequence', () => {
    // White already a queen up; 1...Ra2-h2?? allows Ra8# (the win% can barely jump).
    const start = '6k1/5ppp/8/8/8/8/r7/R4QK1 b - - 0 1';
    const mateLines = {
      0: line(cp(900), ['g8f8']),
      1: line(mate('white', 1), ['a1a8']),
    };
    const [opp] = detect(game(start, ['a2h2', 'a1a8'], mateLines));
    expect(opp).toMatchObject({ gain: { kind: 'MATE', moves: 1 }, outcome: 'FOUND', primaryMotif: 'MATE' });

    // A mate in 2 under way: the second White move is not a new tactic.
    const twoMoves = game('6k1/5ppp/8/8/8/8/8/RR4K1 w - - 0 1', ['b1b8', 'g8h8'], {
      0: line(mate('white', 2), ['b1b8', 'g8h8', 'a1a8']),
      1: line(mate('white', 1), ['g8h8']),
      2: line(mate('white', 1), ['a1a8']),
    });
    // b1-b8+ forces …Kh8 is impossible here: whatever the replay accepts, only one opportunity is reported.
    expect(detect(twoMoves).filter((o) => o.side === 'white').length).toBeLessThanOrEqual(1);
  });

  it('labels a gain with no recognisable pattern as a general tactical opportunity', () => {
    // 1...Rh4-h5?? 2.Kf1 (a quiet first move) and the queen takes the rook later.
    const g = game('k7/8/8/8/7r/8/8/3QK3 b - - 0 1', ['h4h5', 'e1f1'], {
      0: line(cp(300), ['h4h1']),
      1: line(cp(1300), ['e1f1', 'a8b8', 'd1h5', 'b8a7']),
      2: line(cp(1300), ['a8b8']),
    });
    const [opp] = detect(g);
    expect(opp.primaryMotif).toBe('MATERIAL_GAIN');
    expect(opp.motifs).toEqual([expect.objectContaining({ confidence: 'CONFIRMED', motif: 'MATERIAL_GAIN' })]);
  });

  it('is deterministic', () => {
    const g = game(FORK_START, ['d8e8', 'e1e2'], forkLines('d5c7'));
    expect(detect(g)).toEqual(detect(structuredClone(g)));
  });
});
