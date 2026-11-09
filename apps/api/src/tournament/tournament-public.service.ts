import { Injectable, NotFoundException } from "@nestjs/common";
import {
  formatPublicPlayerName,
  resolveTournamentPhase,
  type PaginatedQuery,
  type PublicTournamentCommentaryDto,
  type PublicTournamentDto,
  type PublicTournamentGameDto,
  type PublicTournamentListResponse,
  type PublicTournamentLiveDto,
  type PublicTournamentPlayer,
  type PublicTournamentStandingDto,
  type TournamentGamePlayerRef,
  type TournamentPublicNameFormat,
  type TournamentRealtimeTokenResponse,
  type TournamentStandingsResponse
} from "@nexa-chess/types";
import { Prisma, TournamentStatus, TournamentVisibility, type Tournament } from "@prisma/client";
import { randomBytes } from "crypto";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { TournamentCommentaryService } from "./tournament-commentary.service";
import { gameInclude, TournamentGameService } from "./tournament-game.service";
import { summaryInclude, toSummary } from "./tournament-mapper";
import { TournamentRealtimeService } from "./tournament-realtime.service";
import { TournamentRunnerService } from "./tournament-runner.service";
import { TournamentSettingsService } from "./tournament-settings.service";

/** Cached projections live this long per (tournament, version): many anonymous viewers, one query. */
const CACHE_MS = 1000;

const publicWhere: Prisma.TournamentWhereInput = {
  status: { not: TournamentStatus.DRAFT },
  visibility: TournamentVisibility.PUBLIC
};

/**
 * Anonymous spectating (docs/TOURNAMENTS.md §4.1, Phase 7). Only PUBLIC
 * tournaments of an academy that turned `allowAnonymousSpectating` on; anything
 * else is a 404. Every response is the public projection: players are a
 * per-tournament number, a public display name (`publicNameFormat`) and a
 * rating — never a user id, avatar, date of birth, batch or contact data.
 * Games are always the delayed spectator view; commentary only once released.
 */
@Injectable()
export class TournamentPublicService {
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TournamentSettingsService,
    private readonly runner: TournamentRunnerService,
    private readonly games: TournamentGameService,
    private readonly commentaryFeed: TournamentCommentaryService,
    private readonly realtime: TournamentRealtimeService
  ) {}

  async list(query: PaginatedQuery): Promise<PublicTournamentListResponse> {
    const format = await this.assertEnabled();
    const { page, pageSize, skip, take } = resolvePagination(query);
    const [rows, total] = await Promise.all([
      this.prisma.tournament.findMany({ include: summaryInclude, orderBy: [{ startsAt: "desc" }, { id: "asc" }], skip, take, where: publicWhere }),
      this.prisma.tournament.count({ where: publicWhere })
    ]);
    return { items: rows.map((r) => this.toPublic(r, format)), pagination: paginationMeta(total, page, pageSize) };
  }

  async get(id: string): Promise<{ tournament: PublicTournamentDto }> {
    const format = await this.assertEnabled();
    const row = await this.load(id);
    return { tournament: this.toPublic(row, format) };
  }

  async live(id: string): Promise<PublicTournamentLiveDto> {
    const format = await this.assertEnabled();
    const row = await this.load(id);
    return this.cached(`live:${id}`, async () => {
      const snapshot = await this.runner.liveFor(row, null);
      const name = (p: TournamentGamePlayerRef) => this.player(p, format);
      return {
        currentRound: snapshot.currentRound,
        featuredGameId: row.featuredGameId,
        leaders: snapshot.leaders.map((s) => this.standing(s, format)),
        nextRoundAt: snapshot.nextRoundAt,
        ongoingGames: snapshot.ongoingGames.map((g) => ({ ...g, black: g.black ? name(g.black) : null, white: name(g.white) })),
        serverNow: snapshot.serverNow,
        totalRounds: snapshot.totalRounds,
        tournament: this.toPublic(row, format),
        version: snapshot.version
      };
    });
  }

  async standings(id: string): Promise<{ standings: PublicTournamentStandingDto[]; pointsUnit: TournamentStandingsResponse["pointsUnit"] }> {
    const format = await this.assertEnabled();
    const row = await this.load(id);
    return this.cached(`standings:${id}`, async () => {
      const rows = await this.prisma.tournamentPlayer.findMany({
        orderBy: [{ rank: { nulls: "last", sort: "asc" } }, { seedNumber: "asc" }],
        select: { ageGroup: true, draws: true, losses: true, onFire: true, played: true, points: true, rank: true, seedNumber: true, seedRating: true, status: true, streak: true, tiebreaksJson: true, user: { select: { firstName: true, lastName: true } }, wins: true },
        where: { seedNumber: { not: null }, status: { in: ["APPROVED", "WITHDRAWN", "DISQUALIFIED"] }, tournamentId: id }
      });
      return {
        pointsUnit: row.format === "ARENA" ? ("arena-points" as const) : ("half-points" as const),
        standings: rows.map((r) => ({
          ageGroup: r.ageGroup,
          draws: r.draws,
          filteredRank: r.rank,
          losses: r.losses,
          onFire: r.onFire,
          played: r.played,
          player: { name: formatPublicPlayerName(r.user.firstName, r.user.lastName, format), number: r.seedNumber, rating: r.seedRating },
          points: r.points,
          rank: r.rank,
          status: r.status,
          streak: r.streak,
          tiebreaks: (r.tiebreaksJson ?? {}) as PublicTournamentStandingDto["tiebreaks"],
          wins: r.wins
        }))
      };
    });
  }

  /** Always the delayed spectator view. */
  async game(id: string, gameId: string): Promise<{ game: PublicTournamentGameDto }> {
    const format = await this.assertEnabled();
    const row = await this.load(id);
    const game = await this.prisma.tournamentGame.findFirst({ include: gameInclude, where: { id: gameId, tournamentId: id } });
    if (!game) throw new NotFoundException("Game not found.");
    const dto = this.games.toDto(game, row, null, false);
    const { tournamentId: _t, viewerColor: _v, ...rest } = dto;
    return {
      game: { ...rest, black: dto.black ? this.player(dto.black, format) : null, white: this.player(dto.white, format) }
    };
  }

  async commentary(id: string, cursor: string | undefined): Promise<{ items: PublicTournamentCommentaryDto[]; pinned: PublicTournamentCommentaryDto[]; nextCursor: string | null }> {
    const format = await this.assertEnabled();
    const row = await this.load(id);
    const feed = await this.commentaryFeed.feed(row, false, null, cursor);
    const project = (item: (typeof feed.items)[number]): PublicTournamentCommentaryDto => {
      const { hidden: _h, author, player, ...rest } = item;
      const split = (full: string) => {
        const [first, ...last] = full.split(" ");
        return formatPublicPlayerName(first ?? "", last.join(" ") || null, format);
      };
      return { ...rest, author: author ? { name: split(author.name) } : null, player: player ? { name: split(player.name) } : null };
    };
    return { items: feed.items.map(project), nextCursor: feed.nextCursor, pinned: feed.pinned.map(project) };
  }

  async realtimeToken(id: string): Promise<TournamentRealtimeTokenResponse> {
    await this.assertEnabled();
    await this.load(id);
    return this.realtime.token(id, { identity: `anon_${randomBytes(8).toString("hex")}`, name: "Spectator" });
  }

  // ── helpers ──

  private async assertEnabled(): Promise<TournamentPublicNameFormat> {
    const settings = await this.settings.policySettings();
    if (!settings.allowAnonymousSpectating) throw new NotFoundException("Tournament not found.");
    return settings.publicNameFormat;
  }

  private async load(id: string) {
    const row = await this.prisma.tournament.findFirst({ include: summaryInclude, where: { ...publicWhere, id } });
    if (!row) throw new NotFoundException("Tournament not found.");
    return row;
  }

  private player(p: TournamentGamePlayerRef, format: TournamentPublicNameFormat): PublicTournamentPlayer {
    const [first, ...last] = p.name.split(" ");
    return { name: formatPublicPlayerName(first ?? "", last.join(" ") || null, format), number: null, rating: p.rating };
  }

  private standing(s: { player: TournamentGamePlayerRef } & Omit<PublicTournamentStandingDto, "player"> & { playerId: string; performance: number | null }, format: TournamentPublicNameFormat): PublicTournamentStandingDto {
    const { player, playerId: _p, performance: _perf, ...rest } = s;
    return { ...rest, player: this.player(player, format) };
  }

  private toPublic(row: Parameters<typeof toSummary>[0] & Tournament, format: TournamentPublicNameFormat): PublicTournamentDto {
    const summary = toSummary(row, null);
    return {
      arenaDurationMin: summary.arenaDurationMin,
      arenaEndsAt: row.arenaEndsAt?.toISOString() ?? null,
      bannerUrl: summary.bannerUrl,
      description: row.description,
      format: summary.format,
      hosts: row.hosts.map((h) => ({ name: formatPublicPlayerName(h.user.firstName, h.user.lastName, format), role: h.role })),
      id: summary.id,
      logoUrl: summary.logoUrl,
      maxPlayers: summary.maxPlayers,
      name: summary.name,
      phase: resolveTournamentPhase(row),
      playerCount: summary.playerCount,
      prizesText: row.prizesText,
      rounds: summary.rounds,
      rulesText: row.rulesText,
      slug: summary.slug,
      spectatorDelaySec: row.spectatorDelaySec,
      startsAt: summary.startsAt,
      status: summary.status,
      timeControl: summary.timeControl
    };
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const full = `${requireTenantId("publicTournamentCache")}:${key}`;
    const hit = this.cache.get(full);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
    const value = await load();
    this.cache.set(full, { at: Date.now(), value });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value as string);
    return value;
  }
}
