import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
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

interface AnalysisTask {
  fen: string;
  resolve: (result: RawAnalysis) => void;
  reject: (error: Error) => void;
}

class EngineInstance {
  process: ChildProcess;
  isBusy = false;
  currentTask: AnalysisTask | null = null;
  private buffer = '';
  private result = emptyRaw();

  constructor(
    path: string,
    private readonly movetimeMs: number,
    private onReady: () => void,
  ) {
    this.process = spawn(path);

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
      if (this.currentTask) {
        this.currentTask.reject(new Error('Stockfish process died'));
        this.currentTask = null;
      }
      this.isBusy = false;
    });

    this.process.stdin?.write('uci\n');
  }

  private processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim() === 'uciok') {
        this.process.stdin?.write('isready\n');
      } else if (line.trim() === 'readyok') {
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

    if (this.currentTask) {
      this.currentTask.resolve(this.result);
      this.currentTask = null;
    }
    this.isBusy = false;
    this.onReady();
  }

  analyze(task: AnalysisTask) {
    this.isBusy = true;
    this.currentTask = task;
    this.result = emptyRaw();

    this.process.stdin?.write(`position fen ${task.fen}\n`);
    this.process.stdin?.write(`go movetime ${this.movetimeMs}\n`);
  }

  kill() {
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
  private readonly movetimeMs: number;

  constructor() {
    const env = getApiEnv();
    this.path = env.STOCKFISH_PATH ?? '';
    this.poolSize = env.STOCKFISH_POOL_SIZE;
    this.movetimeMs = env.STOCKFISH_MOVETIME;
  }

  onModuleInit() {
    if (!this.path) {
      this.logger.warn('STOCKFISH_PATH is not set. Engine analysis disabled.');
      return;
    }

    this.logger.log(`Initializing Stockfish pool (size: ${this.poolSize})...`);
    for (let i = 0; i < this.poolSize; i++) {
      try {
        const engine = new EngineInstance(this.path, this.movetimeMs, () =>
          this.processQueue(),
        );
        this.engines.push(engine);
      } catch {
        this.logger.error(`Failed to spawn Stockfish process at ${this.path}`);
      }
    }
  }

  onModuleDestroy() {
    this.logger.log('Shutting down Stockfish engines...');
    for (const engine of this.engines) {
      engine.kill();
    }
    this.engines = [];
  }

  async analyzePosition(fen: string): Promise<StockfishAnalysisResult> {
    if (this.engines.length === 0) {
      throw new ServiceUnavailableException(
        'Engine analysis is not available on this server.',
      );
    }

    const raw = await new Promise<RawAnalysis>((resolve, reject) => {
      this.taskQueue.push({ fen, resolve, reject });
      this.processQueue();
    });

    const pvUci = raw.pv;
    const bestMoveUci = raw.bestMove || pvUci[0] || '';
    const pv = uciLineToSan(fen, pvUci);
    const bestMove = bestMoveUci
      ? uciLineToSan(fen, [bestMoveUci])[0]
      : '';

    return {
      evaluation: raw.evaluation,
      mate: raw.mate,
      bestMove,
      bestMoveUci,
      depth: raw.depth,
      pv,
      pvUci,
    };
  }

  private processQueue() {
    if (this.taskQueue.length === 0) return;

    const availableEngine = this.engines.find((e) => !e.isBusy);
    if (availableEngine) {
      const task = this.taskQueue.shift();
      if (task) {
        availableEngine.analyze(task);
      }
    }
  }
}
