import { Logger } from '@nestjs/common';
import { getApiEnv } from '@nexa-chess/config/api';
import { classifyGame, winPercent } from '@nexa-chess/types';
import { GameAnalysisEngineService } from './game-analysis-engine.service';
import { StockfishService } from './stockfish.service';

// Real Stockfish, curated positions. Opt-in: needs a binary, so it only runs
// with STOCKFISH_TEST_PATH set, e.g.
//   STOCKFISH_TEST_PATH=/usr/games/stockfish npx jest stockfish-engine.real
// Assertions are engine-version independent (mates, signs, line counts).

jest.mock('@nexa-chess/config/api', () => ({ getApiEnv: jest.fn() }));

const enginePath = process.env.STOCKFISH_TEST_PATH;
const describeEngine = enginePath ? describe : describe.skip;

describeEngine('Stockfish (real engine)', () => {
  let stockfish: StockfishService;
  let games: GameAnalysisEngineService;

  beforeAll(() => {
    Logger.overrideLogger(false);
    jest.mocked(getApiEnv).mockReturnValue({
      STOCKFISH_HASH_MB: 16,
      STOCKFISH_IDLE_TIMEOUT_S: 0,
      STOCKFISH_MAX_DEPTH: 16,
      STOCKFISH_MIN_ENGINES: 1,
      STOCKFISH_MOVE_MAX_DEPTH: 16,
      STOCKFISH_MOVE_MOVETIME: 300,
      STOCKFISH_MOVETIME: 300,
      STOCKFISH_PATH: enginePath,
      STOCKFISH_POOL_SIZE: 2,
    } as unknown as ReturnType<typeof getApiEnv>);
    stockfish = new StockfishService();
    stockfish.onModuleInit();
    games = new GameAnalysisEngineService(stockfish);
  });

  afterAll(() => stockfish.onModuleDestroy());

  it('finds a back-rank mate in one as an exact White mate', async () => {
    const { lines } = await stockfish.searchLines('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', {
      movetimeMs: 500,
      priority: 'background',
    });
    expect(lines[0]).toMatchObject({
      bound: 'exact',
      evaluation: { kind: 'mate', moves: 1, winner: 'white' },
      pvUci: ['a1a8'],
    });
    expect(stockfish.engineName()).toMatch(/^Stockfish/);
  }, 30_000);

  it('reports a Black advantage as negative White-relative with Black to move', async () => {
    const { lines } = await stockfish.searchLines('4k3/8/8/3q4/8/8/8/4K3 b - - 0 1', { movetimeMs: 300 });
    const top = lines[0].evaluation;
    expect(top).not.toBeNull();
    expect(winPercent(top!, 'white')).toBeLessThan(5);
    expect(winPercent(top!, 'black')).toBeGreaterThan(95);
  }, 30_000);

  it('returns ranked MultiPV lines, then leaves the existing panel call on one line', async () => {
    const { lines } = await stockfish.searchLines('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', {
      depth: 12,
      movetimeMs: 1000,
      multiPv: 3,
    });
    expect(lines.map((l) => l.rank)).toEqual([1, 2, 3]);
    expect(new Set(lines.map((l) => l.pvUci[0])).size).toBe(3);

    const panel = await stockfish.analyzePosition('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(panel.bestMoveUci).toMatch(/^[a-h][1-8][a-h][1-8]/);
  }, 30_000);

  it('searches only the played move with searchmoves', async () => {
    const { lines } = await stockfish.searchLines('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', {
      movetimeMs: 300,
      searchMoves: ['g2g4'],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].pvUci[0]).toBe('g2g4');
  }, 30_000);

  it("labels Scholar's mate: the losing knight move allows mate, the mate is best", async () => {
    const analysis = await games.analyzeGame(
      {
        movesUci: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'],
        startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
      { config: { depth: 'STANDARD', maxDepth: 16, movetimeMs: 400 } },
    );
    expect(analysis.complete).toBe(true);
    expect(analysis.positions[7]).toMatchObject({ status: 'TERMINAL', terminal: 'CHECKMATE' });

    const report = classifyGame(analysis);
    const bySan = Object.fromEntries(report.moves.map((m) => [m.san, m.classification]));
    expect(bySan.Nf6).toBe('MATE_ALLOWED');
    expect(bySan['Qxf7#']).toBe('BEST');
    expect(['BEST', 'GOOD']).toContain(bySan.e4);
  }, 60_000);
});
