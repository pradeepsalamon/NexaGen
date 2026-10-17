import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { getApiEnv } from '@nexa-chess/config/api';
import {
  EXTERNAL_CHESS_PROVIDER_LABELS,
  EXTERNAL_SYNC_LIMITS,
  EXTERNAL_VERIFICATION_FIELD,
  PGN_IMPORT_LIMITS,
  externalProfileUrl,
  type ExternalChessAccountDto,
  type GameSourcesOverview,
  type ImportPgnRequest,
  type ImportPgnResponse,
  type LinkExternalAccountRequest,
  type SyncExternalAccountResponse,
} from '@nexa-chess/types';
import { ExternalSyncStatus, UserRole, type ExternalChessAccount, type ExternalChessProvider } from '@prisma/client';
import { authenticateUser } from '../auth/authenticate';
import { GameAnalysisService } from '../game-analysis/game-analysis.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameImportService } from './game-import.service';
import { ChessComProvider } from './providers/chess-com.provider';
import { LichessProvider } from './providers/lichess.provider';
import {
  ProviderNotFoundError,
  ProviderRateLimitedError,
  type GameSourceProvider,
} from './providers/provider';

/** A SYNCING row older than this is presumed abandoned (crashed process) and may be claimed again. */
const SYNC_STALE_MS = 10 * 60_000;

export const GAME_SOURCE_PROVIDERS = 'GAME_SOURCE_PROVIDERS';

/**
 * A student's own games: PGN uploads, and linked Lichess / Chess.com accounts
 * read through their public APIs. Only a username is stored. A sync needs a
 * verified link (the code in the account's public profile), so nobody imports
 * a stranger's games as their own; a username is verified by one student at a
 * time (partial unique index).
 */
@Injectable()
export class GameSourcesService {
  private readonly logger = new Logger(GameSourcesService.name);
  private readonly providers: Record<ExternalChessProvider, GameSourceProvider>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly importer: GameImportService,
    private readonly analysis: GameAnalysisService,
    @Optional() @Inject(GAME_SOURCE_PROVIDERS) providers?: Partial<Record<ExternalChessProvider, GameSourceProvider>>,
  ) {
    this.providers = {
      CHESS_COM: providers?.CHESS_COM ?? new ChessComProvider(),
      LICHESS: providers?.LICHESS ?? new LichessProvider(),
    };
  }

  async overview(accessToken: string | undefined): Promise<GameSourcesOverview> {
    const user = await this.auth(accessToken);
    const accounts =
      user.role === UserRole.STUDENT
        ? await this.prisma.externalChessAccount.findMany({ orderBy: { provider: 'asc' }, where: { userId: user.id } })
        : [];
    return {
      accounts: accounts.map(toDto),
      config: {
        externalImportEnabled: getApiEnv().EXTERNAL_GAME_IMPORT_ENABLED,
        pgnLimits: PGN_IMPORT_LIMITS,
        syncLimits: EXTERNAL_SYNC_LIMITS,
      },
    };
  }

  async importPgn(accessToken: string | undefined, dto: ImportPgnRequest & { side: NonNullable<ImportPgnRequest['side']> }): Promise<ImportPgnResponse> {
    const user = await this.auth(accessToken);
    const student = user.role === UserRole.STUDENT;
    const linked = student
      ? (await this.prisma.externalChessAccount.findMany({ select: { username: true }, where: { userId: user.id } })).map((a) => a.username)
      : [];
    const result = await this.importer.importText({
      createdById: user.id,
      names: [...(dto.names ?? []), ...linked, ...(student ? [user.username ?? ''] : [])].filter(Boolean),
      ownerId: student ? user.id : null,
      side: student ? dto.side : 'NONE',
      text: dto.pgn,
    });
    const analysesQueued = dto.analyse ? await this.analysis.queueImported({ id: user.id, role: user.role, timezone: user.timezone }, result.gameIds) : 0;
    return { ...result, analysesQueued };
  }

  async link(accessToken: string | undefined, dto: LinkExternalAccountRequest): Promise<ExternalChessAccountDto> {
    const user = await this.authStudent(accessToken);
    this.assertEnabled();
    const usernameKey = dto.username.toLowerCase();
    const existing = await this.prisma.externalChessAccount.findUnique({
      where: { userId_provider: { provider: dto.provider, userId: user.id } },
    });
    if (existing?.verifiedAt && existing.usernameKey !== usernameKey) {
      throw new ConflictException(`Unlink your ${EXTERNAL_CHESS_PROVIDER_LABELS[dto.provider]} account first.`);
    }
    if (existing?.verifiedAt) return toDto(existing);
    const verificationCode = `nexa-${randomBytes(4).toString('hex')}`;
    const row = existing
      ? await this.prisma.externalChessAccount.update({
          data: { syncCursor: null, username: dto.username, usernameKey, verificationCode },
          where: { id: existing.id },
        })
      : await this.prisma.externalChessAccount.create({
          data: { provider: dto.provider, userId: user.id, username: dto.username, usernameKey, verificationCode },
        });
    return toDto(row);
  }

  async verify(accessToken: string | undefined, id: string): Promise<ExternalChessAccountDto> {
    const user = await this.authStudent(accessToken);
    this.assertEnabled();
    const account = await this.own(user.id, id);
    if (account.verifiedAt) return toDto(account);
    let profile;
    try {
      profile = await this.providers[account.provider].fetchProfile(account.username);
    } catch (error) {
      throw this.providerHttpError(error);
    }
    if (!profile.exists) throw new NotFoundException(`No open ${EXTERNAL_CHESS_PROVIDER_LABELS[account.provider]} account is called ${account.username}.`);
    const code = account.verificationCode ?? '';
    if (!code || !(profile.verificationText ?? '').toLowerCase().includes(code.toLowerCase())) {
      throw new BadRequestException(
        `We couldn't find ${code} in ${EXTERNAL_VERIFICATION_FIELD[account.provider]}. Save it there, then try again.`,
      );
    }
    try {
      const row = await this.prisma.externalChessAccount.update({
        data: { verificationCode: null, verifiedAt: new Date() },
        where: { id: account.id },
      });
      return toDto(row);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Another student has already verified this account.');
      }
      throw error;
    }
  }

  async unlink(accessToken: string | undefined, id: string, deleteGames: boolean): Promise<{ id: string; deletedGames: number }> {
    const user = await this.authStudent(accessToken);
    const account = await this.own(user.id, id);
    return this.prisma.$transaction(async (tx) => {
      const games = deleteGames
        ? await tx.chessGame.deleteMany({ where: { externalAccountId: account.id, ownerId: user.id } })
        : { count: 0 };
      await tx.externalChessAccount.delete({ where: { id: account.id } });
      return { deletedGames: games.count, id: account.id };
    });
  }

  async sync(accessToken: string | undefined, id: string, analyse: boolean): Promise<SyncExternalAccountResponse> {
    const user = await this.authStudent(accessToken);
    this.assertEnabled();
    const account = await this.own(user.id, id);
    if (!account.verifiedAt) throw new ForbiddenException('Verify this account before importing its games.');
    const now = new Date();
    if (account.nextSyncAllowedAt && account.nextSyncAllowedAt > now) {
      throw new HttpException(
        `You can import again after ${account.nextSyncAllowedAt.toISOString()}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Claim: one sync per account at a time (a crashed one frees itself after SYNC_STALE_MS).
    const claimed = await this.prisma.externalChessAccount.updateMany({
      data: { syncError: null, syncStatus: ExternalSyncStatus.SYNCING },
      where: {
        id: account.id,
        OR: [{ syncStatus: { not: ExternalSyncStatus.SYNCING } }, { updatedAt: { lt: new Date(now.getTime() - SYNC_STALE_MS) } }],
      },
    });
    if (claimed.count === 0) throw new ConflictException('This account is already importing.');

    const since = new Date(now.getTime() - EXTERNAL_SYNC_LIMITS.initialLookbackDays * 86_400_000);
    const minNext = new Date(now.getTime() + EXTERNAL_SYNC_LIMITS.minMinutesBetweenSyncs * 60_000);
    let imported = 0;
    let duplicates = 0;
    try {
      const page = await this.providers[account.provider].fetchGames(
        account.username,
        account.syncCursor,
        EXTERNAL_SYNC_LIMITS.maxGamesPerSync,
        since,
      );
      const newIds: string[] = [];
      for (const game of page.games) {
        const outcome = await this.importer.store({
          createdById: user.id,
          external: { accountId: account.id, externalId: game.externalId, provider: account.provider, url: game.url },
          names: [account.username],
          ownerId: user.id,
          pgn: game.pgn,
          side: 'AUTO',
        });
        if (outcome.kind === 'IMPORTED') {
          imported += 1;
          newIds.push(outcome.gameId);
        } else if (outcome.kind === 'DUPLICATE') duplicates += 1;
      }
      const row = await this.prisma.externalChessAccount.update({
        data: {
          gamesImported: { increment: imported },
          lastSyncedAt: now,
          nextSyncAllowedAt: minNext,
          syncCursor: page.nextCursor,
          syncStatus: ExternalSyncStatus.IDLE,
        },
        where: { id: account.id },
      });
      const analysesQueued = analyse ? await this.analysis.queueImported({ id: user.id, role: user.role, timezone: user.timezone }, newIds) : 0;
      return { account: toDto(row), analysesQueued, duplicates, imported, more: page.more };
    } catch (error) {
      const rateLimited = error instanceof ProviderRateLimitedError;
      const backoff = rateLimited
        ? Math.max(EXTERNAL_SYNC_LIMITS.rateLimitBackoffMinutes * 60_000, error.retryAfterMs ?? 0)
        : EXTERNAL_SYNC_LIMITS.minMinutesBetweenSyncs * 60_000;
      await this.prisma.externalChessAccount.update({
        data: {
          gamesImported: { increment: imported },
          nextSyncAllowedAt: new Date(now.getTime() + backoff),
          syncError: (error as Error).message.slice(0, 300),
          syncStatus: rateLimited ? ExternalSyncStatus.RATE_LIMITED : ExternalSyncStatus.FAILED,
        },
        where: { id: account.id },
      });
      this.logger.warn(`Game import from ${account.provider} failed: ${(error as Error).message}`);
      throw this.providerHttpError(error);
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private assertEnabled() {
    if (!getApiEnv().EXTERNAL_GAME_IMPORT_ENABLED) {
      throw new ServiceUnavailableException('Importing from online accounts is not enabled on this server.');
    }
  }

  private providerHttpError(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    if (error instanceof ProviderRateLimitedError) {
      return new HttpException('The chess site asked us to slow down. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error instanceof ProviderNotFoundError) return new NotFoundException('That account was not found on the chess site.');
    return new ServiceUnavailableException('The chess site could not be reached. Try again later.');
  }

  private async own(userId: string, id: string): Promise<ExternalChessAccount> {
    const account = await this.prisma.externalChessAccount.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('Account not found.');
    return account;
  }

  private async auth(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private async authStudent(accessToken: string | undefined) {
    const user = await this.auth(accessToken);
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException('Only students link their own chess accounts.');
    return user;
  }
}

function toDto(row: ExternalChessAccount): ExternalChessAccountDto {
  return {
    gamesImported: row.gamesImported,
    id: row.id,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    nextSyncAllowedAt: row.nextSyncAllowedAt?.toISOString() ?? null,
    profileUrl: externalProfileUrl(row.provider, row.username),
    provider: row.provider,
    syncError: row.syncError,
    syncStatus: row.syncStatus,
    username: row.username,
    verificationCode: row.verifiedAt ? null : row.verificationCode,
    verified: !!row.verifiedAt,
  };
}
