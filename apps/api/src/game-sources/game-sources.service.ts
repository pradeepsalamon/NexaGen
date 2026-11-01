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
  resolveAutoSync,
  type ExternalChessAccountDto,
  type GameAutoSyncPolicy,
  type GameAutoSyncRule,
  type GameSourcesOverview,
  type ImportPgnRequest,
  type ImportPgnResponse,
  type LinkExternalAccountRequest,
  type StudentGameSources,
  type SyncExternalAccountResponse,
} from '@nexa-chess/types';
import { ExternalSyncStatus, UserRole, UserStatus, type ExternalChessAccount, type ExternalChessProvider } from '@prisma/client';
import { authenticateUser, isAdminRole } from '../auth/authenticate';
import { GameAnalysisService } from '../game-analysis/game-analysis.service';
import { EntitlementService } from '../platform/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanViewStudent } from '../progress/student-access';
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
/** Just under a day, so an hourly pass that starts a little early doesn't push an account's turn back an hour. */
const AUTO_SYNC_INTERVAL_MS = 23 * 60 * 60_000;
const AUTO_SYNC_MAX_PER_PASS = 200;
const SETTINGS_ID = 'default';

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
    private readonly entitlements: EntitlementService,
    @Optional() @Inject(GAME_SOURCE_PROVIDERS) providers?: Partial<Record<ExternalChessProvider, GameSourceProvider>>,
  ) {
    this.providers = {
      CHESS_COM: providers?.CHESS_COM ?? new ChessComProvider(),
      LICHESS: providers?.LICHESS ?? new LichessProvider(),
    };
  }

  async overview(accessToken: string | undefined): Promise<GameSourcesOverview> {
    const user = await this.auth(accessToken);
    const student = user.role === UserRole.STUDENT;
    const [accounts, profile, autoSyncPolicy] = await Promise.all([
      student ? this.prisma.externalChessAccount.findMany({ orderBy: { provider: 'asc' }, where: { userId: user.id } }) : [],
      student ? this.autoSyncProfile(user.id) : null,
      this.autoSyncPolicy(),
    ]);
    return {
      accounts: accounts.map(toDto),
      autoSyncRule: profile?.gameAutoSyncRule ?? null,
      config: {
        autoSyncPolicy,
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

  /** A student's own choice; refused while the academy or a rule decides instead. */
  async setAutoSync(accessToken: string | undefined, id: string, autoSync: boolean): Promise<ExternalChessAccountDto> {
    const user = await this.authStudent(accessToken);
    const account = await this.own(user.id, id);
    this.assertEnabled();
    const [policy, profile] = await Promise.all([this.autoSyncPolicy(), this.autoSyncProfile(user.id)]);
    const { lockedBy } = resolveAutoSync({ policy, rule: profile?.gameAutoSyncRule ?? null, studentChoice: autoSync });
    if (lockedBy) {
      throw new ForbiddenException(
        lockedBy === 'STAFF' ? 'Your coach or academy decides this for your account.' : 'Your academy decides this for every student.',
      );
    }
    return toDto(await this.prisma.externalChessAccount.update({ data: { autoSync }, where: { id: account.id } }));
  }

  /** One student's accounts and sync rule, for a coach of theirs or an admin. */
  async studentSources(accessToken: string | undefined, studentId: string): Promise<StudentGameSources> {
    await this.authStaffFor(accessToken, studentId);
    const profile = await this.requireProfile(studentId);
    const [accounts, autoSyncPolicy] = await Promise.all([
      this.prisma.externalChessAccount.findMany({ orderBy: { provider: 'asc' }, where: { userId: studentId } }),
      this.autoSyncPolicy(),
    ]);
    return {
      // The code stays with the student: it proves they own the account.
      accounts: accounts.map((row) => ({ ...toDto(row), verificationCode: null })),
      autoSyncPolicy,
      autoSyncRule: profile.gameAutoSyncRule,
      autoSyncRuleByAdmin: profile.gameAutoSyncRuleByAdmin,
      externalImportEnabled: getApiEnv().EXTERNAL_GAME_IMPORT_ENABLED,
    };
  }

  /** null hands the decision back to the student. A coach can't change what an admin set. */
  async setStudentRule(accessToken: string | undefined, studentId: string, rule: GameAutoSyncRule | null): Promise<StudentGameSources> {
    const user = await this.authStaffFor(accessToken, studentId);
    const profile = await this.requireProfile(studentId);
    const admin = isAdminRole(user.role);
    if (!admin && profile.gameAutoSyncRuleByAdmin) {
      throw new ForbiddenException('An academy admin set this rule, so only an admin can change it.');
    }
    await this.prisma.studentProfile.update({
      data: { gameAutoSyncRule: rule, gameAutoSyncRuleByAdmin: admin && rule !== null },
      where: { userId: studentId },
    });
    this.logger.log(`Auto-sync rule for student ${studentId} set to ${rule ?? 'none'} by ${user.id}.`);
    return this.studentSources(accessToken, studentId);
  }

  async setPolicy(accessToken: string | undefined, policy: GameAutoSyncPolicy): Promise<{ policy: GameAutoSyncPolicy }> {
    const user = await this.auth(accessToken);
    if (!isAdminRole(user.role)) throw new ForbiddenException('Only an admin can change this.');
    await this.prisma.gameSourceSettings.upsert({
      create: { autoSyncPolicy: policy, id: SETTINGS_ID, updatedById: user.id },
      update: { autoSyncPolicy: policy, updatedById: user.id },
      where: { id: SETTINGS_ID },
    });
    this.logger.log(`Auto-sync policy set to ${policy} by ${user.id}.`);
    return { policy };
  }

  /**
   * One scheduler pass, serial because both providers ask for that. A failure
   * is on the account's row and waits a day; a 429 rests that provider until
   * the next pass and costs the account nothing. No analysis is queued, so a
   * background sync never spends the student's daily analysis limit.
   */
  async runAutoSync(signal: AbortSignal): Promise<void> {
    const policy = await this.autoSyncPolicy();
    if (policy === 'OFF' || !(await this.entitlements.hasFeature('gameAnalysis'))) return;

    const now = new Date();
    const rows = await this.prisma.externalChessAccount.findMany({
      include: { user: { select: { studentProfile: { select: { gameAutoSyncRule: true } } } } },
      orderBy: { lastAutoSyncAt: { nulls: 'first', sort: 'asc' } },
      where: {
        AND: [
          { OR: [{ lastAutoSyncAt: null }, { lastAutoSyncAt: { lte: new Date(now.getTime() - AUTO_SYNC_INTERVAL_MS) } }] },
          { OR: [{ nextSyncAllowedAt: null }, { nextSyncAllowedAt: { lte: now } }] },
        ],
        user: { isDeleted: false, role: UserRole.STUDENT, status: UserStatus.ACTIVE },
        verifiedAt: { not: null },
      },
    });
    const due = rows
      .filter((row) => resolveAutoSync({ policy, rule: row.user.studentProfile?.gameAutoSyncRule ?? null, studentChoice: row.autoSync }).enabled)
      .slice(0, AUTO_SYNC_MAX_PER_PASS);

    const resting = new Set<ExternalChessProvider>();
    for (const account of due) {
      if (signal.aborted) return;
      if (resting.has(account.provider)) continue;
      // updatedAt kept: it is how a claim tells a crashed sync from a running one.
      await this.prisma.externalChessAccount.update({
        data: { lastAutoSyncAt: now, updatedAt: account.updatedAt },
        where: { id: account.id },
      });
      try {
        const { more } = await this.runSync(account, null);
        // A long backlog carries on next pass rather than taking weeks at one page a day.
        if (more) await this.prisma.externalChessAccount.update({ data: { lastAutoSyncAt: null }, where: { id: account.id } });
      } catch (error) {
        if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
          resting.add(account.provider);
          await this.prisma.externalChessAccount.update({ data: { lastAutoSyncAt: null }, where: { id: account.id } });
        }
      }
    }
  }

  /** The student's own, or a coach of theirs / an admin starting it for them. */
  async sync(accessToken: string | undefined, id: string, analyse: boolean): Promise<SyncExternalAccountResponse> {
    const user = await this.auth(accessToken);
    const student = user.role === UserRole.STUDENT;
    const account = student ? await this.own(user.id, id) : await this.prisma.externalChessAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found.');
    if (!student) await assertCanViewStudent(this.prisma, user, account.userId);
    this.assertEnabled();
    if (!account.verifiedAt) throw new ForbiddenException('Verify this account before importing its games.');
    const now = new Date();
    if (account.nextSyncAllowedAt && account.nextSyncAllowedAt > now) {
      throw new HttpException(
        `You can import again after ${account.nextSyncAllowedAt.toISOString()}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Analysis spends the student's own daily limit, so only they can ask for it.
    return this.runSync(account, analyse && student ? user : null);
  }

  private async runSync(
    account: ExternalChessAccount,
    analyseAs: { id: string; role: UserRole; timezone: string | null } | null,
  ): Promise<SyncExternalAccountResponse> {
    const now = new Date();
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
          createdById: account.userId,
          external: { accountId: account.id, externalId: game.externalId, provider: account.provider, url: game.url },
          names: [account.username],
          ownerId: account.userId,
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
      const analysesQueued = analyseAs ? await this.analysis.queueImported(analyseAs, newIds) : 0;
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

  private async autoSyncPolicy(): Promise<GameAutoSyncPolicy> {
    const settings = await this.prisma.gameSourceSettings.findUnique({ where: { id: SETTINGS_ID } });
    return settings?.autoSyncPolicy ?? 'OFF';
  }

  private autoSyncProfile(userId: string) {
    return this.prisma.studentProfile.findUnique({
      select: { gameAutoSyncRule: true, gameAutoSyncRuleByAdmin: true },
      where: { userId },
    });
  }

  private async requireProfile(studentId: string) {
    const profile = await this.autoSyncProfile(studentId);
    if (!profile) throw new NotFoundException('Student not found.');
    return profile;
  }

  private async authStaffFor(accessToken: string | undefined, studentId: string) {
    const user = await this.auth(accessToken);
    if (user.role === UserRole.STUDENT) throw new ForbiddenException('Only a coach or admin can do this.');
    await assertCanViewStudent(this.prisma, user, studentId);
    return user;
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
    autoSync: row.autoSync,
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
