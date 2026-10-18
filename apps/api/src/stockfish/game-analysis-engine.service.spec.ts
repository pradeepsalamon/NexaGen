import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { classifyGame, GAME_ANALYSIS_PRESETS, type EngineLine, type Evaluation } from '@nexa-chess/types';
import {
  GameAnalysisEngineService,
  MAX_GAME_ANALYSIS_PLIES,
  replayGame,
  resolveGameAnalysisConfig,
} from './game-analysis-engine.service';
import { AnalysisAbortedError, StockfishService } from './stockfish.service';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FOOLS_MATE = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];

const cp = (value: number): Evaluation => ({ cp: value, kind: 'cp' });
const line = (evaluation: Evaluation, move: string, rank = 1): EngineLine => ({
  bound: 'exact',
  depth: 20,
  evaluation,
  pvSan: [],
  pvUci: [move],
  rank,
});

type SearchOpts = Parameters<StockfishService['searchLines']>[1];

function makeEngine(answer: (fen: string, opts: SearchOpts) => EngineLine[] | Promise<EngineLine[]>) {
  const searchLines = jest.fn(async (fen: string, opts: SearchOpts) => ({
    engine: 'Stockfish 17.1',
    lines: await answer(fen, opts),
  }));
  const stockfish = {
    engineName: jest.fn(() => 'Stockfish 17.1'),
    isAvailable: jest.fn(() => true),
    searchLines,
  } as unknown as StockfishService;
  return { searchLines, service: new GameAnalysisEngineService(stockfish), stockfish };
}

describe('replayGame', () => {
  it('produces one position per ply plus the final one', () => {
    const game = replayGame(START_FEN, ['e2e4', 'e7e5']);
    expect(game.positions.map((p) => [p.ply, p.sideToMove])).toEqual([
      [0, 'white'],
      [1, 'black'],
      [2, 'white'],
    ]);
    expect(game.moves.map((m) => [m.san, m.side])).toEqual([
      ['e4', 'white'],
      ['e5', 'black'],
    ]);
    expect(game.positions[0].legalMoveCount).toBe(20);
    expect(game.truncated).toBeNull();
  });

  it('scores a checkmate by the rules, not the engine', () => {
    const game = replayGame(START_FEN, FOOLS_MATE);
    const last = game.positions[4];
    expect(last).toMatchObject({ legalMoveCount: 0, status: 'TERMINAL', terminal: 'CHECKMATE' });
    expect(last.lines[0]).toMatchObject({
      bound: 'exact',
      evaluation: { kind: 'mate', moves: 0, winner: 'black' },
    });
  });

  it('scores stalemate and insufficient material as a draw', () => {
    const stalemate = replayGame('7k/8/6Q1/8/8/8/8/K7 w - - 0 1', ['g6f7']);
    expect(stalemate.positions[1]).toMatchObject({ status: 'TERMINAL', terminal: 'STALEMATE' });
    expect(stalemate.positions[1].lines[0].evaluation).toEqual(cp(0));

    const bare = replayGame('8/8/8/8/8/8/1q6/K6k w - - 0 1', ['a1b2']);
    expect(bare.positions[1]).toMatchObject({ status: 'TERMINAL', terminal: 'DRAW' });
  });

  it('stops at an illegal move and keeps what came before', () => {
    const game = replayGame(START_FEN, ['e2e4', 'e7e5', 'e1e3', 'g8f6']);
    expect(game.moves).toHaveLength(2);
    expect(game.positions).toHaveLength(3);
    expect(game.truncated).toEqual({ ply: 2, reason: 'Move 3 (e1e3) is not legal.' });
  });

  it('stops at a malformed move and at moves after the game ended', () => {
    expect(replayGame(START_FEN, ['e2e4', 'Nf6']).truncated).toMatchObject({ ply: 1 });
    expect(replayGame(START_FEN, [...FOOLS_MATE, 'e2e4']).truncated).toEqual({
      ply: 4,
      reason: 'Moves continue after the game ended.',
    });
  });

  it('caps the number of plies it will walk', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const long = Array.from({ length: MAX_GAME_ANALYSIS_PLIES + 8 }, (_, i) => shuffle[i % 4]);
    const game = replayGame(START_FEN, long);
    expect(game.moves).toHaveLength(MAX_GAME_ANALYSIS_PLIES);
    expect(game.truncated?.ply).toBe(MAX_GAME_ANALYSIS_PLIES);
  });

  it('refuses an illegal start position', () => {
    expect(() => replayGame('8/8/8/8/8/8/8/8 w - - 0 1', [])).toThrow(BadRequestException);
  });
});

describe('resolveGameAnalysisConfig', () => {
  it('returns presets and applies overrides', () => {
    expect(resolveGameAnalysisConfig('QUICK')).toEqual(GAME_ANALYSIS_PRESETS.QUICK);
    expect(resolveGameAnalysisConfig({ depth: 'DEEP', multiPv: 2 })).toMatchObject({ multiPv: 2, rootMoveSearch: true });
    expect(resolveGameAnalysisConfig()).toEqual(GAME_ANALYSIS_PRESETS.STANDARD);
  });

  it('refuses values outside what the box can run', () => {
    expect(() => resolveGameAnalysisConfig({ depth: 'STANDARD', multiPv: 9 })).toThrow(/multiPv/);
    expect(() => resolveGameAnalysisConfig({ depth: 'STANDARD', movetimeMs: 10 })).toThrow(/movetimeMs/);
    expect(() => resolveGameAnalysisConfig({ depth: 'STANDARD', concurrency: 0 })).toThrow(/concurrency/);
  });
});

describe('GameAnalysisEngineService.analyzeGame', () => {
  it('searches every non-terminal position on the background lane with one config', async () => {
    const { searchLines, service } = makeEngine(() => [line(cp(20), 'e2e4')]);
    const result = await service.analyzeGame({ movesUci: FOOLS_MATE, startFen: START_FEN }, { config: 'STANDARD' });

    expect(searchLines).toHaveBeenCalledTimes(4); // the mated position is not searched
    for (const [, opts] of searchLines.mock.calls) {
      expect(opts).toMatchObject({ depth: 18, movetimeMs: 800, multiPv: 2, priority: 'background' });
    }
    expect(result).toMatchObject({
      budgetExhausted: false,
      complete: true,
      conventionVersion: 'white-relative-v1',
      engine: 'Stockfish 17.1',
      truncated: null,
    });
    expect(result.positions.map((p) => p.status)).toEqual(['ANALYSED', 'ANALYSED', 'ANALYSED', 'ANALYSED', 'TERMINAL']);
  });

  it('never asks for more lines than there are legal moves', async () => {
    const { searchLines, service } = makeEngine(() => [line(cp(500), 'h8h7')]);
    // Rook on the g-file leaves the cornered king only Kh7.
    await service.analyzeGame({ movesUci: [], startFen: '7k/8/8/8/8/8/8/K5R1 b - - 0 1' }, { config: 'DEEP' });
    expect(searchLines.mock.calls[0][1]).toMatchObject({ multiPv: 1 });
  });

  it('marks a failed position and carries on', async () => {
    const { service } = makeEngine((fen) => {
      if (fen.includes(' b ')) throw new ServiceUnavailableException('The engine stopped unexpectedly.');
      return [line(cp(20), 'e2e4')];
    });
    const result = await service.analyzeGame({ movesUci: ['e2e4', 'e7e5'], startFen: START_FEN });
    expect(result.positions.map((p) => p.status)).toEqual(['ANALYSED', 'FAILED', 'ANALYSED']);
    expect(result.positions[1].error).toBe('The engine stopped unexpectedly.');
    expect(result.complete).toBe(false);
  });

  it('skips what the budget does not cover instead of guessing', async () => {
    let clock = 0;
    const { service } = makeEngine(() => {
      clock += 40_000;
      return [line(cp(20), 'e2e4')];
    });
    const result = await service.analyzeGame(
      { movesUci: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], startFen: START_FEN },
      { config: { budgetMs: 100_000, depth: 'STANDARD' }, now: () => clock },
    );
    expect(result.positions.map((p) => p.status)).toEqual(['ANALYSED', 'ANALYSED', 'ANALYSED', 'SKIPPED', 'SKIPPED']);
    expect(result).toMatchObject({ budgetExhausted: true, complete: false });
  });

  it('stops everything when aborted', async () => {
    const controller = new AbortController();
    const { searchLines, service } = makeEngine(() => {
      controller.abort();
      throw new AnalysisAbortedError();
    });
    await expect(
      service.analyzeGame({ movesUci: ['e2e4', 'e7e5'], startFen: START_FEN }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AnalysisAbortedError);
    expect(searchLines).toHaveBeenCalledTimes(1);
  });

  it('is unavailable without an engine', async () => {
    const { service, stockfish } = makeEngine(() => []);
    jest.mocked(stockfish.isAvailable).mockReturnValue(false);
    await expect(service.analyzeGame({ movesUci: [], startFen: START_FEN })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports progress over every search', async () => {
    const { service } = makeEngine(() => [line(cp(20), 'e2e4')]);
    const seen: Array<[number, number]> = [];
    await service.analyzeGame(
      { movesUci: ['e2e4', 'e7e5'], startFen: START_FEN },
      { onProgress: (done, total) => seen.push([done, total]) },
    );
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  describe('root-move search', () => {
    it('searches the played move alone only when the lines do not already score it', async () => {
      const { searchLines, service } = makeEngine((_fen, opts) =>
        opts.searchMoves ? [line(cp(-300), opts.searchMoves[0])] : [line(cp(30), 'e2e4'), line(cp(20), 'd2d4', 2)],
      );
      const result = await service.analyzeGame(
        { movesUci: ['e2e4', 'a7a6'], startFen: START_FEN },
        { config: { depth: 'DEEP', multiPv: 2 } },
      );
      const rootCalls = searchLines.mock.calls.filter(([, opts]) => opts.searchMoves);
      // e4 was the top line; …a6 was not among Black's lines.
      expect(rootCalls.map(([, opts]) => opts.searchMoves)).toEqual([['a7a6']]);
      expect(rootCalls[0][1]).toMatchObject({ multiPv: 1, priority: 'background' });
      expect(result.moves[1].rootMoveLine?.evaluation).toEqual(cp(-300));
      expect(result.moves[0].rootMoveLine).toBeNull();
    });

    it('does not run for presets that leave it off', async () => {
      const { searchLines, service } = makeEngine(() => [line(cp(30), 'e2e4')]);
      await service.analyzeGame({ movesUci: ['a2a3'], startFen: START_FEN }, { config: 'STANDARD' });
      expect(searchLines.mock.calls.some(([, opts]) => opts.searchMoves)).toBe(false);
    });
  });

  it('feeds classifyGame end to end (mocked evaluations)', async () => {
    // Scholar's mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
    const moves = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
    const scores: Record<number, EngineLine[]> = {
      0: [line(cp(30), 'e2e4')],
      1: [line(cp(-30), 'e7e5')],
      2: [line(cp(30), 'f1c4')],
      3: [line(cp(-25), 'b8c6')],
      4: [line(cp(40), 'd1h5')],
      5: [line(cp(-20), 'g7g6'), line(cp(-35), 'd8e7', 2)],
      6: [line({ kind: 'mate', moves: 1, winner: 'white' }, 'h5f7')],
    };
    let ply = 0;
    const { service } = makeEngine(() => scores[ply++]);
    const analysis = await service.analyzeGame({ movesUci: moves, startFen: START_FEN }, { config: 'STANDARD' });
    const report = classifyGame(analysis);
    expect(report.moves.map((m) => `${m.san}:${m.classification}`)).toEqual([
      'e4:BEST',
      'e5:BEST',
      'Bc4:BEST',
      'Nc6:BEST',
      'Qh5:BEST',
      'Nf6:MATE_ALLOWED',
      'Qxf7#:BEST',
    ]);
  });
});
