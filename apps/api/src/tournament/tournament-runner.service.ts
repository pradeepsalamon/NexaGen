import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  resolveTournamentPhase,
  type PaginatedQuery,
  type RemoveTournamentPlayerRequest,
  type SetTournamentNextRoundAtRequest,
  type TournamentAuditResponse,
  type TournamentLiveDto,
  type TournamentResponse,
  type TournamentStandingDto,
  type TournamentStandingsQuery,
  type TournamentStandingsResponse
} from "@nexa-chess/types";
import {
  BatchStatus,
  Prisma,
  TournamentAuditAction,
  TournamentEndReason,
  TournamentFormat,
  TournamentGameResult,
  TournamentGameStatus,
  TournamentKnockoutDecision,
  TournamentKnockoutMatchStatus,
  TournamentPlayerStatus,
  TournamentResultSource,
  TournamentRoundStartMode,
  TournamentRoundStatus,
  TournamentStatus,
  type Tournament
} from "@prisma/client";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { TournamentAccessService, type TournamentViewer } from "./tournament-access.service";
import { TournamentAuditService } from "./tournament-audit.service";
import { TournamentCertificateService } from "./tournament-certificate.service";
import { TournamentEngineService } from "./tournament-engine.service";
import { TournamentEventsService } from "./tournament-events.service";
import { TournamentNotifierService } from "./tournament-notifier.service";
import { gameInclude, toGamePlayer, toGameSummary } from "./tournament-game.service";
import { personSelect, summaryInclude, toPerson, toSummary } from "./tournament-mapper";
import { TournamentService } from "./tournament.service";

type Tx = PrismaTransactionClient;

const standingSelect = {
  ageGroup: true,
  draws: true,
  id: true,
  losses: true,
  onFire: true,
  performance: true,
  played: true,
  points: true,
  rank: true,
  seedNumber: true,
  seedRating: true,
  status: true,
  streak: true,
  tiebreaksJson: true,
  user: { select: { avatarUrl: true, firstName: true, id: true, lastName: true } },
  wins: true
} satisfies Prisma.TournamentPlayerSelect;

type StandingPlayerRow = Prisma.TournamentPlayerGetPayload<{ select: typeof standingSelect }>;

/** Shown with the standings: entered players and those who left after it started. */
const IN_STANDINGS: TournamentPlayerStatus[] = [
  TournamentPlayerStatus.APPROVED,
  TournamentPlayerStatus.WITHDRAWN,
  TournamentPlayerStatus.DISQUALIFIED
];

/**
 * Running a tournament (docs/TOURNAMENTS.md Phases 3–5): the host's controls,
 * the player's arena controls, and the standings / live / audit views. Every
 * structural change runs in one transaction holding the tournament row lock
 * (`TournamentEngineService.lockTournament`).
 */
@Injectable()
export class TournamentRunnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentAccessService,
    private readonly engine: TournamentEngineService,
    private readonly audit: TournamentAuditService,
    private readonly events: TournamentEventsService,
    private readonly tournaments: TournamentService,
    private readonly certificates: TournamentCertificateService,
    private readonly notifier: TournamentNotifierService
  ) {}

  // ── host controls ──

  async start(accessToken: string | undefined, id: string): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    await this.prisma.$transaction(async (tx) => this.engine.start(tx, await this.engine.lockTournament(tx, id), user.id), { timeout: 60_000 });
    return this.done(user, id);
  }

  async pause(accessToken: string | undefined, id: string): Promise<TournamentResponse> {
    return this.setPaused(accessToken, id, true);
  }

  async resume(accessToken: string | undefined, id: string): Promise<TournamentResponse> {
    return this.setPaused(accessToken, id, false);
  }

  async nextRound(accessToken: string | undefined, id: string): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    await this.prisma.$transaction(async (tx) => this.engine.startNextRound(tx, await this.engine.lockTournament(tx, id), user.id), { timeout: 60_000 });
    return this.done(user, id);
  }

  /**
   * Between rounds: a host moves the next round's start (later to give players
   * a longer break, earlier to get going). "Start next round" starts it now.
   */
  async setNextRoundAt(accessToken: string | undefined, id: string, dto: SetTournamentNextRoundAtRequest): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    const at = new Date(dto.startsAt);
    if (at.getTime() <= Date.now()) throw new BadRequestException("Choose a time in the future, or start the round now.");
    await this.prisma.$transaction(async (tx) => {
      const t = await this.engine.lockTournament(tx, id);
      if (t.format !== TournamentFormat.SWISS && t.format !== TournamentFormat.ROUND_ROBIN) throw new ConflictException("This format has no rounds to schedule.");
      if (t.status !== TournamentStatus.LIVE && t.status !== TournamentStatus.PAUSED) throw new ConflictException("The tournament isn't running.");
      const last = await tx.tournamentRound.findFirst({ orderBy: { number: "desc" }, where: { tournamentId: id } });
      const total = await this.engine.totalRounds(tx, t);
      if (!last || last.status !== TournamentRoundStatus.COMPLETED) throw new ConflictException("The current round hasn't finished yet.");
      if (total === null || last.number >= total) throw new ConflictException("Every round has been played.");
      await tx.tournament.update({ data: { nextRoundAt: at, version: { increment: 1 } }, where: { id } });
      await this.audit.record(tx, {
        action: TournamentAuditAction.NEXT_ROUND_RESCHEDULED,
        actorId: user.id,
        after: { round: last.number + 1, startsAt: at.toISOString() },
        before: { startsAt: t.nextRoundAt?.toISOString() ?? null },
        tournamentId: id
      });
    });
    return this.done(user, id);
  }

  /** Ends the tournament now: an arena stops pairing (its last games still count); a round format needs no game in play. */
  async finish(accessToken: string | undefined, id: string): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    await this.prisma.$transaction(async (tx) => {
      const t = await this.engine.lockTournament(tx, id);
      if (t.status !== TournamentStatus.LIVE && t.status !== TournamentStatus.PAUSED) throw new ConflictException("The tournament isn't running.");
      if (t.format === TournamentFormat.ARENA) {
        await tx.tournament.update({ data: { arenaEndsAt: new Date(), version: { increment: 1 } }, where: { id } });
        await this.engine.completeArenaIfOver(tx, await tx.tournament.findUniqueOrThrow({ where: { id } }));
        return;
      }
      const ongoing = await tx.tournamentGame.count({ where: { status: TournamentGameStatus.ONGOING, tournamentId: id } });
      if (ongoing > 0) throw new ConflictException("Games are still being played. Let them finish or decide them first.");
      await tx.tournamentRound.updateMany({ data: { completedAt: new Date(), status: TournamentRoundStatus.COMPLETED }, where: { status: TournamentRoundStatus.ONGOING, tournamentId: id } });
      await this.engine.complete(tx, t, user.id);
    });
    return this.done(user, id);
  }

  async publishResults(accessToken: string | undefined, id: string): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tournament.updateMany({
        data: { resultsPublishedAt: new Date(), version: { increment: 1 } },
        where: { id, resultsPublishedAt: null, status: TournamentStatus.COMPLETED }
      });
      if (count === 0) throw new ConflictException("Results can be published once, after the tournament has finished.");
      await this.audit.record(tx, { action: TournamentAuditAction.RESULTS_PUBLISHED, actorId: user.id, tournamentId: id });
    });
    // After commit: certificates by the tournament's rules (idempotent; a failure is retried with "Issue certificates"),
    // then the players hear about it.
    await this.certificates.issueFor(id, user.id).catch(() => 0);
    this.notifier.resultsPublishedInBackground(id);
    return this.done(user, id);
  }

  /**
   * Takes a player out after the start (withdrawal or disqualification): their
   * game in play is forfeited to the opponent, a knockout match goes to the
   * opponent, and they are never paired again. Their results stay in the table.
   */
  async removePlayer(accessToken: string | undefined, id: string, playerId: string, dto: RemoveTournamentPlayerRequest): Promise<TournamentResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    await this.prisma.$transaction(async (tx) => {
      const t = await this.engine.lockTournament(tx, id);
      const player = await tx.tournamentPlayer.findFirst({ where: { id: playerId, tournamentId: id } });
      if (!player) throw new NotFoundException("Player not found.");
      if (player.status !== TournamentPlayerStatus.APPROVED) throw new ConflictException("Only an entered player can be withdrawn or disqualified.");
      await tx.tournamentPlayer.update({
        data: { decidedAt: new Date(), decidedById: user.id, status: dto.status, withdrawnAt: dto.status === "WITHDRAWN" ? new Date() : null },
        where: { id: playerId }
      });
      if (player.currentGameId) {
        const game = await tx.tournamentGame.findUniqueOrThrow({ where: { id: player.currentGameId } });
        const result = game.whitePlayerId === playerId ? TournamentGameResult.BLACK_WON : TournamentGameResult.WHITE_WON;
        await this.engine.finishGame(tx, t, game.id, { endReason: TournamentEndReason.FORFEIT, result, source: TournamentResultSource.FORFEIT }, { actorId: user.id });
      }
      if (t.format === TournamentFormat.KNOCKOUT) await this.forfeitKnockout(tx, t, playerId);
      await this.engine.recomputeStandings(tx, t);
      await this.audit.record(tx, {
        action: dto.status === "WITHDRAWN" ? TournamentAuditAction.PLAYER_WITHDRAWN_BY_HOST : TournamentAuditAction.PLAYER_DISQUALIFIED,
        actorId: user.id,
        reason: dto.reason,
        targetId: playerId,
        targetType: "TournamentPlayer",
        tournamentId: id
      });
    });
    return this.done(user, id);
  }

  async recompute(accessToken: string | undefined, id: string): Promise<TournamentStandingsResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    await this.prisma.$transaction(async (tx) => {
      const t = await this.engine.lockTournament(tx, id);
      await this.engine.recomputeStandings(tx, t);
      await this.audit.record(tx, { action: TournamentAuditAction.STANDINGS_RECOMPUTED, actorId: user.id, tournamentId: id });
    });
    this.events.stateChanged(id);
    return this.standings(accessToken, id, {});
  }

  // ── arena (player) ──

  async arenaJoin(accessToken: string | undefined, id: string): Promise<{ paused: boolean }> {
    return this.setArenaPause(accessToken, id, false);
  }

  async arenaLeave(accessToken: string | undefined, id: string): Promise<{ paused: boolean }> {
    return this.setArenaPause(accessToken, id, true);
  }

  // ── views ──

  async standings(accessToken: string | undefined, id: string, query: TournamentStandingsQuery): Promise<TournamentStandingsResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.load(user, id);
    const where: Prisma.TournamentPlayerWhereInput = {
      seedNumber: { not: null },
      status: { in: IN_STANDINGS },
      tournamentId: id,
      ...(query.ageGroup ? { ageGroup: query.ageGroup } : {}),
      ...(query.minRating !== undefined || query.maxRating !== undefined
        ? { seedRating: { gte: query.minRating, lte: query.maxRating } }
        : {})
    };
    if (query.batchId) {
      // Load before filter: only this academy's batch (the tenant scope applies).
      const batch = await this.prisma.batch.findUnique({ select: { id: true }, where: { id: query.batchId } });
      if (!batch) throw new NotFoundException("Batch not found.");
      where.user = { studentBatches: { some: { batch: { isDeleted: false, status: { not: BatchStatus.ARCHIVED } }, batchId: query.batchId, isDeleted: false } } };
    }
    const rows = await this.prisma.tournamentPlayer.findMany({ orderBy: [{ rank: { nulls: "last", sort: "asc" } }, { seedNumber: "asc" }], select: standingSelect, where });
    const filtered = Boolean(query.ageGroup || query.batchId || query.minRating !== undefined || query.maxRating !== undefined);
    return {
      pointsUnit: tournament.format === TournamentFormat.ARENA ? "arena-points" : "half-points",
      standings: this.withFilteredRanks(rows, filtered),
      tiebreaks: tournament.tiebreaks
    };
  }

  async live(accessToken: string | undefined, id: string): Promise<TournamentLiveDto> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, id);
    return this.liveFor(loaded.tournament, loaded.playerRow);
  }

  /** The snapshot itself (also served to anonymous viewers in Phase 7, through the public projection). */
  async liveFor(t: Tournament, playerRow: { id: string; status: TournamentPlayerStatus; currentGameId: string | null; arenaPausedAt: Date | null } | null): Promise<TournamentLiveDto> {
    const [row, ongoing, leaders, lastRound, total] = await Promise.all([
      this.prisma.tournament.findUniqueOrThrow({ include: summaryInclude, where: { id: t.id } }),
      this.prisma.tournamentGame.findMany({
        include: gameInclude,
        orderBy: [{ boardNumber: "asc" }],
        take: 200,
        where: { status: TournamentGameStatus.ONGOING, tournamentId: t.id }
      }),
      this.prisma.tournamentPlayer.findMany({
        orderBy: [{ rank: { nulls: "last", sort: "asc" } }, { seedNumber: "asc" }],
        select: standingSelect,
        take: 10,
        where: { seedNumber: { not: null }, status: { in: IN_STANDINGS }, tournamentId: t.id }
      }),
      this.prisma.tournamentRound.findFirst({ orderBy: { number: "desc" }, where: { tournamentId: t.id } }),
      this.engine.totalRounds(this.prisma as unknown as Tx, t)
    ]);
    const roundFormat = t.format === TournamentFormat.SWISS || t.format === TournamentFormat.ROUND_ROBIN;
    const running = t.status === TournamentStatus.LIVE || t.status === TournamentStatus.PAUSED;
    const betweenRounds = roundFormat && running && lastRound?.status === TournamentRoundStatus.COMPLETED && total !== null && lastRound.number < total;
    const nextRoundAt = betweenRounds ? (row.nextRoundAt?.toISOString() ?? null) : null;
    return {
      awaitingHost: betweenRounds && nextRoundAt === null,
      currentRound: row.currentRound,
      leaders: this.withFilteredRanks(leaders, false),
      me: playerRow
        ? { arenaPaused: playerRow.arenaPausedAt !== null, currentGameId: playerRow.currentGameId, playerId: playerRow.id, status: playerRow.status }
        : null,
      nextRoundAt,
      ongoingGames: ongoing.map(toGameSummary),
      serverNow: new Date().toISOString(),
      totalRounds: total,
      tournament: {
        ...toSummary(row, playerRow?.status ?? null),
        arenaEndsAt: row.arenaEndsAt?.toISOString() ?? null,
        endedAt: row.endedAt?.toISOString() ?? null,
        spectatorDelaySec: row.spectatorDelaySec,
        startedAt: row.startedAt?.toISOString() ?? null
      },
      version: this.events.version(t.id)
    };
  }

  async auditLog(accessToken: string | undefined, id: string, query: PaginatedQuery): Promise<TournamentAuditResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where = { tournamentId: id };
    const [rows, total] = await Promise.all([
      this.prisma.tournamentAuditLog.findMany({ include: { actor: { select: personSelect } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take, where }),
      this.prisma.tournamentAuditLog.count({ where })
    ]);
    return {
      entries: rows.map((r) => ({
        action: r.action,
        actor: r.actor ? toPerson(r.actor) : null,
        after: r.afterJson,
        before: r.beforeJson,
        createdAt: r.createdAt.toISOString(),
        id: r.id,
        reason: r.reason,
        targetId: r.targetId,
        targetType: r.targetType
      })),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  // ── scheduler (no user; runs inside the academy) ──

  /**
   * One tick for one tournament: auto-start at the start time, the arena's
   * pairing and end, and the next round after the break. Idempotent: every
   * step re-checks under the tournament lock.
   */
  async tick(id: string, now = new Date()): Promise<boolean> {
    const changed = await this.prisma.$transaction(
      async (tx) => {
        const t = await this.engine.lockTournament(tx, id);
        if (t.status === TournamentStatus.PUBLISHED && t.startsAt <= now) {
          const approved = await tx.tournamentPlayer.count({ where: { status: TournamentPlayerStatus.APPROVED, tournamentId: id } });
          if (approved < Math.max(2, t.minPlayers)) return false;
          await this.engine.start(tx, t, null);
          return true;
        }
        if (t.status !== TournamentStatus.LIVE) return false;
        if (t.format === TournamentFormat.ARENA) {
          const paired = await this.engine.arenaTick(tx, t);
          await this.engine.completeArenaIfOver(tx, t);
          const after = await tx.tournament.findUniqueOrThrow({ select: { status: true }, where: { id } });
          return paired > 0 || after.status !== t.status;
        }
        if (t.format === TournamentFormat.KNOCKOUT) return false;
        // A round finished before `nextRoundAt` existed (or its plan was lost): plan it now.
        const due = t.nextRoundAt ?? (t.roundStartMode === TournamentRoundStartMode.MANUAL ? null : await this.engine.planNextRound(tx, t));
        if (!due || due.getTime() > now.getTime()) return false;
        const open = await tx.tournamentRound.count({ where: { status: TournamentRoundStatus.ONGOING, tournamentId: id } });
        if (open > 0) return false;
        await this.engine.startNextRound(tx, t, null);
        return true;
      },
      { timeout: 60_000 }
    );
    // Viewers hear about a start or a new round at once (the players' pages then open their boards).
    if (changed) this.events.stateChanged(id);
    return changed;
  }

  // ── helpers ──

  private async setPaused(accessToken: string | undefined, id: string, paused: boolean) {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForManager(user, id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tournament.updateMany({
        data: paused ? { pausedAt: new Date(), status: TournamentStatus.PAUSED, version: { increment: 1 } } : { pausedAt: null, status: TournamentStatus.LIVE, version: { increment: 1 } },
        where: { id, status: paused ? TournamentStatus.LIVE : TournamentStatus.PAUSED }
      });
      if (count === 0) throw new ConflictException(paused ? "Only a running tournament can be paused." : "The tournament isn't paused.");
      await this.audit.record(tx, { action: paused ? TournamentAuditAction.PAUSED : TournamentAuditAction.RESUMED, actorId: user.id, tournamentId: id });
    });
    return this.done(user, id);
  }

  private async setArenaPause(accessToken: string | undefined, id: string, paused: boolean) {
    const user = await this.access.authenticate(accessToken);
    const { tournament, playerRow } = await this.access.load(user, id);
    if (tournament.format !== TournamentFormat.ARENA) throw new BadRequestException("Only an arena has a pairing pool.");
    if (!playerRow || playerRow.status !== TournamentPlayerStatus.APPROVED) throw new NotFoundException("You're not playing in this arena.");
    const phase = resolveTournamentPhase(tournament);
    if (phase === "COMPLETED" || phase === "CANCELLED") throw new ConflictException("The arena is over.");
    await this.prisma.tournamentPlayer.update({ data: { arenaPausedAt: paused ? new Date() : null }, where: { id: playerRow.id } });
    this.events.stateChanged(id);
    return { paused };
  }

  /** A removed player's undecided knockout match goes to the opponent. */
  private async forfeitKnockout(tx: Tx, t: Tournament, playerId: string) {
    const match = await tx.tournamentKnockoutMatch.findFirst({
      where: { OR: [{ playerAId: playerId }, { playerBId: playerId }], status: { not: TournamentKnockoutMatchStatus.DECIDED }, tournamentId: t.id }
    });
    if (!match) return;
    const opponent = match.playerAId === playerId ? match.playerBId : match.playerAId;
    if (opponent) await this.engine.decideMatch(tx, t, match.id, opponent, TournamentKnockoutDecision.FORFEIT);
  }

  private withFilteredRanks(rows: StandingPlayerRow[], filtered: boolean): TournamentStandingDto[] {
    let position = 0;
    let lastRank: number | null = null;
    let lastFiltered: number | null = null;
    return rows.map((r) => {
      position += 1;
      const filteredRank = r.rank === null ? null : r.rank === lastRank ? lastFiltered : position;
      lastRank = r.rank;
      lastFiltered = filteredRank;
      return {
        ageGroup: r.ageGroup,
        draws: r.draws,
        filteredRank: filtered ? filteredRank : r.rank,
        losses: r.losses,
        onFire: r.onFire,
        performance: r.performance,
        played: r.played,
        player: toGamePlayer({ id: r.id, seedRating: r.seedRating, user: r.user }),
        playerId: r.id,
        points: r.points,
        rank: r.rank,
        status: r.status,
        streak: r.streak,
        tiebreaks: (r.tiebreaksJson ?? {}) as TournamentStandingDto["tiebreaks"],
        wins: r.wins
      };
    });
  }

  private async done(user: TournamentViewer, id: string): Promise<TournamentResponse> {
    this.events.stateChanged(id);
    return this.tournaments.detail(user, id);
  }
}
