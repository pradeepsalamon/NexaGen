import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getApiEnv } from '@nexa-chess/config/api';
import {
  EVALUATION_CONVENTION_VERSION,
  type GameAnalysisDepth,
  type GameAnalysisStateResponse,
  type GameAnalysisSummary,
} from '@nexa-chess/types';
import { ChessGameStatus, GameAnalysisStatus, UserRole, type ChessGame } from '@prisma/client';
import { isAdminRole } from '../auth/authenticate';
import { GameLibraryService, type GameActor } from '../game-library/game-library.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveGameAnalysisConfig, MAX_GAME_ANALYSIS_PLIES } from '../stockfish/game-analysis-engine.service';
import { StockfishService } from '../stockfish/stockfish.service';
import { toReport, toSummary } from './game-analysis.mapper';
import { GameAnalysisWorker } from './game-analysis.worker';
import { gameFingerprint, gameMovesFromPgn } from './report-builder';

/** A person asked: ahead of automatic / bulk work. */
export const INTERACTIVE_PRIORITY = 10;
export const BACKGROUND_PRIORITY = 0;

/**
 * Engine analysis of Game Library games. Visibility is the Game Library's own
 * rule (`GameLibraryService.findVisibleFor`); on top of it a student may only
 * REQUEST analysis of a game they played or own, and nobody may analyse a game
 * still being played — post-game review only, never assistance mid-game.
 */
@Injectable()
export class GameAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly library: GameLibraryService,
    private readonly stockfish: StockfishService,
    private readonly worker: GameAnalysisWorker,
  ) {}

  async state(accessToken: string | undefined, gameId: string): Promise<GameAnalysisStateResponse> {
    const { game, user } = await this.library.findVisibleForToken(accessToken, gameId);
    const fingerprint = this.fingerprintOf(game);
    const rows = await this.prisma.gameAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      where: { gameId },
    });
    // Prefer an analysis of the current moves; finished beats running beats the rest.
    const rank = (s: GameAnalysisStatus) =>
      s === 'COMPLETED' ? 0 : s === 'PARTIAL' ? 1 : s === 'RUNNING' ? 2 : s === 'QUEUED' ? 3 : 4;
    const current = rows.filter((r) => r.gameFingerprint === fingerprint).sort((a, b) => rank(a.status) - rank(b.status))[0];
    const row = current ?? rows[0] ?? null;
    const blocked = await this.blockedReason(user, game, fingerprint);
    return {
      analysis: row ? toSummary(row, fingerprint) : null,
      canRequest: blocked === null,
      report: row && (row.status === 'COMPLETED' || row.status === 'PARTIAL') ? toReport(row, game, fingerprint) : null,
      requestBlockedReason: blocked,
    };
  }

  async request(accessToken: string | undefined, gameId: string, depth: GameAnalysisDepth = 'STANDARD'): Promise<GameAnalysisSummary> {
    const { game, user } = await this.library.findVisibleForToken(accessToken, gameId);
    const fingerprint = this.fingerprintOf(game);
    const blocked = await this.blockedReason(user, game, fingerprint);
    if (blocked) {
      if (!this.stockfish.isAvailable() || !getApiEnv().GAME_ANALYSIS_ENABLED) throw new ServiceUnavailableException(blocked);
      throw new ForbiddenException(blocked);
    }
    if (!fingerprint) throw new BadRequestException('This game record could not be read.');

    const existing = await this.prisma.gameAnalysis.findUnique({
      where: { gameId_gameFingerprint_depth: { depth, gameFingerprint: fingerprint, gameId } },
    });
    if (existing && existing.status !== 'FAILED' && existing.status !== 'CANCELLED') {
      // Already queued, running or done for exactly these moves: nothing new to do.
      return toSummary(existing, fingerprint);
    }
    await this.assertUnderDailyLimit(user);

    const config = resolveGameAnalysisConfig(depth);
    const base = {
      accuracyVersion: null,
      attempts: 0,
      cancelRequestedAt: null,
      classificationVersion: null,
      claimedAt: null,
      completedAt: null,
      configJson: config,
      conventionVersion: EVALUATION_CONVENTION_VERSION,
      error: null,
      heartbeatAt: null,
      priority: INTERACTIVE_PRIORITY,
      progressDone: 0,
      progressTotal: 0,
      requestedById: user.id,
      startedAt: null,
      status: GameAnalysisStatus.QUEUED,
      tacticsVersion: null,
    };
    const row = existing
      ? await this.prisma.gameAnalysis.update({ data: { ...base, engineJson: undefined }, where: { id: existing.id } })
      : await this.prisma.gameAnalysis
          .create({ data: { ...base, depth, gameFingerprint: fingerprint, gameId } })
          .catch(async (error: { code?: string }) => {
            // Two clicks racing: the unique (game, fingerprint, depth) let one in.
            if (error.code === 'P2002') {
              return this.prisma.gameAnalysis.findUniqueOrThrow({
                where: { gameId_gameFingerprint_depth: { depth, gameFingerprint: fingerprint, gameId } },
              });
            }
            throw error;
          });
    this.worker.nudge();
    return toSummary(row, fingerprint);
  }

  async cancel(accessToken: string | undefined, gameId: string): Promise<GameAnalysisSummary> {
    const { game, user } = await this.library.findVisibleForToken(accessToken, gameId);
    const row = await this.prisma.gameAnalysis.findFirst({
      orderBy: { createdAt: 'desc' },
      where: { gameId, status: { in: [GameAnalysisStatus.QUEUED, GameAnalysisStatus.RUNNING] } },
    });
    if (!row) throw new NotFoundException('There is no analysis in progress for this game.');
    if (row.requestedById !== user.id && !isAdminRole(user.role) && !(await this.coachManages(user, game))) {
      throw new ForbiddenException('Only whoever asked for this analysis can cancel it.');
    }
    const now = new Date();
    // Not started yet: cancelled outright. Running: the worker sees the flag and stops.
    const queued = await this.prisma.gameAnalysis.updateMany({
      data: { cancelRequestedAt: now, completedAt: now, status: GameAnalysisStatus.CANCELLED },
      where: { id: row.id, status: GameAnalysisStatus.QUEUED },
    });
    if (queued.count === 0) {
      const running = await this.prisma.gameAnalysis.updateMany({
        data: { cancelRequestedAt: now },
        where: { id: row.id, status: GameAnalysisStatus.RUNNING },
      });
      if (running.count === 0) throw new ConflictException('That analysis already finished.');
      this.worker.cancelLocal(row.id);
    }
    const updated = await this.prisma.gameAnalysis.findUniqueOrThrow({ where: { id: row.id } });
    return toSummary(updated, this.fingerprintOf(game));
  }

  /**
   * Queue STANDARD analyses for games a student just imported, at background
   * priority, stopping at the daily limit. Returns how many were queued.
   * Never throws for an individual game — an import must not fail on it.
   */
  async queueImported(user: GameActor, gameIds: string[]): Promise<number> {
    if (!getApiEnv().GAME_ANALYSIS_ENABLED || !this.stockfish.isAvailable() || gameIds.length === 0) return 0;
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const used = isAdminRole(user.role)
      ? 0
      : await this.prisma.gameAnalysis.count({ where: { createdAt: { gte: since }, requestedById: user.id } });
    let room = isAdminRole(user.role) ? gameIds.length : Math.max(0, getApiEnv().GAME_ANALYSIS_DAILY_LIMIT - used);
    let queued = 0;
    const config = resolveGameAnalysisConfig('STANDARD');
    for (const id of gameIds) {
      if (room <= 0) break;
      const game = await this.prisma.chessGame.findUnique({ where: { id } });
      if (!game || (await this.blockedReason(user, game, this.fingerprintOf(game))) !== null) continue;
      const created = await this.prisma.gameAnalysis
        .create({
          data: {
            configJson: config,
            conventionVersion: EVALUATION_CONVENTION_VERSION,
            depth: 'STANDARD',
            gameFingerprint: this.fingerprintOf(game) as string,
            gameId: id,
            priority: BACKGROUND_PRIORITY,
            requestedById: user.id,
          },
        })
        .then(() => true)
        .catch(() => false);
      if (created) {
        queued += 1;
        room -= 1;
      }
    }
    if (queued) this.worker.nudge();
    return queued;
  }

  // ── rules ─────────────────────────────────────────────────────────────────

  /** Null when the caller may request analysis now; otherwise the plain reason. */
  private async blockedReason(user: GameActor, game: ChessGame, fingerprint: string | null): Promise<string | null> {
    if (!getApiEnv().GAME_ANALYSIS_ENABLED || !this.stockfish.isAvailable()) {
      return 'Engine analysis is not available on this server.';
    }
    if (game.status !== ChessGameStatus.COMPLETED) return 'A game can be analysed once it has finished.';
    if (!fingerprint) return 'This game record could not be read.';
    if (game.moveCount === 0) return 'This game has no moves to analyse.';
    if (game.moveCount > MAX_GAME_ANALYSIS_PLIES) return `Games longer than ${MAX_GAME_ANALYSIS_PLIES} half-moves aren't analysed.`;
    if (user.role === UserRole.STUDENT) {
      const own = game.whitePlayerId === user.id || game.blackPlayerId === user.id || game.ownerId === user.id;
      if (!own) return 'You can analyse games you played.';
    }
    return null;
  }

  private async assertUnderDailyLimit(user: GameActor): Promise<void> {
    if (isAdminRole(user.role)) return;
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const count = await this.prisma.gameAnalysis.count({ where: { createdAt: { gte: since }, requestedById: user.id } });
    const limit = getApiEnv().GAME_ANALYSIS_DAILY_LIMIT;
    if (count >= limit) throw new ForbiddenException(`You can request ${limit} analyses a day. Try again tomorrow.`);
  }

  private async coachManages(user: GameActor, game: ChessGame): Promise<boolean> {
    if (user.role !== UserRole.COACH) return false;
    if (game.createdById === user.id) return true;
    // Whoever can see a student's game as their coach may stop its analysis.
    return !!(await this.library.findVisibleFor(user, game.id).catch(() => null));
  }

  private fingerprintOf(game: Pick<ChessGame, 'pgn'>): string | null {
    try {
      return gameFingerprint(gameMovesFromPgn(game.pgn));
    } catch {
      return null;
    }
  }
}
