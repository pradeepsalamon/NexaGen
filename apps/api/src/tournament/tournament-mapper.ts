import {
  parseTournamentEligibility,
  resolveTournamentPhase,
  tournamentArenaConfigSchema,
  tournamentKnockoutConfigSchema,
  type TournamentDetailDto,
  type TournamentHostDto,
  type TournamentPersonRef,
  type TournamentPlayerDto,
  type TournamentSummaryDto,
  type TournamentViewerDto
} from "@nexa-chess/types";
import { roundScheduleOf } from "./tournament-engine.service";
import { Prisma, TournamentHostRole, TournamentPlayerStatus, type Tournament, type TournamentPlayer } from "@prisma/client";

export const personSelect = { avatarUrl: true, firstName: true, id: true, lastName: true } as const;
type PersonRow = { avatarUrl: string | null; firstName: string; id: string; lastName: string | null };

export function toPerson(user: PersonRow): TournamentPersonRef {
  return { avatarUrl: user.avatarUrl, id: user.id, name: `${user.firstName} ${user.lastName ?? ""}`.trim() };
}

/** What the list and detail mappers need beyond the tournament row. */
export const summaryInclude = {
  _count: { select: { players: { where: { status: TournamentPlayerStatus.APPROVED } } } },
  hosts: { include: { user: { select: personSelect } }, orderBy: { createdAt: "asc" } }
} satisfies Prisma.TournamentInclude;

export type SummaryRow = Prisma.TournamentGetPayload<{ include: typeof summaryInclude }>;

const HOST_ORDER: TournamentHostRole[] = [TournamentHostRole.HOST, TournamentHostRole.CO_HOST, TournamentHostRole.COMMENTATOR];

export function toSummary(row: SummaryRow, myStatus: TournamentPlayerStatus | null, now = new Date()): TournamentSummaryDto {
  const host = [...row.hosts].sort((a, b) => HOST_ORDER.indexOf(a.role) - HOST_ORDER.indexOf(b.role))[0];
  return {
    arenaDurationMin: row.arenaDurationMin,
    bannerUrl: row.bannerUrl,
    format: row.format,
    host: host ? toPerson(host.user) : null,
    id: row.id,
    logoUrl: row.logoUrl,
    maxPlayers: row.maxPlayers,
    myStatus,
    name: row.name,
    phase: resolveTournamentPhase(row, now),
    playerCount: row._count.players,
    rounds: row.rounds,
    slug: row.slug,
    startsAt: row.startsAt.toISOString(),
    status: row.status,
    timeControl: { incrementSeconds: row.clockIncrementMs / 1000, initialSeconds: row.clockInitialMs / 1000 },
    visibility: row.visibility
  };
}

export function toDetail(
  row: SummaryRow,
  viewer: TournamentViewerDto,
  pendingPublishRequestId: string | null,
  now = new Date()
): TournamentDetailDto {
  const arena = tournamentArenaConfigSchema.safeParse(row.arenaConfigJson ?? undefined);
  const knockout = tournamentKnockoutConfigSchema.safeParse(row.knockoutConfigJson ?? undefined);
  const hosts: TournamentHostDto[] = row.hosts.map((h) => ({ ...toPerson(h.user), role: h.role }));
  return {
    ...toSummary(row, viewer.myStatus, now),
    arenaConfig: row.arenaConfigJson && arena.success ? arena.data : null,
    cancelReason: row.cancelReason,
    description: row.description,
    eligibility: parseTournamentEligibility(row.eligibilityJson),
    endedAt: row.endedAt?.toISOString() ?? null,
    hosts,
    knockoutConfig: row.knockoutConfigJson && knockout.success ? knockout.data : null,
    lateRegistrationRounds: row.lateRegistrationRounds,
    minPlayers: row.minPlayers,
    pendingPublishRequestId: viewer.canManage ? pendingPublishRequestId : null,
    prizesText: row.prizesText,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    registrationClosesAt: row.registrationClosesAt?.toISOString() ?? null,
    registrationOpensAt: row.registrationOpensAt?.toISOString() ?? null,
    registrationRequiresApproval: row.registrationRequiresApproval,
    resultsPublishedAt: row.resultsPublishedAt?.toISOString() ?? null,
    roundBreakSec: row.roundBreakSec,
    roundSchedule: roundScheduleOf(row),
    roundStartMode: row.roundStartMode,
    rulesText: row.rulesText,
    spectatorDelaySec: row.spectatorDelaySec,
    startFen: row.startFen,
    startedAt: row.startedAt?.toISOString() ?? null,
    tiebreaks: row.tiebreaks,
    version: row.version,
    viewer
  };
}

export const playerInclude = { user: { select: personSelect } } satisfies Prisma.TournamentPlayerInclude;
export type PlayerRow = TournamentPlayer & { user: PersonRow };

export function toPlayer(row: PlayerRow): TournamentPlayerDto {
  return {
    ageGroup: row.ageGroup,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    id: row.id,
    registeredAt: row.createdAt.toISOString(),
    seedNumber: row.seedNumber,
    seedRating: row.seedRating,
    seedRatingSource: row.seedRatingSource,
    status: row.status,
    user: toPerson(row.user)
  };
}

/** The tournament's stored clock as the shared time-control shape. */
export function timeControlOf(t: Pick<Tournament, "clockInitialMs" | "clockIncrementMs">) {
  return { incrementSeconds: t.clockIncrementMs / 1000, initialSeconds: t.clockInitialMs / 1000 };
}
