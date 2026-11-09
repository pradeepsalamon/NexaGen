import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type CreateTournamentCommentaryRequest,
  type SetTournamentFeaturedRequest,
  type TournamentCommentaryDto,
  type TournamentCommentaryListResponse,
  type TournamentCommentaryResponse,
  type TournamentHighlight
} from "@nexa-chess/types";
import {
  Prisma,
  TournamentAuditAction,
  TournamentCommentaryType,
  TournamentGameStatus,
  type Tournament,
  type TournamentCommentary
} from "@prisma/client";
import { decodeCreatedAtCursor, encodeCreatedAtCursor } from "../common/cursor-pagination";
import { PrismaService } from "../prisma/prisma.service";
import { TournamentAccessService } from "./tournament-access.service";
import { TournamentAuditService } from "./tournament-audit.service";
import { TournamentEventsService } from "./tournament-events.service";
import { TournamentNotifierService } from "./tournament-notifier.service";
import { movesOf } from "./tournament-game.service";
import { personSelect, toPerson } from "./tournament-mapper";
import { canBroadcast, canModerateTournament } from "./tournament-policy";

const FEED_PAGE = 30;

const commentaryInclude = {
  author: { select: personSelect },
  game: {
    select: {
      blackPlayer: { select: { user: { select: { firstName: true, lastName: true } } } },
      id: true,
      whitePlayer: { select: { user: { select: { firstName: true, lastName: true } } } }
    }
  },
  player: { select: { id: true, user: { select: { firstName: true, lastName: true } } } }
} satisfies Prisma.TournamentCommentaryInclude;

type CommentaryRow = Prisma.TournamentCommentaryGetPayload<{ include: typeof commentaryInclude }>;

const nameOf = (u: { firstName: string; lastName: string | null }) => `${u.firstName} ${u.lastName ?? ""}`.trim();

/**
 * Host commentary and broadcasting (docs/TOURNAMENTS.md §3.5, Phase 6).
 *
 * Delay safety: every item has a `releaseAt`. Commentary on a game is released
 * when the position it talks about is visible to spectators (the move's time
 * plus the tournament's delay; "now plus the delay" for the current position
 * of a game in play); everything else at once. Viewers who aren't hosts only
 * get released items, and a player never gets commentary on their own game
 * while it is being played (no assistance by broadcast).
 */
@Injectable()
export class TournamentCommentaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentAccessService,
    private readonly audit: TournamentAuditService,
    private readonly events: TournamentEventsService,
    private readonly notifier: TournamentNotifierService
  ) {}

  async list(accessToken: string | undefined, id: string, cursor: string | undefined): Promise<TournamentCommentaryListResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, id);
    const broadcaster = canBroadcast(this.access.actor(user), loaded.facts);
    return this.feed(loaded.tournament, broadcaster, loaded.playerRow?.id ?? null, cursor);
  }

  /** The feed for one viewer (also the public projection's, as a non-broadcaster with no game). */
  async feed(
    t: Tournament,
    broadcaster: boolean,
    playerId: string | null,
    cursor: string | undefined
  ): Promise<TournamentCommentaryListResponse> {
    const now = new Date();
    const own = playerId
      ? await this.prisma.tournamentGame.findMany({
          select: { id: true },
          where: { OR: [{ whitePlayerId: playerId }, { blackPlayerId: playerId }], status: TournamentGameStatus.ONGOING, tournamentId: t.id }
        })
      : [];
    const visible: Prisma.TournamentCommentaryWhereInput = {
      tournamentId: t.id,
      ...(broadcaster ? {} : { hiddenAt: null, releaseAt: { lte: now } }),
      ...(own.length ? { NOT: { gameId: { in: own.map((g) => g.id) } } } : {})
    };
    let after: Prisma.TournamentCommentaryWhereInput = {};
    if (cursor) {
      const c = decodeCreatedAtCursor(cursor);
      after = { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] };
    }
    const [rows, pinned] = await Promise.all([
      this.prisma.tournamentCommentary.findMany({
        include: commentaryInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: FEED_PAGE + 1,
        where: { AND: [visible, after] }
      }),
      cursor
        ? Promise.resolve([] as CommentaryRow[])
        : this.prisma.tournamentCommentary.findMany({
            include: commentaryInclude,
            orderBy: [{ pinnedAt: "desc" }],
            take: 5,
            where: { AND: [visible, { pinnedAt: { not: null } }] }
          })
    ]);
    const page = rows.slice(0, FEED_PAGE);
    const last = page[page.length - 1];
    return {
      featured: { gameId: t.featuredGameId, playerId: t.featuredPlayerId },
      items: page.map((r) => this.toDto(r, broadcaster, now)),
      nextCursor: rows.length > FEED_PAGE && last ? encodeCreatedAtCursor(last) : null,
      pinned: pinned.map((r) => this.toDto(r, broadcaster, now))
    };
  }

  async create(accessToken: string | undefined, id: string, dto: CreateTournamentCommentaryRequest): Promise<TournamentCommentaryResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.loadForBroadcaster(user, id);
    // Idempotent on (author, clientId): a resend returns the first one.
    const existing = await this.prisma.tournamentCommentary.findUnique({
      include: commentaryInclude,
      where: { authorId_clientId: { authorId: user.id, clientId: dto.clientId } }
    });
    if (existing) return { item: this.toDto(existing, true, new Date()) };

    const releaseAt = await this.releaseAtFor(tournament, dto);
    if (dto.playerId) {
      const player = await this.prisma.tournamentPlayer.findFirst({ select: { id: true }, where: { id: dto.playerId, tournamentId: id } });
      if (!player) throw new NotFoundException("Player not found.");
    }
    try {
      const row = await this.prisma.tournamentCommentary.create({
        data: {
          authorId: user.id,
          body: dto.body,
          clientId: dto.clientId,
          fen: dto.fen ?? null,
          gameId: dto.gameId ?? null,
          highlightJson: (dto.highlight ?? undefined) as Prisma.InputJsonValue | undefined,
          // Emergency messages are always pinned.
          pinnedAt: dto.type === "EMERGENCY" || dto.pinned ? new Date() : null,
          playerId: dto.playerId ?? null,
          ply: dto.ply ?? null,
          releaseAt,
          tournamentId: id,
          type: dto.type
        },
        include: commentaryInclude
      });
      this.events.commentaryChanged(id, row.id);
      // Announcements and important messages also reach the players outside the page.
      if (dto.type === "ANNOUNCEMENT" || dto.type === "EMERGENCY") this.notifier.announcementInBackground(id, dto.body);
      return { item: this.toDto(row, true, new Date()) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const row = await this.prisma.tournamentCommentary.findUniqueOrThrow({
          include: commentaryInclude,
          where: { authorId_clientId: { authorId: user.id, clientId: dto.clientId } }
        });
        return { item: this.toDto(row, true, new Date()) };
      }
      throw error;
    }
  }

  async setPinned(accessToken: string | undefined, id: string, commentaryId: string, pinned: boolean): Promise<TournamentCommentaryResponse> {
    const user = await this.access.authenticate(accessToken);
    await this.access.loadForBroadcaster(user, id);
    const row = await this.findItem(id, commentaryId);
    const updated = await this.prisma.tournamentCommentary.update({
      data: { pinnedAt: pinned ? (row.pinnedAt ?? new Date()) : null },
      include: commentaryInclude,
      where: { id: commentaryId }
    });
    this.events.commentaryChanged(id, commentaryId);
    return { item: this.toDto(updated, true, new Date()) };
  }

  /** Moderation: hides an item from everyone but the hosts (HOST / admin only). Audited. */
  async hide(accessToken: string | undefined, id: string, commentaryId: string, reason: string): Promise<TournamentCommentaryResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, id);
    if (!canModerateTournament(this.access.actor(user), loaded.facts)) {
      throw new ForbiddenException("Only the tournament's host and academy admins can moderate commentary.");
    }
    await this.findItem(id, commentaryId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tournamentCommentary.updateMany({
        data: { hiddenAt: new Date(), hiddenById: user.id, hiddenReason: reason, pinnedAt: null },
        where: { hiddenAt: null, id: commentaryId }
      });
      if (count === 0) throw new ConflictException("This message is already hidden.");
      await this.audit.record(tx, {
        action: TournamentAuditAction.COMMENTARY_HIDDEN,
        actorId: user.id,
        reason,
        targetId: commentaryId,
        targetType: "TournamentCommentary",
        tournamentId: id
      });
      return tx.tournamentCommentary.findUniqueOrThrow({ include: commentaryInclude, where: { id: commentaryId } });
    });
    this.events.commentaryChanged(id, commentaryId);
    return { item: this.toDto(updated, true, new Date()) };
  }

  /** Featured game and/or player (any host role). Writes a FEATURED item so the archive shows the broadcast. */
  async setFeatured(accessToken: string | undefined, id: string, dto: SetTournamentFeaturedRequest): Promise<TournamentCommentaryListResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.loadForBroadcaster(user, id);
    let label: string | null = null;
    if (dto.gameId) {
      const game = await this.prisma.tournamentGame.findFirst({ select: commentaryInclude.game.select, where: { id: dto.gameId, tournamentId: id } });
      if (!game || !game.blackPlayer) throw new NotFoundException("Game not found.");
      label = `${nameOf(game.whitePlayer.user)} vs ${nameOf(game.blackPlayer.user)}`;
    }
    if (dto.playerId) {
      const player = await this.prisma.tournamentPlayer.findFirst({ include: { user: { select: { firstName: true, lastName: true } } }, where: { id: dto.playerId, tournamentId: id } });
      if (!player) throw new NotFoundException("Player not found.");
      label = label ?? nameOf(player.user);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.tournament.update({
        data: { featuredAt: new Date(), featuredGameId: dto.gameId ?? null, featuredPlayerId: dto.playerId ?? null },
        where: { id }
      });
      if (label) {
        await tx.tournamentCommentary.create({
          data: {
            authorId: user.id,
            body: dto.gameId ? `Featured game: ${label}` : `Following ${label}`,
            clientId: `featured-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            gameId: dto.gameId ?? null,
            playerId: dto.playerId ?? null,
            releaseAt: new Date(),
            tournamentId: id,
            type: TournamentCommentaryType.FEATURED
          }
        });
      }
    });
    this.events.stateChanged(id);
    return this.feed({ ...tournament, featuredGameId: dto.gameId ?? null, featuredPlayerId: dto.playerId ?? null }, true, null, undefined);
  }

  // ── helpers ──

  /** When spectators may read this item (docs/TOURNAMENTS.md §3.5). */
  private async releaseAtFor(t: Tournament, dto: CreateTournamentCommentaryRequest): Promise<Date> {
    const now = new Date();
    if (!dto.gameId) {
      if (dto.type === "MOVE") throw new BadRequestException("Move commentary needs a game.");
      return now;
    }
    const game = await this.prisma.tournamentGame.findFirst({ select: { movesJson: true, status: true }, where: { id: dto.gameId, tournamentId: t.id } });
    if (!game) throw new NotFoundException("Game not found.");
    const delayMs = t.spectatorDelaySec * 1000;
    const moves = movesOf(game.movesJson);
    if (dto.ply !== undefined && dto.ply !== null) {
      if (dto.ply > moves.length) throw new BadRequestException("That move hasn't been played.");
      // The position after ply N became visible N's time + the delay (the start position at once).
      const at = dto.ply === 0 ? 0 : moves[dto.ply - 1].at;
      return new Date(Math.max(now.getTime(), at + delayMs));
    }
    // About the game as a whole: if it is in play, about where it is now.
    return game.status === TournamentGameStatus.ONGOING ? new Date(now.getTime() + delayMs) : now;
  }

  private async findItem(tournamentId: string, id: string): Promise<TournamentCommentary> {
    const row = await this.prisma.tournamentCommentary.findFirst({ where: { id, tournamentId } });
    if (!row) throw new NotFoundException("Message not found.");
    return row;
  }

  private toDto(row: CommentaryRow, broadcaster: boolean, now: Date): TournamentCommentaryDto {
    const game = row.game
      ? { id: row.game.id, label: row.game.blackPlayer ? `${nameOf(row.game.whitePlayer.user)} vs ${nameOf(row.game.blackPlayer.user)}` : nameOf(row.game.whitePlayer.user) }
      : null;
    return {
      author: row.author ? toPerson(row.author) : null,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      fen: row.fen,
      game,
      hidden: broadcaster ? row.hiddenAt !== null : false,
      highlight: (row.highlightJson ?? null) as TournamentHighlight | null,
      id: row.id,
      pinned: row.pinnedAt !== null,
      player: row.player ? { id: row.player.id, name: nameOf(row.player.user) } : null,
      ply: row.ply,
      releaseAt: row.releaseAt.toISOString(),
      released: row.releaseAt.getTime() <= now.getTime(),
      type: row.type
    };
  }
}
