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
}

let procs: FakeEngine[] = [];

function makeService(env: { min?: number; pool?: number; idleS?: number; path?: string } = {}) {
  jest.mocked(getApiEnv).mockReturnValue({
    STOCKFISH_HASH_MB: 64,
    STOCKFISH_IDLE_TIMEOUT_S: env.idleS ?? 60,
    STOCKFISH_MIN_ENGINES: env.min ?? 1,
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
});
