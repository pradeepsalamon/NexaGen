import { BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  EVALUATION_CONVENTION_VERSION,
  GAME_ANALYSIS_PRESETS,
  MAX_GAME_ANALYSIS_MULTIPV,
  type EngineLine,
  type EnginePlayedMove,
  type EnginePosition,
  type GameAnalysisDepth,
  type GameAnalysisEngineConfig,
  type GameEngineAnalysis,
} from '@nexa-chess/types';
import { Chess } from '../common/chess/chess';
import { AnalysisAbortedError, normalizeEngineFen, StockfishService } from './stockfish.service';

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Longest game this service will walk (plies). Bounds CPU per request. */
export const MAX_GAME_ANALYSIS_PLIES = 600;

/** Preset name, or a preset with some fields overridden. */
export type GameAnalysisConfigInput =
  | GameAnalysisDepth
  | (Partial<GameAnalysisEngineConfig> & { depth: GameAnalysisDepth });

/** Merge a preset with overrides and refuse values the box can't sensibly run. */
export function resolveGameAnalysisConfig(input: GameAnalysisConfigInput = 'STANDARD'): GameAnalysisEngineConfig {
  const config =
    typeof input === 'string'
      ? { ...GAME_ANALYSIS_PRESETS[input] }
      : { ...GAME_ANALYSIS_PRESETS[input.depth], ...input };
  const problems: string[] = [];
  const intIn = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!intIn(config.movetimeMs, 50, 30_000)) problems.push('movetimeMs must be 50–30000');
  if (!intIn(config.maxDepth, 0, 60)) problems.push('maxDepth must be 0–60');
  if (!intIn(config.multiPv, 1, MAX_GAME_ANALYSIS_MULTIPV)) {
    problems.push(`multiPv must be 1–${MAX_GAME_ANALYSIS_MULTIPV}`);
  }
  if (!intIn(config.concurrency, 1, 4)) problems.push('concurrency must be 1–4');
  if (!intIn(config.budgetMs, 1_000, 3_600_000)) problems.push('budgetMs must be 1000–3600000');
  if (problems.length) throw new BadRequestException(`Invalid analysis config: ${problems.join('; ')}`);
  return config;
}

export type ReplayedGame = {
  positions: EnginePosition[];
  moves: EnginePlayedMove[];
  truncated: { ply: number; reason: string } | null;
};

/** The terminal-position score, decided by the rules rather than a search. */
function terminalLine(position: Pick<EnginePosition, 'sideToMove' | 'terminal'>): EngineLine {
  const evaluation =
    position.terminal === 'CHECKMATE'
      ? ({
          kind: 'mate',
          moves: 0,
          winner: position.sideToMove === 'white' ? 'black' : 'white',
        } as const)
      : ({ kind: 'cp', cp: 0 } as const);
  return { bound: 'exact', depth: 0, evaluation, pvSan: [], pvUci: [], rank: 1 };
}

/**
 * Replay `movesUci` from `startFen`: one position per ply plus the final one.
 * Stops at the first illegal or malformed move (recorded in `truncated`)
 * instead of throwing, so a damaged PGN still yields what it can.
 *
 * Terminal = checkmate, stalemate or insufficient material — the endings that
 * need no claim. Threefold / fifty-move are claims, so those positions are
 * searched like any other.
 */
export function replayGame(startFen: string, movesUci: string[]): ReplayedGame {
  const check = normalizeEngineFen(startFen);
  if (!check.ok) throw new BadRequestException(check.reason);
  const chess = new Chess(check.fen);

  const snapshot = (ply: number): EnginePosition => {
    const terminal = chess.isCheckmate()
      ? 'CHECKMATE'
      : chess.isStalemate()
        ? 'STALEMATE'
        : chess.isInsufficientMaterial()
          ? 'DRAW'
          : null;
    const position: EnginePosition = {
      error: null,
      fen: chess.fen(),
      legalMoveCount: chess.moves().length,
      lines: [],
      ply,
      sideToMove: chess.turn() === 'w' ? 'white' : 'black',
      status: terminal ? 'TERMINAL' : 'SKIPPED',
      terminal,
    };
    if (terminal) position.lines = [terminalLine(position)];
    return position;
  };

  const positions: EnginePosition[] = [snapshot(0)];
  const moves: EnginePlayedMove[] = [];
  let truncated: ReplayedGame['truncated'] = null;

  for (const [ply, rawUci] of movesUci.slice(0, MAX_GAME_ANALYSIS_PLIES).entries()) {
    const uci = rawUci.trim().toLowerCase();
    if (positions[ply].terminal) {
      truncated = { ply, reason: 'Moves continue after the game ended.' };
      break;
    }
    if (!UCI_MOVE.test(uci)) {
      truncated = { ply, reason: `Move ${ply + 1} is not a UCI move.` };
      break;
    }
    const side = chess.turn() === 'w' ? 'white' : 'black';
    let san: string;
    try {
      san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined }).san;
    } catch {
      truncated = { ply, reason: `Move ${ply + 1} (${uci}) is not legal.` };
      break;
    }
    moves.push({ ply, rootMoveLine: null, san, side, uci });
    positions.push(snapshot(ply + 1));
  }
  if (!truncated && movesUci.length > MAX_GAME_ANALYSIS_PLIES) {
    truncated = { ply: MAX_GAME_ANALYSIS_PLIES, reason: `Only the first ${MAX_GAME_ANALYSIS_PLIES} plies are analysed.` };
  }
  return { moves, positions, truncated };
}

/** Two configs search the same way (a resumed job must not mix depths). */
const sameConfig = (a: GameAnalysisEngineConfig, b: GameAnalysisEngineConfig) =>
  a.movetimeMs === b.movetimeMs && a.maxDepth === b.maxDepth && a.multiPv === b.multiPv;

const isAbort = (error: unknown, signal?: AbortSignal) =>
  error instanceof AnalysisAbortedError || !!signal?.aborted;

/**
 * Per-game engine analysis on the pool's BACKGROUND lane: every position of a
 * game searched with one configuration (so scores are comparable), each
 * score's bound and depth kept, and anything the budget or the engine could
 * not finish marked rather than guessed. Classification is separate and pure
 * (`classifyGame` in @nexa-chess/types).
 */
@Injectable()
export class GameAnalysisEngineService {
  constructor(private readonly stockfish: StockfishService) {}

  async analyzeGame(
    input: { startFen: string; movesUci: string[] },
    opts: {
      config?: GameAnalysisConfigInput;
      signal?: AbortSignal;
      /** Called after each search with (finished, total) searches. */
      onProgress?: (done: number, total: number) => void;
      /** Clock, injectable for budget tests. */
      now?: () => number;
      /**
       * A previous attempt's partial output (a crashed or restarted job). A
       * position it already ANALYSED with the same config and FEN is reused,
       * not searched again.
       */
      resume?: GameEngineAnalysis | null;
      /** Called after each position is settled, for checkpointing. */
      onPosition?: (position: EnginePosition) => void;
    } = {},
  ): Promise<GameEngineAnalysis> {
    if (!this.stockfish.isAvailable()) {
      throw new ServiceUnavailableException('Engine analysis is not available on this server.');
    }
    const config = resolveGameAnalysisConfig(opts.config);
    const replay = replayGame(input.startFen, input.movesUci);
    const now = opts.now ?? Date.now;
    const startedAt = now();
    const overBudget = () => now() - startedAt >= config.budgetMs;
    let budgetExhausted = false;

    const reusable = opts.resume && sameConfig(opts.resume.config, config) ? opts.resume : null;
    if (reusable) {
      for (const position of replay.positions) {
        const previous = reusable.positions[position.ply];
        if (position.status !== 'TERMINAL' && previous?.status === 'ANALYSED' && previous.fen === position.fen) {
          position.lines = previous.lines;
          position.status = 'ANALYSED';
        }
      }
    }

    const pending = replay.positions.filter((p) => p.status !== 'TERMINAL' && p.status !== 'ANALYSED');
    let done = 0;
    let total = pending.length;
    const tick = () => opts.onProgress?.(++done, total);

    // ── Every position, top lines (MultiPV never above the legal moves).
    await this.runPool(pending, config.concurrency, opts.signal, async (position) => {
      if (overBudget()) {
        budgetExhausted = true;
        position.status = 'SKIPPED';
        tick();
        return;
      }
      try {
        const result = await this.stockfish.searchLines(position.fen, {
          depth: config.maxDepth,
          movetimeMs: config.movetimeMs,
          multiPv: Math.min(config.multiPv, position.legalMoveCount),
          priority: 'background',
          signal: opts.signal,
        });
        position.lines = result.lines;
        position.status = result.lines.length > 0 ? 'ANALYSED' : 'FAILED';
        if (result.lines.length === 0) position.error = 'The engine returned no line.';
      } catch (error) {
        if (isAbort(error, opts.signal)) throw error;
        position.status = 'FAILED';
        position.error = error instanceof HttpException ? error.message : 'Engine analysis failed.';
      }
      opts.onPosition?.(position);
      tick();
    });

    // ── The played move on its own, where the lines don't already score it.
    if (config.rootMoveSearch) {
      const rootMoves = replay.moves.filter((move) => {
        const before = replay.positions[move.ply];
        return (
          before.status === 'ANALYSED' &&
          before.legalMoveCount > 1 &&
          !before.lines.some((line) => line.pvUci[0]?.toLowerCase() === move.uci)
        );
      });
      total += rootMoves.length;
      await this.runPool(rootMoves, config.concurrency, opts.signal, async (move) => {
        if (overBudget()) {
          budgetExhausted = true;
          tick();
          return;
        }
        try {
          const result = await this.stockfish.searchLines(replay.positions[move.ply].fen, {
            depth: config.maxDepth,
            movetimeMs: config.movetimeMs,
            multiPv: 1,
            priority: 'background',
            searchMoves: [move.uci],
            signal: opts.signal,
          });
          move.rootMoveLine = result.lines[0] ?? null;
        } catch (error) {
          if (isAbort(error, opts.signal)) throw error;
          // The next position's evaluation still stands in for it.
        }
        tick();
      });
    }

    return {
      complete: replay.positions.every((p) => p.status === 'ANALYSED' || p.status === 'TERMINAL'),
      budgetExhausted,
      config,
      conventionVersion: EVALUATION_CONVENTION_VERSION,
      engine: this.stockfish.engineName(),
      moves: replay.moves,
      positions: replay.positions,
      startFen: replay.positions[0].fen,
      truncated: replay.truncated,
    };
  }

  /** Run `work` over `items`, at most `concurrency` at once, in order; abort stops the rest. */
  private async runPool<T>(
    items: T[],
    concurrency: number,
    signal: AbortSignal | undefined,
    work: (item: T) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        if (signal?.aborted) throw new AnalysisAbortedError();
        const item = items[next++];
        await work(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  }
}
