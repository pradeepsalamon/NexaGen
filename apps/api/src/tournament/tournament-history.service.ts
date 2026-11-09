import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  type AdminTournamentOverviewDto,
  type AdminTournamentRegistrationsResponse,
  type PaginatedQuery,
  type TournamentHistoryResponse
} from "@nexa-chess/types";
import {
  ApprovalStatus,
  TournamentEndReason,
  TournamentFormat,
  TournamentGameStatus,
  TournamentPlayerStatus,
  TournamentStatus
} from "@prisma/client";
import { isAdminRole } from "../auth/authenticate";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanViewStudent } from "../progress/student-access";
import { TournamentAccessService, type TournamentViewer } from "./tournament-access.service";
import { personSelect, playerInclude, summaryInclude, toPerson, toPlayer, toSummary } from "./tournament-mapper";

const PLAYED: TournamentPlayerStatus[] = [TournamentPlayerStatus.APPROVED, TournamentPlayerStatus.WITHDRAWN, TournamentPlayerStatus.DISQUALIFIED];

/**
 * A player's tournament history and the academy admin dashboard
 * (docs/TOURNAMENTS.md §3.7, Phase 8). History: the student themselves, a
 * coach for students of their own batches, and admins (`assertCanViewStudent`,
 * the same rule as the progress pages). The dashboard is admins only.
 */
@Injectable()
export class TournamentHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentAccessService
  ) {}

  async mine(accessToken: string | undefined): Promise<TournamentHistoryResponse> {
    const user = await this.access.authenticate(accessToken);
    return this.historyOf(user.id);
  }

  async student(accessToken: string | undefined, userId: string): Promise<TournamentHistoryResponse> {
    const user = await this.access.authenticate(accessToken);
    await assertCanViewStudent(this.prisma, user, userId);
    return this.historyOf(userId);
  }

  private async historyOf(userId: string): Promise<TournamentHistoryResponse> {
    const entries = await this.prisma.tournamentPlayer.findMany({
      include: { tournament: { include: summaryInclude } },
      orderBy: { tournament: { startsAt: "desc" } },
      where: { seedNumber: { not: null }, status: { in: PLAYED }, userId }
    });
    const certificates = await this.prisma.tournamentCertificate.findMany({
      include: { rule: { select: { kind: true } }, tournament: { select: { name: true } }, user: { select: personSelect } },
      where: { userId }
    });
    return {
      entries: entries.map((e) => ({
        certificates: certificates
          .filter((c) => c.tournamentId === e.tournamentId)
          .map((c) => ({
            id: c.id,
            issuedAt: c.issuedAt.toISOString(),
            kind: c.rule.kind,
            placement: (c.snapshotJson as { placement?: string }).placement ?? "",
            revokedAt: c.revokedAt?.toISOString() ?? null,
            revokedReason: c.revokedReason,
            serialNumber: c.serialNumber,
            tournamentId: c.tournamentId,
            tournamentName: c.tournament.name,
            user: toPerson(c.user),
            verificationCode: c.verificationCode
          })),
        draws: e.draws,
        losses: e.losses,
        performance: e.performance,
        played: e.played,
        points: e.points,
        pointsUnit: e.tournament.format === TournamentFormat.ARENA ? "arena-points" : "half-points",
        rank: e.rank,
        status: e.status,
        tournament: toSummary(e.tournament, e.status),
        wins: e.wins
      }))
    };
  }

  // ── admin dashboard ──

  async overview(accessToken: string | undefined): Promise<AdminTournamentOverviewDto> {
    await this.assertAdmin(accessToken);
    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const [byStatus, pendingRegistrations, pendingPublish, playersThisYear, finishedGames, forfeits, hosts, liveHosts, upcoming, live, recent] = await Promise.all([
      this.prisma.tournament.groupBy({ _count: { _all: true }, by: ["status"] }),
      this.prisma.tournamentPlayer.count({ where: { status: TournamentPlayerStatus.PENDING, tournament: { status: { in: [TournamentStatus.DRAFT, TournamentStatus.PUBLISHED] } } } }),
      this.prisma.approvalRequest.count({ where: { actionType: "TOURNAMENT_PUBLISH", status: ApprovalStatus.PENDING } }),
      this.prisma.tournamentPlayer.groupBy({ by: ["userId"], where: { seedNumber: { not: null }, tournament: { startedAt: { gte: yearStart } } } }),
      this.prisma.tournamentGame.count({ where: { blackPlayerId: { not: null }, status: TournamentGameStatus.FINISHED } }),
      this.prisma.tournamentGame.count({ where: { endReason: { in: [TournamentEndReason.FORFEIT, TournamentEndReason.NO_SHOW] }, status: TournamentGameStatus.FINISHED } }),
      this.prisma.tournamentHost.groupBy({ _count: { _all: true }, by: ["userId"] }),
      this.prisma.tournamentHost.groupBy({ _count: { _all: true }, by: ["userId"], where: { tournament: { status: { in: [TournamentStatus.LIVE, TournamentStatus.PAUSED] } } } }),
      this.prisma.tournament.findMany({ include: summaryInclude, orderBy: { startsAt: "asc" }, take: 5, where: { status: TournamentStatus.PUBLISHED } }),
      this.prisma.tournament.findMany({ include: summaryInclude, orderBy: { startsAt: "asc" }, take: 10, where: { status: { in: [TournamentStatus.LIVE, TournamentStatus.PAUSED] } } }),
      this.prisma.tournament.findMany({
        include: { ...summaryInclude, players: { include: { user: { select: personSelect } }, take: 1, where: { rank: 1 } } },
        orderBy: { endedAt: "desc" },
        take: 5,
        where: { status: TournamentStatus.COMPLETED }
      })
    ]);
    const counts = Object.fromEntries(Object.values(TournamentStatus).map((s) => [s, 0])) as AdminTournamentOverviewDto["counts"];
    for (const row of byStatus) counts[row.status] = row._count._all;
    const ended = counts.COMPLETED + counts.CANCELLED;
    const hostUsers = await this.prisma.user.findMany({ select: personSelect, where: { id: { in: hosts.map((h) => h.userId) } } });
    const liveBy = new Map(liveHosts.map((h) => [h.userId, h._count._all]));
    return {
      completionRate: ended > 0 ? counts.COMPLETED / ended : null,
      counts,
      forfeitRate: finishedGames > 0 ? forfeits / finishedGames : null,
      hosts: hosts
        .map((h) => ({ live: liveBy.get(h.userId) ?? 0, tournaments: h._count._all, user: hostUsers.find((u) => u.id === h.userId) }))
        .filter((h): h is { live: number; tournaments: number; user: NonNullable<(typeof hostUsers)[number]> } => !!h.user)
        .sort((a, b) => b.tournaments - a.tournaments)
        .slice(0, 20)
        .map((h) => ({ live: h.live, tournaments: h.tournaments, user: toPerson(h.user) })),
      live: live.map((t) => toSummary(t, null)),
      pendingPublishRequests: pendingPublish,
      pendingRegistrations,
      playersThisYear: playersThisYear.length,
      recent: recent.map((t) => ({ ...toSummary(t, null), champion: t.players[0] ? toPerson(t.players[0].user) : null })),
      upcoming: upcoming.map((t) => toSummary(t, null))
    };
  }

  /** Entries waiting for a host's approval, across every tournament of the academy. */
  async registrations(accessToken: string | undefined, query: PaginatedQuery): Promise<AdminTournamentRegistrationsResponse> {
    await this.assertAdmin(accessToken);
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where = { status: TournamentPlayerStatus.PENDING, tournament: { status: { in: [TournamentStatus.DRAFT, TournamentStatus.PUBLISHED] } } };
    const [rows, total] = await Promise.all([
      this.prisma.tournamentPlayer.findMany({
        include: { ...playerInclude, tournament: { select: { id: true, name: true, startsAt: true, status: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip,
        take,
        where
      }),
      this.prisma.tournamentPlayer.count({ where })
    ]);
    return {
      pagination: paginationMeta(total, page, pageSize),
      registrations: rows.map((r) => ({
        ...toPlayer(r),
        tournament: { id: r.tournament.id, name: r.tournament.name, startsAt: r.tournament.startsAt.toISOString(), status: r.tournament.status }
      }))
    };
  }

  private async assertAdmin(accessToken: string | undefined): Promise<TournamentViewer> {
    const user = await this.access.authenticate(accessToken);
    if (!isAdminRole(user.role)) throw new ForbiddenException("Only academy admins can open the tournament dashboard.");
    return user;
  }
}
