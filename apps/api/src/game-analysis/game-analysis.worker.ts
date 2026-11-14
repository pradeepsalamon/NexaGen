import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getApiEnv } from '@nexa-chess/config/api';
import {
  ACCURACY_FORMULA_VERSION,
  EVALUATION_CONVENTION_VERSION,
  GAME_TACTICS_VERSION,
  MOVE_CLASSIFICATION_VERSION,
  type EnginePosition,
  type GameAnalysisEngineConfig,
  type GameEngineAnalysis,
} from '@nexa-chess/types';
import { ChessGameStatus, GameAnalysisSideColor, GameAnalysisStatus, Prisma, type ChessGame, type GameAnalysis } from '@prisma/client';
import { JOB_LOCKS, JobLockService } from '../prisma/job-lock.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameAnalysisEngineService, resolveGameAnalysisConfig } from '../stockfish/game-analysis-engine.service';
import { AnalysisAbortedError } from '../stockfish/stockfish.service';
import type { StoredReport } from './game-analysis.mapper';
import { buildAnalysis, gameFingerprint, gameMovesFromPgn, resultFor } from './report-builder';

/** A RUNNING row whose heartbeat is older than this is presumed dead and re-queued. */
export const STALE_AFTER_MS = 5 * 60_000;
/** Attempts before a job is FAILED for good. */
export const MAX_ATTEMPTS = 3;
const HEARTBEAT_MS = 5_000;
const CHECKPOINT_MS = 15_000;

class CancelledError extends Error {}

/**
 * Runs queued `game_analyses` rows on the Stockfish pool's background lane.
 *
 * The row is the job (no Redis needed): a claim is one UPDATE … WHERE id =
 * (SELECT … FOR UPDATE SKIP LOCKED), so two API processes never take the same
 * row. While running, the worker refreshes `heartbeatAt` and reads
 * `cancelRequestedAt` back in the same statement; partial engine output is
 * checkpointed into `engineJson` so a restarted job resumes instead of
 * starting over. A finish only lands while the row still carries this
 * worker's `claimedAt`, so a row re-queued by the stale sweep can't be
 * finished twice.
 */
@Injectable()
export class GameAnalysisWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(GameAnalysisWorker.name);
  private readonly running = new Map<string, AbortController>();
  private draining = false;
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: GameAnalysisEngineService,
    private readonly jobLocks: JobLockService,
  ) {}

  onModuleInit() {
    // Pick up anything queued before this process started.
    const env = getApiEnv();
    if (env.GAME_ANALYSIS_ENABLED && env.GAME_ANALYSIS_WORKER) setTimeout(() => this.nudge(), 5_000).unref();
  }

  async onApplicationShutdown() {
    this.shuttingDown = true;
    // Hand running jobs back to the queue; their checkpoints let the next process resume.
    const ids = [...this.running.keys()];
    for (const controller of this.running.values()) controller.abort();
    if (ids.length) {
      await this.prisma.gameAnalysis
        .updateMany({
          data: { claimedAt: null, heartbeatAt: null, status: GameAnalysisStatus.QUEUED },
          where: { id: { in: ids }, status: GameAnalysisStatus.RUNNING },
        })
        .catch(() => undefined);
    }
  }

  /** Start work now if a slot is free (called after a request). Never throws. */
  nudge(): void {
    void this.drain().catch((error) => this.logger.error(`Game analysis drain failed: ${(error as Error).message}`));
  }

  /** Stop a job this process is running (a cancel request). */
  cancelLocal(id: string): void {
    this.running.get(id)?.abort();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick(): Promise<void> {
    if (!getApiEnv().GAME_ANALYSIS_ENABLED || this.shuttingDown) return;
    await this.jobLocks.runExclusive(JOB_LOCKS.gameAnalysisStaleSweep, () => this.sweepStale());
    if (getApiEnv().GAME_ANALYSIS_AUTO_LIVE_GAMES) {
      await this.jobLocks.runExclusive(JOB_LOCKS.gameAnalysisAutoQueue, () => this.queueFinishedLiveGames());
    }
    this.nudge();
  }

  /** Claim and run jobs until the queue is empty or every slot is busy. */
  async drain(): Promise<void> {
    const env = getApiEnv();
    if (!env.GAME_ANALYSIS_ENABLED || !env.GAME_ANALYSIS_WORKER || this.draining || this.shuttingDown) return;
    this.draining = true;
    try {
      while (!this.shuttingDown && this.running.size < env.GAME_ANALYSIS_CONCURRENCY) {
        const claimed = await this.claim();
        if (!claimed) break;
        void this.run(claimed)
          .catch((error) => {
            this.logger.error(`Game analysis job failed: ${claimed.id}`, error);
          })
          .finally(() => {
            this.running.delete(claimed.id);
            this.nudge();
          });
      }
    } finally {
      this.draining = false;
    }
  }

  /** One QUEUED row → RUNNING, atomically, skipping rows another process holds. */
  async claim(): Promise<GameAnalysis | null> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "game_analyses"
      SET "status" = 'RUNNING',
          -- Millisecond precision: the claim is compared back as a JS Date (ms), so a
          -- microsecond timestamp would never match again.
          "claimedAt" = date_trunc('milliseconds', now() AT TIME ZONE 'UTC'),
          "heartbeatAt" = now() AT TIME ZONE 'UTC',
          "startedAt" = COALESCE("startedAt", now() AT TIME ZONE 'UTC'),
          "attempts" = "attempts" + 1,
          "updatedAt" = now() AT TIME ZONE 'UTC'
      WHERE "id" = (
        SELECT "id" FROM "game_analyses"
        WHERE "status" = 'QUEUED' AND "cancelRequestedAt" IS NULL
        ORDER BY "priority" DESC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING "id"`;
    if (!rows[0]) return null;
    const row = await this.prisma.gameAnalysis.findUnique({ where: { id: rows[0].id } });
    if (row) this.running.set(row.id, new AbortController());
    return row;
  }

  async run(row: GameAnalysis): Promise<void> {
    const controller = this.running.get(row.id) ?? new AbortController();
    const claimedAt = row.claimedAt;
    const game = await this.prisma.chessGame.findUnique({ where: { id: row.gameId } });
    if (!game) return this.finishFailed(row, claimedAt, 'The game no longer exists.', false);

    let moves;
    try {
      moves = gameMovesFromPgn(game.pgn);
    } catch {
      return this.finishFailed(row, claimedAt, 'The game record could not be read.', false);
    }
    if (gameFingerprint(moves) !== row.gameFingerprint) {
      return this.finishFailed(row, claimedAt, 'The game changed after this analysis was requested. Request it again.', false);
    }

    const partial = (row.engineJson as GameEngineAnalysis | null) ?? null;
    const settled = new Map<number, EnginePosition>();
    let lastCheckpoint = Date.now();
    let lastBeat = 0;
    let progress = { done: 0, total: 0 };

    const beat = async (force = false) => {
      if (!force && Date.now() - lastBeat < HEARTBEAT_MS) return;
      lastBeat = Date.now();
      const checkpoint =
        partial || settled.size
          ? Date.now() - lastCheckpoint >= CHECKPOINT_MS
            ? this.checkpoint(partial, settled, row)
            : undefined
          : undefined;
      if (checkpoint) lastCheckpoint = Date.now();
      const live = await this.prisma.$queryRaw<{ cancelRequestedAt: Date | null }[]>`
        UPDATE "game_analyses"
        SET "heartbeatAt" = now() AT TIME ZONE 'UTC',
            "progressDone" = ${progress.done},
            "progressTotal" = ${progress.total},
            "updatedAt" = now() AT TIME ZONE 'UTC'
            ${checkpoint ? Prisma.sql`, "engineJson" = ${JSON.stringify(checkpoint)}::jsonb` : Prisma.empty}
        WHERE "id" = ${row.id} AND "status" = 'RUNNING' AND "claimedAt" = ${claimedAt?.toISOString() ?? null}::timestamp
        RETURNING "cancelRequestedAt"`;
      // Gone, re-queued or cancelled: stop.
      if (!live[0] || live[0].cancelRequestedAt) controller.abort(new CancelledError());
    };

    try {
      const result = await this.engine.analyzeGame(
        { movesUci: moves.movesUci, startFen: moves.startFen },
        {
          config: row.configJson as unknown as GameAnalysisEngineConfig,
          onPosition: (p) => settled.set(p.ply, p),
          onProgress: (done, total) => {
            progress = { done, total };
            void beat().catch(() => undefined);
          },
          resume: partial,
          signal: controller.signal,
        },
      );
      await this.finishSucceeded(row, claimedAt, result, game, moves.clocksMs);
    } catch (error) {
      if (controller.signal.aborted || error instanceof AnalysisAbortedError) {
        if (this.shuttingDown) return; // handed back to the queue in onApplicationShutdown
        await this.prisma.gameAnalysis.updateMany({
          data: { completedAt: new Date(), status: GameAnalysisStatus.CANCELLED },
          where: { claimedAt, id: row.id, status: GameAnalysisStatus.RUNNING },
        });
        return;
      }
      const message = (error as Error).message || 'Analysis failed.';
      this.logger.warn(`Game analysis ${row.id} failed (attempt ${row.attempts}): ${message}`);
      await this.finishFailed(row, claimedAt, message, row.attempts < MAX_ATTEMPTS);
    }
  }

  private checkpoint(partial: GameEngineAnalysis | null, settled: Map<number, EnginePosition>, row: GameAnalysis) {
    const base = partial ?? {
      budgetExhausted: false,
      complete: false,
      config: row.configJson as unknown as GameAnalysisEngineConfig,
      conventionVersion: row.conventionVersion,
      engine: null,
      moves: [],
      positions: [],
      startFen: '',
      truncated: null,
    };
    // Indexed by ply (gaps stay null) — resume looks positions up by ply and FEN.
    const positions: (EnginePosition | null)[] = [...base.positions];
    for (const [ply, p] of settled) positions[ply] = p;
    for (let i = 0; i < positions.length; i += 1) positions[i] ??= null;
    return { ...base, complete: false, positions: positions as EnginePosition[] };
  }

  async finishSucceeded(
    row: GameAnalysis,
    claimedAt: Date | null,
    engine: GameEngineAnalysis,
    game: Pick<
      ChessGame,
      | 'blackPlayerId'
      | 'blackRating'
      | 'eco'
      | 'externalProvider'
      | 'openingName'
      | 'result'
      | 'source'
      | 'startedAt'
      | 'timeControl'
      | 'whitePlayerId'
      | 'whiteRating'
    >,
    clocksMs: (number | null)[],
  ): Promise<void> {
    const built = buildAnalysis(engine, clocksMs, game.timeControl);
    const limited = built.classification.limited;
    const report: StoredReport = {
      hasClockData: built.hasClockData,
      limitations: built.limitations,
      limited,
      moves: built.moves,
      sides: {
        black: { accuracy: built.classification.accuracy.black, counts: built.classification.counts.black },
        white: { accuracy: built.classification.accuracy.white, counts: built.classification.counts.white },
      },
      tactics: built.tactics,
    };
    const sideRow = (side: 'white' | 'black') => {
      const s = built.sides[side];
      return {
        accuracy: s.accuracy,
        accuracyVersion: ACCURACY_FORMULA_VERSION,
        classificationVersion: MOVE_CLASSIFICATION_VERSION,
        clockJson: s.clock ?? Prisma.DbNull,
        countsJson: s.counts,
        eco: game.eco,
        externalProvider: game.externalProvider,
        movesEligible: s.movesEligible,
        movesTotal: s.movesTotal,
        openingName: game.openingName,
        phasesJson: s.phases,
        playedAt: game.startedAt,
        playerId: side === 'white' ? game.whitePlayerId : game.blackPlayerId,
        rating: side === 'white' ? game.whiteRating : game.blackRating,
        result: resultFor(game.result, side),
        side: side === 'white' ? GameAnalysisSideColor.WHITE : GameAnalysisSideColor.BLACK,
        source: game.source,
        tacticsJson: s.tactics,
        tacticsVersion: GAME_TACTICS_VERSION,
        timeControl: game.timeControl,
      };
    };

    await this.prisma.$transaction(async (tx) => {
      const done = await tx.gameAnalysis.updateMany({
        data: {
          accuracyVersion: ACCURACY_FORMULA_VERSION,
          classificationVersion: MOVE_CLASSIFICATION_VERSION,
          completedAt: new Date(),
          engine: engine.engine,
          engineJson: engine as unknown as Prisma.InputJsonValue,
          error: null,
          progressDone: engine.positions.length,
          progressTotal: engine.positions.length,
          reportJson: report as unknown as Prisma.InputJsonValue,
          status: limited ? GameAnalysisStatus.PARTIAL : GameAnalysisStatus.COMPLETED,
          tacticsVersion: GAME_TACTICS_VERSION,
        },
        where: { claimedAt, id: row.id, status: GameAnalysisStatus.RUNNING },
      });
      if (done.count === 0) return; // re-queued or cancelled meanwhile
      await tx.gameAnalysisSide.deleteMany({ where: { analysisId: row.id } });
      await tx.gameAnalysisSide.createMany({
        data: (['white', 'black'] as const).map((side) => ({ ...sideRow(side), analysisId: row.id })),
      });
    });
  }

  private async finishFailed(row: GameAnalysis, claimedAt: Date | null, message: string, retry: boolean): Promise<void> {
    await this.prisma.gameAnalysis.updateMany({
      data: retry
        ? { claimedAt: null, error: message.slice(0, 500), heartbeatAt: null, status: GameAnalysisStatus.QUEUED }
        : { completedAt: new Date(), error: message.slice(0, 500), status: GameAnalysisStatus.FAILED },
      where: { claimedAt, id: row.id, status: GameAnalysisStatus.RUNNING },
    });
  }

  /** RUNNING rows whose process died: back to the queue, or FAILED after MAX_ATTEMPTS. */
  async sweepStale(now: Date = new Date()): Promise<{ requeued: number; failed: number }> {
    const cutoff = new Date(now.getTime() - STALE_AFTER_MS);
    const stale = { heartbeatAt: { lt: cutoff }, id: { notIn: [...this.running.keys()] }, status: GameAnalysisStatus.RUNNING };
    const failed = await this.prisma.gameAnalysis.updateMany({
      data: { completedAt: now, error: 'The analysis stopped responding too many times.', status: GameAnalysisStatus.FAILED },
      where: { ...stale, attempts: { gte: MAX_ATTEMPTS } },
    });
    const requeued = await this.prisma.gameAnalysis.updateMany({
      data: { claimedAt: null, heartbeatAt: null, status: GameAnalysisStatus.QUEUED },
      where: { ...stale, attempts: { lt: MAX_ATTEMPTS } },
    });
    if (failed.count || requeued.count) {
      this.logger.warn(`Game analysis sweep: ${requeued.count} re-queued, ${failed.count} failed`);
    }
    return { failed: failed.count, requeued: requeued.count };
  }

  /**
   * GAME_ANALYSIS_AUTO_LIVE_GAMES: queue recently finished live-class games
   * (match / simul / board) that have no analysis yet, a few at a time, at
   * background priority so a person's request always goes first.
   */
  async queueFinishedLiveGames(now: Date = new Date()): Promise<number> {
    const since = new Date(now.getTime() - 24 * 60 * 60_000);
    const games = await this.prisma.chessGame.findMany({
      orderBy: { endedAt: 'desc' },
      select: { id: true, pgn: true },
      take: 10,
      where: {
        analyses: { none: {} },
        endedAt: { gte: since },
        moveCount: { gte: 10 },
        ownerId: null,
        status: ChessGameStatus.COMPLETED,
      },
    });
    let queued = 0;
    for (const game of games) {
      let fingerprint: string;
      try {
        fingerprint = gameFingerprint(gameMovesFromPgn(game.pgn));
      } catch {
        continue;
      }
      await this.prisma.gameAnalysis
        .create({
          data: {
            configJson: resolveGameAnalysisConfig('STANDARD'),
            conventionVersion: EVALUATION_CONVENTION_VERSION,
            depth: 'STANDARD',
            gameFingerprint: fingerprint,
            gameId: game.id,
            priority: 0,
          },
        })
        .then(() => (queued += 1))
        .catch(() => undefined); // already queued by someone else
    }
    return queued;
  }
}
