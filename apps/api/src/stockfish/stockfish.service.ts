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
import { validateFen } from 'chess.js';
import { Chess } from '../common/chess/chess';
import { getApiEnv } from '@nexa-chess/config/api';
import {
  normalizeUciScore,
  sanitizeCastlingRights,
  sideToMoveFromFen,
  MAX_GAME_ANALYSIS_MULTIPV,
  type EngineLine,
  type ScoreBound,
  type StockfishAnalysisResult,
} from '@nexa-chess/types';

export type { StockfishAnalysisResult };

/** One MultiPV line as the engine last reported it (side-to-move scores). */
export type RawLine = {
  /** 1-based MultiPV rank. */
  rank: number;
  evaluation: number | null;
  mate: number | null;
  bound: ScoreBound;
  /** Depth the score was reported at. */
  depth: number;
  pv: string[];
};

/** The subset the engine parser fills in; SAN fields are added afterwards. */
export type RawAnalysis = Pick<
  StockfishAnalysisResult,
  'evaluation' | 'mate' | 'depth'
> & {
  bestMove: string;
  pv: string[];
  /** Bound of the top line's score; absent means exact (older accumulators). */
  bound?: ScoreBound;
  /** Depth the top line's score was reported at. */
  scoreDepth?: number;
  /** Every MultiPV line, by rank — only collected when MultiPV > 1 was asked for. */
  lines?: RawLine[];
};

const emptyRaw = (multiPv = 1): RawAnalysis => ({
  evaluation: null,
  mate: null,
  bestMove: '',
  depth: 0,
  pv: [],
  ...(multiPv > 1 ? { lines: [] } : {}),
});

/**
 * Fold one UCI `info` line into the running analysis accumulator. Pure and
 * exported so it can be unit-tested without spawning an engine.
 *
 * A `lowerbound` / `upperbound` score is an aspiration-window fail — the true
 * score is only known to be at least / at most that. It never replaces an
 * exact score already held (nor its PV); it is kept, flagged, only while the
 * line has nothing better.
 */
export function parseUciInfoLine(line: string, acc: RawAnalysis): RawAnalysis {
  if (!line.startsWith('info ') || line.startsWith('info string')) return acc;
  const parts = line.trim().split(/\s+/);

  let depth: number | null = null;
  const depthIdx = parts.indexOf('depth');
  if (depthIdx !== -1) {
    const parsed = parseInt(parts[depthIdx + 1], 10);
    if (!Number.isNaN(parsed)) {
      depth = parsed;
      acc.depth = parsed;
    }
  }

  const multiPvIdx = parts.indexOf('multipv');
  const rank = multiPvIdx === -1 ? 1 : parseInt(parts[multiPvIdx + 1], 10) || 1;

  const scoreIdx = parts.indexOf('score');
  if (scoreIdx === -1) return acc;
  const type = parts[scoreIdx + 1];
  const val = parseInt(parts[scoreIdx + 2], 10);
  if (Number.isNaN(val) || (type !== 'cp' && type !== 'mate')) return acc;
  const boundToken = parts[scoreIdx + 3];
  const bound: ScoreBound =
    boundToken === 'lowerbound' ? 'lower' : boundToken === 'upperbound' ? 'upper' : 'exact';
  const pvIdx = parts.indexOf('pv');
  const pv = pvIdx === -1 ? null : parts.slice(pvIdx + 1);

  const score = {
    evaluation: type === 'cp' ? val / 100 : null,
    mate: type === 'mate' ? val : null,
  };

  if (acc.lines) {
    const existing = acc.lines.find((l) => l.rank === rank);
    if (!existing) {
      acc.lines.push({ rank, ...score, bound, depth: depth ?? 0, pv: pv ?? [] });
      acc.lines.sort((a, b) => a.rank - b.rank);
    } else if (bound === 'exact' || existing.bound !== 'exact') {
      Object.assign(existing, score, { bound, depth: depth ?? existing.depth });
      if (pv) existing.pv = pv;
    }
  }

  if (rank !== 1) return acc;
  const holdsExact = (acc.evaluation !== null || acc.mate !== null) && (acc.bound ?? 'exact') === 'exact';
  if (bound !== 'exact' && holdsExact) return acc;

  acc.evaluation = score.evaluation;
  acc.mate = score.mate;
  acc.bound = bound;
  if (depth !== null) acc.scoreDepth = depth;
  if (pv) acc.pv = pv;
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

  // King or rook off its home square ⇒ that right is gone (shared rule).
  const castling = sanitizeCastlingRights(`${placement} w ${fields[2] ?? '-'}`).split(' ')[2];

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

/**
 * `interactive` = a person is waiting (analysis panel, engine move, simul,
 * assignment grading). `background` = batch work (per-game analysis): it only
 * runs on engines interactive work isn't waiting for, never takes the last
 * free pool slot, and searches on one thread.
 */
export type EnginePriority = 'interactive' | 'background';

interface AnalysisTask {
  fen: string;
  priority: EnginePriority;
  /** Lines to report (UCI MultiPV). Undefined = 1. */
  multiPv?: number;
  /** Restrict the root search to these UCI moves (`go … searchmoves`). */
  searchMoves?: string[];
  resolve: (result: RawAnalysis) => void;
  reject: (error: Error) => void;
  /** Stockfish `Skill Level` (0-20). Undefined = full strength. */
  skillLevel?: number;
  /** Override the pool's default movetime for this one task. */
  movetimeMs?: number;
  /** Stop once this depth completes, even if movetime has not run out. */
  depth?: number;
  /** Search threads for this task (1 under load, more for a lone request). */
  threads?: number;
  /** Called with the running result each time the engine reports a new line. */
  onProgress?: (partial: RawAnalysis) => void;
}

/** Thrown to a caller whose request was abandoned before the engine answered. */
export class AnalysisAbortedError extends Error {
  constructor() {
    super('Analysis aborted');
    this.name = 'AnalysisAbortedError';
  }
}

/**
 * A weakened engine picks its move at depth `level + 1` and ignores everything
 * searched after that, so stopping there returns the same move without waiting
 * out the clock. Full strength (20) keeps the pool's analysis cap.
 */
export function searchDepthFor(skillLevel: number | undefined, maxDepth: number): number | undefined {
  if (skillLevel !== undefined) {
    const level = Math.max(0, Math.min(20, Math.round(skillLevel)));
    if (level < 20) return level + 1;
  }
  return maxDepth > 0 ? maxDepth : undefined;
}

/** Raw engine output → the API shape (SAN replayed from `fen`). */
function toAnalysisResult(fen: string, raw: RawAnalysis): StockfishAnalysisResult {
  const pvUci = raw.pv;
  const bestMoveUci = raw.bestMove || pvUci[0] || '';
  return {
    evaluation: raw.evaluation,
    mate: raw.mate,
    bestMove: bestMoveUci ? uciLineToSan(fen, [bestMoveUci])[0] : '',
    bestMoveUci,
    depth: raw.depth,
    pv: uciLineToSan(fen, pvUci),
    pvUci,
    ...(raw.bound && raw.bound !== 'exact' ? { scoreBound: raw.bound } : {}),
  };
}

/** One raw MultiPV line → a White-relative `EngineLine` for `fen`. */
export function toEngineLine(fen: string, line: RawLine): EngineLine {
  const sideToMove = sideToMoveFromFen(fen) ?? 'white';
  const score =
    line.mate !== null
      ? ({ kind: 'mate', value: line.mate } as const)
      : line.evaluation !== null
        ? ({ kind: 'cp', value: Math.round(line.evaluation * 100) } as const)
        : null;
  return {
    bound: line.bound,
    depth: line.depth,
    evaluation: score ? normalizeUciScore(score, sideToMove) : null,
    pvSan: uciLineToSan(fen, line.pv),
    pvUci: line.pv,
    rank: line.rank,
  };
}

/** The lines of a finished search, whether or not MultiPV was on. */
export function rawLines(raw: RawAnalysis): RawLine[] {
  if (raw.lines && raw.lines.length > 0) return raw.lines;
  if (raw.evaluation === null && raw.mate === null) return [];
  return [
    {
      bound: raw.bound ?? 'exact',
      depth: raw.scoreDepth ?? raw.depth,
      evaluation: raw.evaluation,
      mate: raw.mate,
      pv: raw.pv.length > 0 ? raw.pv : raw.bestMove && raw.bestMove !== '(none)' ? [raw.bestMove] : [],
      rank: 1,
    },
  ];
}

/**
 * Pass the first update straight through, then at most one per `intervalMs`.
 * Dropped frames are fine: each one is a complete snapshot and the caller
 * gets the final result separately.
 */
export function throttleProgress<T>(fn: (value: T) => void, intervalMs: number) {
  let last = -Infinity;
  return (value: T) => {
    const now = Date.now();
    if (now - last < intervalMs) return;
    last = now;
    fn(value);
  };
}

class EngineInstance {
  process: ChildProcess;
  isBusy = false;
  dead = false;
  /** True once the UCI handshake and Hash/Threads options have been applied. */
  ready = false;
  currentTask: AnalysisTask | null = null;
  /** A `stop` was sent; the engine is still busy until its `bestmove` arrives. */
  private stopping = false;
  private appliedThreads: number;
  private appliedMultiPv = 1;
  /** What the engine called itself in its `id name` line ("Stockfish 17.1"). */
  name: string | null = null;
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
    this.appliedThreads = tuning.threads;
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
      if (line.startsWith('id name ')) {
        this.name = line.slice('id name '.length).trim() || null;
      } else if (line.trim() === 'uciok') {
        this.process.stdin?.write(`setoption name Hash value ${this.tuning.hashMb}\n`);
        this.process.stdin?.write(`setoption name Threads value ${this.tuning.threads}\n`);
        this.process.stdin?.write('isready\n');
      } else if (line.trim() === 'readyok') {
        this.ready = true;
        this.lastUsedAt = Date.now();
        this.onReady();
      } else if (this.stopping && line.startsWith('bestmove')) {
        // The search we abandoned has wound down; the engine is free again.
        this.stopping = false;
        this.clearTimer();
        this.isBusy = false;
        this.lastUsedAt = Date.now();
        this.onReady();
      } else if (this.currentTask && line.startsWith('bestmove')) {
        this.parseBestMove(line);
      } else if (this.currentTask && line.startsWith('info ')) {
        parseUciInfoLine(line, this.result);
        if (this.currentTask.onProgress && line.includes(' pv ')) {
          this.currentTask.onProgress({ ...this.result, pv: [...this.result.pv] });
        }
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
    const multiPv = Math.max(1, Math.floor(task.multiPv ?? 1));
    this.result = emptyRaw(multiPv);

    const skill =
      task.skillLevel === undefined
        ? 20
        : Math.max(0, Math.min(20, Math.round(task.skillLevel)));
    this.process.stdin?.write(`setoption name Skill Level value ${skill}\n`);
    const threads = task.threads ?? this.tuning.threads;
    if (threads !== this.appliedThreads) {
      this.process.stdin?.write(`setoption name Threads value ${threads}\n`);
      this.appliedThreads = threads;
    }
    // Reset back to 1 after a MultiPV task, so the next caller pays nothing.
    if (multiPv !== this.appliedMultiPv) {
      this.process.stdin?.write(`setoption name MultiPV value ${multiPv}\n`);
      this.appliedMultiPv = multiPv;
    }
    const movetime = task.movetimeMs ?? this.movetimeMs;
    this.process.stdin?.write(`position fen ${task.fen}\n`);
    // With both limits Stockfish stops at whichever comes first.
    const depth = task.depth ? `depth ${task.depth} ` : '';
    // `searchmoves` must come last: Stockfish reads every token after it as a move.
    const searchMoves = task.searchMoves?.length ? ` searchmoves ${task.searchMoves.join(' ')}` : '';
    this.process.stdin?.write(`go ${depth}movetime ${movetime}${searchMoves}\n`);

    // A hung engine would otherwise hold the request (and its pool slot)
    // forever. Killing it fires 'close', which rejects the task and respawns.
    this.taskTimer = setTimeout(() => {
      Logger.warn('Stockfish did not answer in time; restarting it', 'StockfishEngine');
      this.process.kill();
    }, movetime + 5000);
  }

  /**
   * Abandon the running search with UCI `stop` instead of letting it burn its
   * full movetime. The engine stays busy until its (discarded) bestmove lands.
   */
  cancel(task: AnalysisTask, reason: Error) {
    if (this.currentTask !== task) return;
    this.currentTask = null;
    this.stopping = true;
    task.reject(reason);
    this.process.stdin?.write('stop\n');
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
  /** Engine moves stop at this depth if they get there before movetime. 0 = no cap. */
  private readonly moveMaxDepth: number;
  /** Analysis stops at this depth if it gets there before movetime. 0 = no cap. */
  private readonly maxDepth: number;
  private readonly tuning: { hashMb: number; threads: number };
  private shuttingDown = false;
  /** How long an idle engine stays alive before being reaped (ms). 0 = never reap. */
  private readonly idleTimeoutMs: number;
  private idleReaperTimer: NodeJS.Timeout | null = null;
  // Revisiting a position (stepping through a game, re-syncs) is common, so
  // answer it from memory instead of burning another engine slot.
  private readonly cache = new Map<string, StockfishAnalysisResult>();
  // Identical requests already searching share one engine slot.
  private readonly inflight = new Map<
    string,
    {
      task: AnalysisTask;
      refs: number;
      promise: Promise<RawAnalysis>;
      listeners: Set<(partial: RawAnalysis) => void>;
    }
  >();
  /** Streaming callers get at most one intermediate update per this many ms. */
  private static readonly PROGRESS_INTERVAL_MS = 80;
  /** Most threads a lone request may use; busy pools drop back to `tuning.threads` each. */
  private readonly maxThreads: number;
  private static readonly CACHE_LIMIT = 500;
  /** Last engine id seen, kept after the engine that reported it is reaped. */
  private knownEngineName: string | null = null;

  constructor() {
    const env = getApiEnv();
    this.path = env.STOCKFISH_PATH ?? '';
    this.poolSize = env.STOCKFISH_POOL_SIZE;
    this.minEngines = Math.min(env.STOCKFISH_MIN_ENGINES, this.poolSize);
    this.movetimeMs = env.STOCKFISH_MOVETIME;
    this.moveMovetimeMs = env.STOCKFISH_MOVE_MOVETIME;
    this.moveMaxDepth = env.STOCKFISH_MOVE_MAX_DEPTH;
    this.maxDepth = env.STOCKFISH_MAX_DEPTH;
    this.idleTimeoutMs = env.STOCKFISH_IDLE_TIMEOUT_S * 1000;
    this.maxThreads = Math.max(1, Math.min(4, cpus().length));
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
    opts: {
      movetimeMs?: number;
      mode?: 'analysis' | 'move';
      signal?: AbortSignal;
      /**
       * Receives the result-so-far as the search deepens (throttled), so a
       * panel can show an evaluation within milliseconds instead of waiting
       * out the movetime. The promise still resolves with the final result.
       */
      onUpdate?: (partial: StockfishAnalysisResult) => void;
    } = {},
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
    // Both stop early once deep enough; an engine move is allowed to go deeper.
    const depth = searchDepthFor(
      undefined,
      opts.mode === 'move' ? this.moveMaxDepth : this.maxDepth,
    );
    const cacheKey = `${movetimeMs}:${depth ?? ''}:${fen}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const onUpdate = opts.onUpdate;
    const raw = await this.search(
      cacheKey,
      { fen, movetimeMs, depth, priority: 'interactive' },
      opts.signal,
      onUpdate && ((partial) => onUpdate(toAnalysisResult(fen, partial))),
    );
    const result = toAnalysisResult(fen, raw);

    this.cache.set(cacheKey, result);
    if (this.cache.size > StockfishService.CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return result;
  }

  /**
   * Queue (or join) a search. Aborting detaches this caller; the search itself
   * is cancelled — dequeued, or `stop`ped on its engine — once nobody waits.
   */
  private search(
    key: string,
    spec: Pick<AnalysisTask, 'fen' | 'movetimeMs' | 'depth' | 'priority' | 'multiPv' | 'searchMoves'>,
    signal?: AbortSignal,
    onProgress?: (partial: RawAnalysis) => void,
  ): Promise<RawAnalysis> {
    if (signal?.aborted) return Promise.reject(new AnalysisAbortedError());

    let entry = this.inflight.get(key);
    if (!entry) {
      let task!: AnalysisTask;
      const listeners = new Set<(partial: RawAnalysis) => void>();
      const promise = new Promise<RawAnalysis>((resolve, reject) => {
        task = {
          ...spec,
          resolve,
          reject,
          onProgress: (partial) => listeners.forEach((listener) => listener(partial)),
        };
      });
      promise.catch(() => undefined).finally(() => {
        if (this.inflight.get(key) === created) this.inflight.delete(key);
      });
      const created = { task, refs: 0, promise, listeners };
      entry = created;
      this.inflight.set(key, entry);
      this.taskQueue.push(task);
      this.processQueue();
    }

    const joined = entry;
    // Someone is now waiting on this search: a queued background task moves up.
    if (spec.priority === 'interactive') joined.task.priority = 'interactive';
    joined.refs++;
    const listener = onProgress && throttleProgress(onProgress, StockfishService.PROGRESS_INTERVAL_MS);
    if (listener) joined.listeners.add(listener);
    return new Promise<RawAnalysis>((resolve, reject) => {
      const onAbort = () => {
        if (listener) joined.listeners.delete(listener);
        joined.refs--;
        if (joined.refs <= 0) {
          this.inflight.delete(key);
          this.cancelTask(joined.task);
        }
        reject(new AnalysisAbortedError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      joined.promise.then(resolve, reject).finally(() => {
        if (listener) joined.listeners.delete(listener);
        signal?.removeEventListener('abort', onAbort);
      });
    });
  }

  private cancelTask(task: AnalysisTask) {
    const reason = new AnalysisAbortedError();
    const queued = this.taskQueue.indexOf(task);
    if (queued !== -1) {
      this.taskQueue.splice(queued, 1);
      task.reject(reason);
      return;
    }
    this.engines.find((e) => e.currentTask === task)?.cancel(task, reason);
  }

  /** The engine's own id ("Stockfish 17.1"), once any engine has introduced itself. */
  engineName(): string | null {
    const live = this.engines.find((e) => e.name)?.name ?? null;
    if (live) this.knownEngineName = live;
    return this.knownEngineName;
  }

  /**
   * One search returning every line, White-relative, with each score's bound
   * and depth — the per-game analysis primitive. Unlike `analyzePosition` it
   * is not cached (a game's positions would flush the panel's cache) but it
   * does share an identical in-flight search.
   *
   * `searchMoves` restricts the root to those moves, which is how a played
   * move gets its own score from the same position.
   */
  async searchLines(
    inputFen: string,
    opts: {
      movetimeMs: number;
      depth?: number;
      multiPv?: number;
      searchMoves?: string[];
      priority?: EnginePriority;
      signal?: AbortSignal;
    },
  ): Promise<{ lines: EngineLine[]; engine: string | null }> {
    if (!this.path) {
      throw new ServiceUnavailableException('Engine analysis is not available on this server.');
    }
    const fen = this.normalizeFen(inputFen);
    const multiPv = Math.max(1, Math.min(MAX_GAME_ANALYSIS_MULTIPV, Math.floor(opts.multiPv ?? 1)));
    const searchMoves = (opts.searchMoves ?? []).map((m) => m.toLowerCase());
    if (searchMoves.some((m) => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))) {
      throw new BadRequestException('searchMoves must be UCI moves.');
    }
    const depth = opts.depth && opts.depth > 0 ? opts.depth : undefined;
    const priority = opts.priority ?? 'interactive';
    const key = `lines:${opts.movetimeMs}:${depth ?? ''}:${multiPv}:${searchMoves.join(',')}:${fen}`;

    const raw = await this.search(
      key,
      {
        depth,
        fen,
        movetimeMs: opts.movetimeMs,
        multiPv,
        priority,
        searchMoves: searchMoves.length ? searchMoves : undefined,
      },
      opts.signal,
    );
    return {
      engine: this.engineName(),
      lines: rawLines(raw)
        .slice(0, multiPv)
        .map((line) => toEngineLine(fen, line)),
    };
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
        priority: 'interactive',
        resolve,
        reject,
        skillLevel: opts.skillLevel,
        movetimeMs: opts.movetimeMs,
        depth: searchDepthFor(opts.skillLevel, this.moveMaxDepth),
      });
      this.processQueue();
    });

    const uci = raw.bestMove || raw.pv[0] || '';
    if (!uci || uci === '(none)') return null;
    return { uci, san: uciLineToSan(fen, [uci])[0] ?? null };
  }

  /** Background searches may hold at most this many engines; the rest stay free for people. */
  private backgroundLimit(): number {
    return Math.max(1, this.poolSize - 1);
  }

  private runningBackground(): number {
    return this.engines.filter((e) => e.currentTask?.priority === 'background').length;
  }

  /** Index of the next task an engine should take: interactive first, FIFO within a lane. */
  private nextTaskIndex(): number {
    const interactive = this.taskQueue.findIndex((t) => t.priority === 'interactive');
    if (interactive !== -1) return interactive;
    if (this.runningBackground() >= this.backgroundLimit()) return -1;
    return this.taskQueue.findIndex((t) => t.priority === 'background');
  }

  private processQueue() {
    if (this.taskQueue.length === 0) {
      // No pending work — but ensure we still have a warm standby.
      this.ensureWarmStandby();
      return;
    }

    let assigned = false;
    for (;;) {
      const next = this.nextTaskIndex();
      if (next === -1) break;
      // Only a handshaken engine takes work; a starting one picks it up via onReady.
      const availableEngine = this.engines.find((e) => e.ready && !e.isBusy && !e.dead);
      if (!availableEngine) break;
      const [task] = this.taskQueue.splice(next, 1);
      // Alone on the box, use the spare cores; any contention means 1 each.
      // Background work never takes more than one core.
      const contended = this.taskQueue.length > 0 || this.engines.some((e) => e.isBusy);
      task.threads ??=
        task.priority === 'background' ? 1 : contended ? this.tuning.threads : this.maxThreads;
      availableEngine.analyze(task);
      assigned = true;
    }
    if (assigned) {
      this.ensureWarmStandby();
      return;
    }

    // One cold start per runnable task, up to the cap. Background tasks over
    // their lane's limit are not runnable and never start an engine.
    const queuedInteractive = this.taskQueue.filter((t) => t.priority === 'interactive').length;
    const queuedBackground = this.taskQueue.length - queuedInteractive;
    const runnable =
      queuedInteractive +
      Math.min(queuedBackground, Math.max(0, this.backgroundLimit() - this.runningBackground()));
    const starting = this.engines.filter((e) => !e.ready && !e.dead).length;
    if (starting < runnable) {
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
