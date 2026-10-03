import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { getApiEnv } from '@nexa-chess/config/api';
import { StockfishService } from './stockfish.service';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('@nexa-chess/config/api', () => ({ getApiEnv: jest.fn() }));

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

class FakeEngine extends EventEmitter {
  stdin = { on: jest.fn(), write: jest.fn() };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = jest.fn(() => {
    this.emit('close', null);
  });

  handshake() {
    this.stdout.emit('data', 'uciok\n');
    this.stdout.emit('data', 'readyok\n');
  }

  answer() {
    this.stdout.emit('data', 'info depth 10 score cp 20 pv e2e4\nbestmove e2e4\n');
  }

  crash() {
    this.emit('close', 1);
  }

  writes(): string[] {
    return this.stdin.write.mock.calls.map(([line]) => String(line));
  }

  gotTask() {
    return this.writes().some((line) => line.startsWith('go '));
  }

  lastGo() {
    return this.writes().filter((line) => line.startsWith('go ')).pop()?.trim();
  }
}

let procs: FakeEngine[] = [];

function makeService(
  env: { maxDepth?: number; moveMaxDepth?: number; min?: number; pool?: number; idleS?: number; path?: string } = {},
) {
  jest.mocked(getApiEnv).mockReturnValue({
    STOCKFISH_HASH_MB: 64,
    STOCKFISH_IDLE_TIMEOUT_S: env.idleS ?? 60,
    STOCKFISH_MAX_DEPTH: env.maxDepth ?? 20,
    STOCKFISH_MIN_ENGINES: env.min ?? 1,
    STOCKFISH_MOVE_MAX_DEPTH: env.moveMaxDepth ?? 22,
    STOCKFISH_MOVE_MOVETIME: 2000,
    STOCKFISH_MOVETIME: 800,
    STOCKFISH_PATH: env.path ?? 'stockfish',
    STOCKFISH_POOL_SIZE: env.pool ?? 4,
  } as unknown as ReturnType<typeof getApiEnv>);
  const service = new StockfishService();
  service.onModuleInit();
  return service;
}

const poolSize = (service: StockfishService) =>
  (service as unknown as { engines: unknown[] }).engines.length;

describe('StockfishService dynamic pool', () => {
  let service: StockfishService | null = null;

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => {
    jest.useFakeTimers();
    procs = [];
    jest.mocked(spawn).mockImplementation(() => {
      const proc = new FakeEngine();
      procs.push(proc);
      return proc as unknown as ReturnType<typeof spawn>;
    });
  });

  afterEach(() => {
    service?.onModuleDestroy();
    service = null;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('starts only the minimum number of engines', () => {
    service = makeService({ min: 1, pool: 4 });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('starts nothing and reports unavailable without a path', () => {
    service = makeService({ path: '' });
    expect(spawn).not.toHaveBeenCalled();
    expect(service.isAvailable()).toBe(false);
  });

  it('holds a task until the engine has finished its handshake', async () => {
    service = makeService({ min: 1, pool: 4 });
    const result = service.analyzePosition(START_FEN);

    expect(procs[0].gotTask()).toBe(false);

    procs[0].handshake();
    const writes = procs[0].writes();
    const hashAt = writes.findIndex((line) => line.startsWith('setoption name Hash'));
    const goAt = writes.findIndex((line) => line.startsWith('go '));
    expect(hashAt).toBeGreaterThanOrEqual(0);
    expect(goAt).toBeGreaterThan(hashAt);

    procs[0].answer();
    await expect(result).resolves.toMatchObject({ bestMoveUci: 'e2e4' });
  });

  it('starts a standby once the last idle engine is taken', () => {
    service = makeService({ min: 1, pool: 4 });
    procs[0].handshake();

    // Still running at teardown, which rejects it.
    service.analyzePosition(START_FEN).catch(() => undefined);

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(procs[1].gotTask()).toBe(false);
  });

  it('never starts more engines than the pool size under a burst', async () => {
    service = makeService({ min: 1, pool: 3 });
    procs[0].handshake();

    const results = Array.from({ length: 5 }, (_, i) =>
      service!.analyzePosition(START_FEN, { movetimeMs: 100 + i }),
    );
    expect(spawn).toHaveBeenCalledTimes(3);

    procs[1].handshake();
    procs[2].handshake();
    for (let round = 0; round < 3; round++) {
      procs.forEach((proc) => proc.answer());
    }

    await expect(Promise.all(results)).resolves.toHaveLength(5);
    expect(spawn).toHaveBeenCalledTimes(3);
  });

  it('stops idle engines above the minimum after the timeout', async () => {
    service = makeService({ min: 1, pool: 4, idleS: 60 });
    procs[0].handshake();
    const first = service.analyzePosition(START_FEN, { movetimeMs: 101 });
    procs[1].handshake();
    procs[0].answer();
    await first;
    expect(poolSize(service)).toBe(2);

    jest.advanceTimersByTime(95_000);

    expect(poolSize(service)).toBe(1);
    expect(procs.filter((proc) => proc.kill.mock.calls.length > 0)).toHaveLength(1);
  });

  it('keeps the minimum even when every engine is idle', () => {
    service = makeService({ min: 1, pool: 4, idleS: 60 });
    procs[0].handshake();

    jest.advanceTimersByTime(300_000);

    expect(poolSize(service)).toBe(1);
    expect(procs[0].kill).not.toHaveBeenCalled();
  });

  it('replaces a crashed engine when the pool falls below the minimum', () => {
    service = makeService({ min: 1, pool: 4 });
    procs[0].handshake();

    procs[0].crash();
    expect(poolSize(service)).toBe(0);

    jest.advanceTimersByTime(1000);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  describe('search limits', () => {
    const run = async (
      service: StockfishService,
      call: (s: StockfishService) => Promise<unknown>,
    ) => {
      procs[0].handshake();
      const pending = call(service);
      procs[0].answer();
      await pending;
      return procs[0].lastGo();
    };

    it('lets analysis stop early at the depth cap', async () => {
      service = makeService({ maxDepth: 20 });
      await expect(run(service, (s) => s.analyzePosition(START_FEN))).resolves.toBe(
        'go depth 20 movetime 800',
      );
    });

    it('always uses the full time when the cap is 0', async () => {
      service = makeService({ maxDepth: 0 });
      await expect(run(service, (s) => s.analyzePosition(START_FEN))).resolves.toBe(
        'go movetime 800',
      );
    });

    it('lets the engine-move button stop early at its own, deeper cap', async () => {
      service = makeService({ maxDepth: 20, moveMaxDepth: 22 });
      await expect(
        run(service, (s) => s.analyzePosition(START_FEN, { mode: 'move' })),
      ).resolves.toBe('go depth 22 movetime 2000');
    });

    it('gives the engine-move button the full time when its cap is 0', async () => {
      service = makeService({ moveMaxDepth: 0 });
      await expect(
        run(service, (s) => s.analyzePosition(START_FEN, { mode: 'move' })),
      ).resolves.toBe('go movetime 2000');
    });

    it('stops a weakened engine at the depth it picks its move', async () => {
      service = makeService();
      await expect(
        run(service, (s) => s.getBestMove(START_FEN, { skillLevel: 5, movetimeMs: 400 })),
      ).resolves.toBe('go depth 6 movetime 400');
    });

    it('caps a full-strength engine move at the engine-move depth', async () => {
      service = makeService();
      await expect(run(service, (s) => s.getBestMove(START_FEN))).resolves.toBe(
        'go depth 22 movetime 800',
      );
    });
  });

  it('does not replace a crashed extra engine with no work waiting', async () => {
    service = makeService({ min: 1, pool: 4 });
    procs[0].handshake();
    const first = service.analyzePosition(START_FEN, { movetimeMs: 101 });
    procs[1].handshake();
    procs[0].answer();
    await first;

    procs[1].crash();
    jest.advanceTimersByTime(1000);

    expect(poolSize(service)).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  describe('cancellation and coalescing', () => {
    it('drops a queued request that is aborted before an engine takes it', async () => {
      service = makeService({ min: 1, pool: 1 });
      procs[0].handshake();
      const running = service.analyzePosition(START_FEN, { movetimeMs: 101 });
      const ac = new AbortController();
      const queued = service.analyzePosition(START_FEN, { movetimeMs: 102, signal: ac.signal });
      ac.abort();
      await expect(queued).rejects.toMatchObject({ name: 'AnalysisAbortedError' });

      procs[0].answer();
      await running;
      // The aborted task never reached the engine.
      expect(procs[0].writes().filter((l) => l.startsWith('go '))).toHaveLength(1);
    });

    it('sends stop to a running search and frees the engine for the next one', async () => {
      service = makeService({ min: 1, pool: 1 });
      procs[0].handshake();
      const ac = new AbortController();
      const stale = service.analyzePosition(START_FEN, { movetimeMs: 101, signal: ac.signal });
      const next = service.analyzePosition(START_FEN, { movetimeMs: 102 });

      ac.abort();
      await expect(stale).rejects.toMatchObject({ name: 'AnalysisAbortedError' });
      expect(procs[0].writes()).toContain('stop\n');
      // Still winding down: the next task must wait for the stale bestmove.
      expect(procs[0].writes().filter((l) => l.startsWith('go '))).toHaveLength(1);

      procs[0].answer(); // the stopped search's bestmove — discarded
      expect(procs[0].lastGo()).toBe('go depth 20 movetime 102');
      procs[0].answer();
      await expect(next).resolves.toMatchObject({ bestMoveUci: 'e2e4' });
    });

    it('shares one search between identical requests and cancels only when all abort', async () => {
      service = makeService({ min: 1, pool: 2 });
      procs[0].handshake();
      const a = new AbortController();
      const b = new AbortController();
      const first = service.analyzePosition(START_FEN, { signal: a.signal });
      const second = service.analyzePosition(START_FEN, { signal: b.signal });
      first.catch(() => undefined);
      expect(procs[0].writes().filter((l) => l.startsWith('go '))).toHaveLength(1);

      a.abort();
      expect(procs[0].writes()).not.toContain('stop\n');
      procs[0].answer();
      await expect(second).resolves.toMatchObject({ bestMoveUci: 'e2e4' });
      await expect(first).rejects.toMatchObject({ name: 'AnalysisAbortedError' });
    });

    it('rejects immediately for an already-aborted signal', async () => {
      service = makeService({ min: 1, pool: 1 });
      procs[0].handshake();
      await expect(
        service.analyzePosition(START_FEN, { signal: AbortSignal.abort() }),
      ).rejects.toMatchObject({ name: 'AnalysisAbortedError' });
      expect(procs[0].gotTask()).toBe(false);
    });
  });

  describe('threads', () => {
    it('gives a lone request the spare cores and sets it back under contention', () => {
      service = makeService({ min: 1, pool: 2 });
      procs[0].handshake();
      service.analyzePosition(START_FEN, { movetimeMs: 101 }).catch(() => undefined);
      const threadsSet = (i: number) =>
        procs[i].writes().filter((l) => l.startsWith('setoption name Threads'));
      // Uncontended: more than the pool-share default (1) when the host has spare CPUs.
      const lone = threadsSet(0).pop();
      expect(lone).toMatch(/^setoption name Threads value \d+/);

      procs[1].handshake();
      service.analyzePosition(START_FEN, { movetimeMs: 102 }).catch(() => undefined);
      // A second search starts while the first is running => 1 thread each.
      expect(threadsSet(1).pop()).toMatch(/value 1\b/);
    });
  });

  describe('streaming progress', () => {
    it('reports the deepening line before the final result', async () => {
      service = makeService({ min: 1, pool: 1 });
      procs[0].handshake();
      const updates: Array<{ depth: number; bestMove: string }> = [];
      const result = service.analyzePosition(START_FEN, {
        onUpdate: (u) => updates.push({ depth: u.depth, bestMove: u.bestMove }),
      });

      procs[0].stdout.emit('data', 'info depth 1 score cp 30 nodes 20 pv e2e4\n');
      expect(updates).toEqual([{ depth: 1, bestMove: 'e4' }]);

      // Inside the throttle window: dropped, the final result still arrives.
      procs[0].stdout.emit('data', 'info depth 2 score cp 25 nodes 80 pv d2d4\n');
      expect(updates).toHaveLength(1);

      jest.advanceTimersByTime(100);
      procs[0].stdout.emit('data', 'info depth 3 score cp 22 nodes 300 pv d2d4 d7d5\n');
      expect(updates[1]).toEqual({ depth: 3, bestMove: 'd4' });

      procs[0].stdout.emit('data', 'bestmove d2d4\n');
      await expect(result).resolves.toMatchObject({ depth: 3, bestMove: 'd4', pv: ['d4', 'd5'] });
    });

    it('streams to a caller that joins a search already running', async () => {
      service = makeService({ min: 1, pool: 1 });
      procs[0].handshake();
      const first = service.analyzePosition(START_FEN);
      const seen: number[] = [];
      const second = service.analyzePosition(START_FEN, { onUpdate: (u) => seen.push(u.depth) });

      procs[0].stdout.emit('data', 'info depth 5 score cp 10 pv e2e4\n');
      procs[0].answer();
      await Promise.all([first, second]);
      expect(seen).toEqual([5]);
    });

    it('ignores info lines without a principal variation', () => {
      service = makeService({ min: 1, pool: 1 });
      procs[0].handshake();
      const onUpdate = jest.fn();
      service.analyzePosition(START_FEN, { onUpdate }).catch(() => undefined);
      procs[0].stdout.emit('data', 'info depth 4 currmove e2e4 currmovenumber 1\n');
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });
});
