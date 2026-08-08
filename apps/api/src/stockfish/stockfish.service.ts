import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';


export interface StockfishAnalysisResult {
  evaluation: number | null;
  mate: number | null;
  bestMove: string;
  depth: number;
  pv: string[];
}

interface AnalysisTask {
  fen: string;
  resolve: (result: StockfishAnalysisResult) => void;
  reject: (error: Error) => void;
}

class EngineInstance {
  process: ChildProcess;
  isBusy = false;
  currentTask: AnalysisTask | null = null;
  private buffer = '';

  constructor(path: string, private onReady: () => void) {
    this.process = spawn(path);
    
    this.process.on('error', (err) => {
      Logger.error(`Stockfish process failed to spawn: ${err.message}`, 'StockfishEngine');
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

    // Initialize UCI
    this.process.stdin?.write("uci\n");
  }

  private processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep the incomplete line in buffer

    for (const line of lines) {
      if (line.trim() === 'uciok') {
        this.process.stdin?.write("isready\n");
      } else if (line.trim() === 'readyok') {
        this.onReady();
      } else if (this.currentTask && line.startsWith('bestmove')) {
        this.parseBestMove(line);
      } else if (this.currentTask && line.startsWith('info depth')) {
        this.parseInfo(line);
      }
    }
  }

  private result: Partial<StockfishAnalysisResult> = {
    evaluation: null,
    mate: null,
    bestMove: '',
    depth: 0,
    pv: []
  };

  private parseInfo(line: string) {
    const parts = line.split(' ');
    
    const depthIdx = parts.indexOf('depth');
    if (depthIdx !== -1) {
      this.result.depth = parseInt(parts[depthIdx + 1], 10);
    }

    const scoreIdx = parts.indexOf('score');
    if (scoreIdx !== -1) {
      const type = parts[scoreIdx + 1];
      const val = parseInt(parts[scoreIdx + 2], 10);
      
      if (type === 'cp') {
        this.result.evaluation = val / 100.0;
        this.result.mate = null;
      } else if (type === 'mate') {
        this.result.mate = val;
        this.result.evaluation = null;
      }
    }

    const pvIdx = parts.indexOf('pv');
    if (pvIdx !== -1) {
      this.result.pv = parts.slice(pvIdx + 1);
    }
  }

  private parseBestMove(line: string) {
    const parts = line.split(' ');
    if (parts.length > 1) {
      this.result.bestMove = parts[1];
    }
    
    if (this.currentTask) {
      this.currentTask.resolve(this.result as StockfishAnalysisResult);
      this.currentTask = null;
    }
    this.isBusy = false;
    this.onReady(); // Trigger next task
  }

  analyze(task: AnalysisTask) {
    this.isBusy = true;
    this.currentTask = task;
    this.result = {
      evaluation: null,
      mate: null,
      bestMove: '',
      depth: 0,
      pv: []
    };
    
    this.process.stdin?.write(`position fen ${task.fen}\n`);
    this.process.stdin?.write(`go movetime 150\n`);
  }

  kill() {
    this.process.stdin?.write("quit\n");
    this.process.kill();
  }
}

@Injectable()
export class StockfishService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StockfishService.name);
  private engines: EngineInstance[] = [];
  private taskQueue: AnalysisTask[] = [];
  private path: string;
  private poolSize: number;

  constructor() {
    this.path = process.env.STOCKFISH_PATH || 'stockfish';
    this.poolSize = parseInt(process.env.STOCKFISH_POOL_SIZE || '4', 10);
  }

  onModuleInit() {
    if (!this.path) {
      this.logger.warn('STOCKFISH_PATH is not set. Engine pooling disabled.');
      return;
    }

    this.logger.log(`Initializing Stockfish pool (size: ${this.poolSize})...`);
    for (let i = 0; i < this.poolSize; i++) {
      try {
        const engine = new EngineInstance(this.path, () => this.processQueue());
        this.engines.push(engine);
      } catch (e) {
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
      throw new Error('Stockfish is not available on this server.');
    }

    return new Promise((resolve, reject) => {
      this.taskQueue.push({ fen, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.taskQueue.length === 0) return;

    const availableEngine = this.engines.find(e => !e.isBusy);
    if (availableEngine) {
      const task = this.taskQueue.shift();
      if (task) {
        availableEngine.analyze(task);
      }
    }
  }
}
