import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { cpus } from 'os';
import { Chess, validateFen } from 'chess.js';
import { getApiEnv } from '@nexa-chess/config/api';
import type { StockfishAnalysisResult } from '@nexa-chess/types';

export type { StockfishAnalysisResult };

/** The subset the engine parser fills in; SAN fields are added afterwards. */
type RawAnalysis = Pick<
  StockfishAnalysisResult,
  'evaluation' | 'mate' | 'depth'
> & { bestMove: string; pv: string[] };

const emptyRaw = (): RawAnalysis => ({
  evaluation: null,
  mate: null,
  bestMove: '',
  depth: 0,
  pv: [],
});

/**
 * Fold one UCI `info` line into the running analysis accumulator. Pure and
 * exported so it can be unit-tested without spawning an engine.
 */
export function parseUciInfoLine(line: string, acc: RawAnalysis): RawAnalysis {
  if (!line.startsWith('info ')) return acc;
  const parts = line.trim().split(/\s+/);

  const depthIdx = parts.indexOf('depth');
  if (depthIdx !== -1) {
    const depth = parseInt(parts[depthIdx + 1], 10);
    if (!Number.isNaN(depth)) acc.depth = depth;
  }

  const scoreIdx = parts.indexOf('score');
  if (scoreIdx !== -1) {
    const type = parts[scoreIdx + 1];
    const val = parseInt(parts[scoreIdx + 2], 10);
    if (!Number.isNaN(val)) {
      if (type === 'cp') {
        acc.evaluation = val / 100;
        acc.mate = null;
      } else if (type === 'mate') {
        acc.mate = val;
        acc.evaluation = null;
      }
    }
  }

  const pvIdx = parts.indexOf('pv');
  if (pvIdx !== -1) {
    acc.pv = parts.slice(pvIdx + 1);
  }

  return acc;
}

/**
 * Replay a UCI line from `fen` to get SAN. Returns UCI unchanged for any move
 * that can't be replayed (keeps the panel readable rather than blank).
 */
export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  if (!validateFen(fen).ok) {
    return uciMoves;
  }

  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of uciMoves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
      san.push(uci);
      continue;
    }
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4) || undefined,
      });
      san.push(move.san);
    } catch {
      san.push(uci);
    }
  }
  return san;
}

export type EngineFenCheck = { ok: true; fen: string } | { ok: false; reason: string };

/**
 * chess.js accepts FENs Stockfish can crash on — a set-up position with the
 * side not to move in check, a pawn on the back rank, or castling rights the
 * pieces cannot back. Repair what is cosmetic (castling / en passant) and
 * reject what is genuinely illegal, so the engine only ever sees a sane board.
 */
export function normalizeEngineFen(input: string): EngineFenCheck {
  const fen = input.trim();
  if (!validateFen(fen).ok) {
    return { ok: false, reason: 'The position (FEN) is not valid.' };
  }

  const fields = fen.split(/\s+/);
  const [placement, turn] = fields;
  const rows = placement.split('/');
  const pieceAt = (square: string): string | null => {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]);
    let col = 0;
    for (const ch of rows[8 - rank]) {
      if (/\d/.test(ch)) {
        col += Number(ch);
      } else {
        if (col === file) return ch;
        col += 1;
      }
    }
    return null;
  };

  const whiteKings = (placement.match(/K/g) ?? []).length;
  const blackKings = (placement.match(/k/g) ?? []).length;
  if (whiteKings !== 1 || blackKings !== 1) {
    return { ok: false, reason: 'Each side needs exactly one king.' };
  }
  if (/[pP]/.test(rows[0]) || /[pP]/.test(rows[7])) {
    return { ok: false, reason: 'Pawns cannot stand on the first or last rank.' };
  }

  let castling = fields[2] ?? '-';
  if (castling !== '-') {
    const rights: Array<[string, string, string, string, string]> = [
      ['K', 'K', 'e1', 'R', 'h1'],
      ['Q', 'K', 'e1', 'R', 'a1'],
      ['k', 'k', 'e8', 'r', 'h8'],
      ['q', 'k', 'e8', 'r', 'a8'],
    ];
    const kept = rights
      .filter(
        ([flag, king, kingSq, rook, rookSq]) =>
          castling.includes(flag) && pieceAt(kingSq) === king && pieceAt(rookSq) === rook,
      )
      .map(([flag]) => flag)
      .join('');
    castling = kept || '-';
  }

  let ep = fields[3] ?? '-';
  if (ep !== '-') {
    const file = ep[0];
    const valid =
      turn === 'w'
        ? ep[1] === '6' && pieceAt(`${file}5`) === 'p'
        : ep[1] === '3' && pieceAt(`${file}4`) === 'P';
    if (!valid) ep = '-';
  }

  const normalized = [placement, turn, castling, ep, fields[4] ?? '0', fields[5] ?? '1'].join(' ');

  try {
    // The side that just moved may not be left in check.
    const flipped = new Chess(
      [placement, turn === 'w' ? 'b' : 'w', castling, '-', '0', '1'].join(' '),
      { skipValidation: true },
    );
    if (flipped.inCheck()) {
      const toMove = turn === 'w' ? 'White' : 'Black';
      const other = turn === 'w' ? 'Black' : 'White';
      return {
        ok: false,
        reason: `Illegal position: ${other} is in check but it is ${toMove} to move.`,
      };
    }
    new Chess(normalized);
  } catch {
    return { ok: false, reason: 'The position (FEN) is not valid.' };
  }

  return { ok: true, fen: normalized };
}

interface AnalysisTask {
  fen: string;
  resolve: (result: RawAnalysis) => void;
  reject: (error: Error) => void;
  /** Stockfish `Skill Level` (0-20). Undefined = full strength. */
  skillLevel?: number;
  /** Override the pool's default movetime for this one task. */
  movetimeMs?: number;
}

class EngineInstance {
  process: ChildProcess;
  isBusy = false;
  dead = false;
  /** True once the UCI handshake and Hash/Threads options have been applied. */
  ready = false;
  currentTask: AnalysisTask | null = null;
  /** Epoch ms when this engine last finished a task (or was spawned). */
  lastUsedAt = Date.now();
  private buffer = '';
  private result = emptyRaw();
  private taskTimer: NodeJS.Timeout | null = null;

  constructor(
    path: string,
    private readonly movetimeMs: number,
    private readonly tuning: { hashMb: number; threads: number },
    private onReady: () => void,
    private onDead: (engine: EngineInstance) => void,
  ) {
    this.process = spawn(path);

    // Writing to a crashed engine's stdin emits EPIPE; unhandled, that takes
    // the whole API down.
    this.process.stdin?.on('error', (err) => {
      Logger.warn(`Stockfish stdin error: ${err.message}`, 'StockfishEngine');
    });

    this.process.on('error', (err) => {
      Logger.error(
        `Stockfish process failed to spawn: ${err.message}`,
        'StockfishEngine',
      );
    });

    this.process.stdout?.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on('data', (data) => {
      Logger.error(`Stockfish error: ${data.toString()}`, 'StockfishEngine');
    });

    this.process.on('close', (code) => {
      Logger.warn(`Stockfish process exited with code ${code}`, 'StockfishEngine');
      this.clearTimer();
      if (this.currentTask) {
        // An availability problem, not a server bug: 503, not 500.
        this.currentTask.reject(
          new ServiceUnavailableException('The engine stopped unexpectedly. Please try again.'),
        );
        this.currentTask = null;
      }
      this.isBusy = false;
      if (!this.dead) {
        this.dead = true;
        this.onDead(this);
      }
    });

    this.process.stdin?.write('uci\n');
  }

  private processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim() === 'uciok') {
        this.process.stdin?.write(`setoption name Hash value ${this.tuning.hashMb}\n`);
        this.process.stdin?.write(`setoption name Threads value ${this.tuning.threads}\n`);
        this.process.stdin?.write('isready\n');
      } else if (line.trim() === 'readyok') {
        this.ready = true;
        this.lastUsedAt = Date.now();
        this.onReady();
      } else if (this.currentTask && line.startsWith('bestmove')) {
        this.parseBestMove(line);
      } else if (this.currentTask && line.startsWith('info ')) {
        parseUciInfoLine(line, this.result);
      }
    }
  }

  private parseBestMove(line: string) {
    const parts = line.split(/\s+/);
    if (parts.length > 1) {
      this.result.bestMove = parts[1];
    }

    this.clearTimer();
    if (this.currentTask) {
      this.currentTask.resolve(this.result);
      this.currentTask = null;
    }
    this.isBusy = false;
    this.lastUsedAt = Date.now();
    this.onReady();
  }

  private clearTimer() {
    if (this.taskTimer) {
      clearTimeout(this.taskTimer);
      this.taskTimer = null;
    }
  }

  analyze(task: AnalysisTask) {
    this.isBusy = true;
    this.currentTask = task;
    this.result = emptyRaw();

    const skill =
      task.skillLevel === undefined
        ? 20
        : Math.max(0, Math.min(20, Math.round(task.skillLevel)));
    this.process.stdin?.write(`setoption name Skill Level value ${skill}\n`);
    const movetime = task.movetimeMs ?? this.movetimeMs;
    this.process.stdin?.write(`position fen ${task.fen}\n`);
    this.process.stdin?.write(`go movetime ${movetime}\n`);

    // A hung engine would otherwise hold the request (and its pool slot)
    // forever. Killing it fires 'close', which rejects the task and respawns.
    this.taskTimer = setTimeout(() => {
      Logger.warn('Stockfish did not answer in time; restarting it', 'StockfishEngine');
      this.process.kill();
    }, movetime + 5000);
  }

  kill() {
    this.dead = true;
    this.clearTimer();
    this.process.stdin?.write('quit\n');
    this.process.kill();
  }
}

@Injectable()
export class StockfishService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StockfishService.name);
  private engines: EngineInstance[] = [];
  private taskQueue: AnalysisTask[] = [];
  private readonly path: string;
  private readonly poolSize: number;
  /** Minimum engines kept warm (always ready for instant assignment). */
  private readonly minEngines: number;
  private readonly movetimeMs: number;
  private readonly moveMovetimeMs: number;
  private readonly tuning: { hashMb: number; threads: number };
  private shuttingDown = false;
  /** How long an idle engine stays alive before being reaped (ms). 0 = never reap. */
  private readonly idleTimeoutMs: number;
  private idleReaperTimer: NodeJS.Timeout | null = null;
  // Revisiting a position (stepping through a game, re-syncs) is common, so
  // answer it from memory instead of burning another engine slot.
  private readonly cache = new Map<string, StockfishAnalysisResult>();
  private static readonly CACHE_LIMIT = 500;

  constructor() {
    const env = getApiEnv();
    this.path = env.STOCKFISH_PATH ?? '';
    this.poolSize = env.STOCKFISH_POOL_SIZE;
    this.minEngines = Math.min(env.STOCKFISH_MIN_ENGINES, this.poolSize);
    this.movetimeMs = env.STOCKFISH_MOVETIME;
    this.moveMovetimeMs = env.STOCKFISH_MOVE_MOVETIME;
    this.idleTimeoutMs = env.STOCKFISH_IDLE_TIMEOUT_S * 1000;
    this.tuning = {
      hashMb: env.STOCKFISH_HASH_MB,
      // Share the cores across the pool rather than oversubscribing them.
      threads: Math.max(1, Math.min(4, Math.floor(cpus().length / Math.max(1, this.poolSize)))),
    };
  }

  onModuleInit() {
    if (!this.path) {
      this.logger.warn('STOCKFISH_PATH is not set. Engine analysis disabled.');
      return;
    }

    // Dynamic pool: start with minEngines warm, scale up to poolSize on demand.
    this.logger.log(
      `Stockfish dynamic pool ready (min: ${this.minEngines}, max: ${this.poolSize}, idle timeout: ${this.idleTimeoutMs / 1000}s)`,
    );
    for (let i = 0; i < this.minEngines; i++) {
      this.spawnEngine();
    }
    this.startIdleReaper();
  }

  /**
   * Spawn a new engine and add it to the pool. Returns the engine, or null if
   * the pool is already at capacity or spawn fails.
   */
  private spawnEngine(): EngineInstance | null {
    if (this.engines.length >= this.poolSize) return null;
    try {
      const engine = new EngineInstance(
        this.path,
        this.movetimeMs,
        this.tuning,
        () => this.processQueue(),
        (dead) => this.replaceEngine(dead),
      );
      this.engines.push(engine);
      this.logger.log(`Stockfish engine spawned (pool: ${this.engines.length}/${this.poolSize})`);
      return engine;
    } catch {
      this.logger.error(`Failed to spawn Stockfish process at ${this.path}`);
      return null;
    }
  }

  /** A crashed engine leaves the pool and a fresh one takes its place if needed. */
  private replaceEngine(dead: EngineInstance) {
    this.engines = this.engines.filter((e) => e !== dead);
    this.logger.log(`Stockfish engine removed (pool: ${this.engines.length}/${this.poolSize})`);
    if (this.shuttingDown) return;
    // Respawn if there is pending work OR we're below the warm minimum.
    const needsRespawn = this.taskQueue.length > 0 || this.engines.length < this.minEngines;
    if (needsRespawn) {
      setTimeout(() => {
        if (this.shuttingDown) return;
        this.spawnEngine();
        this.processQueue();
      }, 1000);
    }
  }

  /** Throws a 400 naming the problem when Stockfish must not see `fen`. */
  normalizeFen(fen: string): string {
    const check = normalizeEngineFen(fen);
    if (!check.ok) throw new BadRequestException(check.reason);
    return check.fen;
  }

  onModuleDestroy() {
    this.shuttingDown = true;
    this.stopIdleReaper();
    this.logger.log('Shutting down Stockfish engines...');
    for (const engine of this.engines) {
      engine.kill();
    }
    this.engines = [];
  }

  /** Periodically kill engines that have been idle longer than the timeout. */
  private startIdleReaper() {
    if (this.idleTimeoutMs <= 0) return; // disabled
    // Check every half the timeout period (minimum 5s) for responsiveness.
    const interval = Math.max(5000, Math.floor(this.idleTimeoutMs / 2));
    this.idleReaperTimer = setInterval(() => this.reapIdleEngines(), interval);
    // Allow the process to exit even if the timer is still active.
    this.idleReaperTimer.unref();
  }

  private stopIdleReaper() {
    if (this.idleReaperTimer) {
      clearInterval(this.idleReaperTimer);
      this.idleReaperTimer = null;
    }
  }

  private reapIdleEngines() {
    if (this.shuttingDown) return;
    const now = Date.now();
    const toReap = this.engines.filter(
      (e) => !e.isBusy && !e.dead && now - e.lastUsedAt > this.idleTimeoutMs,
    );
    for (const engine of toReap) {
      // Never reap below the warm minimum.
      if (this.engines.length <= this.minEngines) break;
      this.logger.log(
        `Reaping idle Stockfish engine (idle ${Math.round((now - engine.lastUsedAt) / 1000)}s, pool: ${this.engines.length - 1}/${this.poolSize})`,
      );
      engine.kill();
      this.engines = this.engines.filter((e) => e !== engine);
    }
  }

  async analyzePosition(
    inputFen: string,
    opts: { movetimeMs?: number; mode?: 'analysis' | 'move' } = {},
  ): Promise<StockfishAnalysisResult> {
    if (!this.path) {
      throw new ServiceUnavailableException(
        'Engine analysis is not available on this server.',
      );
    }

    const fen = this.normalizeFen(inputFen);
    // "move" = the engine plays: full strength (Skill 20) and a longer think.
    const movetimeMs =
      opts.movetimeMs ?? (opts.mode === 'move' ? this.moveMovetimeMs : this.movetimeMs);
    const cacheKey = `${movetimeMs}:${fen}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const raw = await new Promise<RawAnalysis>((resolve, reject) => {
      this.taskQueue.push({ fen, resolve, reject, movetimeMs });
      this.processQueue();
    });

    const pvUci = raw.pv;
    const bestMoveUci = raw.bestMove || pvUci[0] || '';
    const pv = uciLineToSan(fen, pvUci);
    const bestMove = bestMoveUci
      ? uciLineToSan(fen, [bestMoveUci])[0]
      : '';

    const result: StockfishAnalysisResult = {
      evaluation: raw.evaluation,
      mate: raw.mate,
      bestMove,
      bestMoveUci,
      depth: raw.depth,
      pv,
      pvUci,
    };

    this.cache.set(cacheKey, result);
    if (this.cache.size > StockfishService.CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return result;
  }

  /** True when the engine path is configured (engines will spawn on demand). */
  isAvailable(): boolean {
    return !!this.path;
  }

  /**
   * Best move for `fen` at an optional reduced skill level. Returns UCI + SAN,
   * or `null` when the position is terminal / the engine returns no move.
   * Throws `ServiceUnavailableException` when the pool is not running.
   */
  async getBestMove(
    inputFen: string,
    opts: { skillLevel?: number; movetimeMs?: number } = {},
  ): Promise<{ uci: string; san: string | null } | null> {
    if (!this.path) {
      throw new ServiceUnavailableException(
        'Engine play is not available on this server.',
      );
    }
    const fen = this.normalizeFen(inputFen);

    const raw = await new Promise<RawAnalysis>((resolve, reject) => {
      this.taskQueue.push({
        fen,
        resolve,
        reject,
        skillLevel: opts.skillLevel,
        movetimeMs: opts.movetimeMs,
      });
      this.processQueue();
    });

    const uci = raw.bestMove || raw.pv[0] || '';
    if (!uci || uci === '(none)') return null;
    return { uci, san: uciLineToSan(fen, [uci])[0] ?? null };
  }

  private processQueue() {
    if (this.taskQueue.length === 0) {
      // No pending work — but ensure we still have a warm standby.
      this.ensureWarmStandby();
      return;
    }

    // Only a handshaken engine takes work; a starting one picks it up via onReady.
    const availableEngine = this.engines.find((e) => e.ready && !e.isBusy && !e.dead);
    if (availableEngine) {
      const task = this.taskQueue.shift();
      if (task) {
        availableEngine.analyze(task);
      }
      this.ensureWarmStandby();
      return;
    }

    // One cold start per queued task, up to the cap.
    const starting = this.engines.filter((e) => !e.ready && !e.dead).length;
    if (starting < this.taskQueue.length) {
      this.spawnEngine();
    }
  }

  /** Keep minEngines idle-or-starting engines so the next request skips a cold start. */
  private ensureWarmStandby() {
    if (this.shuttingDown) return;
    const idleCount = this.engines.filter((e) => !e.isBusy && !e.dead).length;
    const deficit = Math.max(0, this.minEngines - idleCount);
    for (let i = 0; i < deficit; i++) {
      if (this.engines.length >= this.poolSize) break;
      this.spawnEngine();
    }
  }
}
