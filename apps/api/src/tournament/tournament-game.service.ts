import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  TOURNAMENT_CLOCK_START_PLY,
  TOURNAMENT_FIRST_MOVE_SECONDS,
  tournamentArenaConfigSchema,
  type PaginatedQuery,
  type TournamentBracketResponse,
  type TournamentGameActionRequest,
  type TournamentGameDecisionRequest,
  type TournamentGameDto,
  type TournamentGamePlayerRef,
  type TournamentGameResponse,
  type TournamentGameSummaryDto,
  type TournamentGamesResponse,
  type TournamentMoveRequest,
  type TournamentRoundsResponse
} from "@nexa-chess/types";
import {
  MatchColor,
  Prisma,
  TournamentAuditAction,
  TournamentEndReason,
  TournamentFormat,
  TournamentGameResult,
  TournamentGameStatus,
  TournamentKnockoutMatchStatus,
  TournamentResultSource,
  TournamentStatus,
  type Tournament
} from "@prisma/client";
import { Chess } from "../common/chess/chess";
import {
  clockAfterMove,
  outcomeAfterMove,
  playUciMove,
  remainingClockMs,
  replayGame,
  resignationOutcome,
  sideToMove,
  timeoutOutcome,
  type GameOutcome
} from "../common/chess/game-engine";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { TournamentAccessService } from "./tournament-access.service";
import { TournamentAuditService } from "./tournament-audit.service";
import { halfPointsOf, TournamentEngineService } from "./tournament-engine.service";
import { TournamentEventsService } from "./tournament-events.service";
import { canBroadcast, canManageTournament } from "./tournament-policy";

/** A stored move: SAN, UCI, server time (epoch ms) and the mover's clock after it. */
export type StoredMove = { san: string; uci: string; at: number; clockMs: number };

const playerSelect = {
  id: true,
  seedRating: true,
  user: { select: { avatarUrl: true, firstName: true, id: true, lastName: true } }
} as const;

export const gameInclude = {
  blackPlayer: { select: playerSelect },
  whitePlayer: { select: playerSelect }
} satisfies Prisma.TournamentGameInclude;

type GameRow = Prisma.TournamentGameGetPayload<{ include: typeof gameInclude }>;
type PlayerRow = NonNullable<GameRow["blackPlayer"]>;
type Color = "white" | "black";

const PLAYABLE: TournamentStatus[] = [TournamentStatus.LIVE, TournamentStatus.PAUSED];

export function toGamePlayer(p: PlayerRow): TournamentGamePlayerRef {
  return {
    avatarUrl: p.user.avatarUrl,
    name: `${p.user.firstName} ${p.user.lastName ?? ""}`.trim(),
    playerId: p.id,
    rating: p.seedRating,
    userId: p.user.id
  };
}

export function movesOf(value: Prisma.JsonValue): StoredMove[] {
  return Array.isArray(value) ? (value as unknown as StoredMove[]) : [];
}

export function toGameSummary(g: GameRow): TournamentGameSummaryDto {
  return {
    black: g.blackPlayer ? toGamePlayer(g.blackPlayer) : null,
    blackHalfPoints: g.blackHalfPoints,
    board: g.boardNumber,
    byeKind: g.byeKind,
    endReason: g.endReason,
    finishedAt: g.finishedAt?.toISOString() ?? null,
    gameNumber: g.gameNumber,
    id: g.id,
    knockoutMatchId: g.knockoutMatchId,
    ply: g.ply,
    result: g.result,
    roundNumber: g.roundNumber,
    startedAt: g.startedAt.toISOString(),
    status: g.status,
    white: toGamePlayer(g.whitePlayer),
    whiteHalfPoints: g.whiteHalfPoints
  };
}

/**
 * Tournament games (docs/TOURNAMENTS.md Phase 4): moves and actions by the two
 * players, host decisions, and the views. Every move is validated on the
 * server by the shared game engine and claimed on `ply` + status. A
 * transaction that can finish a game locks the tournament row first, then the
 * game (one lock order everywhere, so a move and a host decision never
 * deadlock). Non-players see moves only after the tournament's spectator delay.
 */
@Injectable()
export class TournamentGameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentAccessService,
    private readonly engine: TournamentEngineService,
    private readonly audit: TournamentAuditService,
    private readonly events: TournamentEventsService
  ) {}

  // ── views ──

  async get(accessToken: string | undefined, tournamentId: string, gameId: string): Promise<TournamentGameResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, tournamentId);
    const game = await this.findGame(tournamentId, gameId);
    const live = canBroadcast(this.access.actor(user), loaded.facts) || this.colorOf(game, user.id) !== null;
    return { game: this.toDto(game, loaded.tournament, user.id, live) };
  }

  /** The viewer's live game in this tournament, if any (for "Play now"). */
  async mine(accessToken: string | undefined, tournamentId: string): Promise<{ gameId: string | null }> {
    const user = await this.access.authenticate(accessToken);
    const { playerRow } = await this.access.load(user, tournamentId);
    return { gameId: playerRow?.currentGameId ?? null };
  }

  async list(
    accessToken: string | undefined,
    tournamentId: string,
    query: PaginatedQuery & { status?: TournamentGameStatus; round?: number; playerId?: string }
  ): Promise<TournamentGamesResponse & { pagination: ReturnType<typeof paginationMeta> }> {
    const user = await this.access.authenticate(accessToken);
    await this.access.load(user, tournamentId);
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.TournamentGameWhereInput = {
      tournamentId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.round !== undefined ? { roundNumber: query.round } : {}),
      ...(query.playerId ? { OR: [{ whitePlayerId: query.playerId }, { blackPlayerId: query.playerId }] } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.tournamentGame.findMany({
        include: gameInclude,
        orderBy: [{ roundNumber: "desc" }, { boardNumber: "asc" }, { gameNumber: "asc" }],
        skip,
        take,
        where
      }),
      this.prisma.tournamentGame.count({ where })
    ]);
    return { games: rows.map(toGameSummary), pagination: paginationMeta(total, page, pageSize) };
  }

  async rounds(accessToken: string | undefined, tournamentId: string): Promise<TournamentRoundsResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.load(user, tournamentId);
    const rounds = await this.prisma.tournamentRound.findMany({
      include: { games: { include: gameInclude, orderBy: [{ boardNumber: "asc" }, { gameNumber: "asc" }] } },
      orderBy: { number: "asc" },
      where: { tournamentId }
    });
    const knockoutGames =
      tournament.format === TournamentFormat.KNOCKOUT
        ? await this.prisma.tournamentGame.findMany({ include: gameInclude, orderBy: [{ boardNumber: "asc" }, { gameNumber: "asc" }], where: { tournamentId } })
        : [];
    return {
      rounds: rounds.map((r) => ({
        completedAt: r.completedAt?.toISOString() ?? null,
        games: (tournament.format === TournamentFormat.KNOCKOUT ? knockoutGames.filter((g) => g.roundNumber === r.number) : r.games).map(toGameSummary),
        number: r.number,
        startedAt: r.startedAt.toISOString(),
        status: r.status
      })),
      totalRounds: await this.engine.totalRounds(this.prisma as unknown as PrismaTransactionClient, tournament)
    };
  }

  async bracket(accessToken: string | undefined, tournamentId: string): Promise<TournamentBracketResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.load(user, tournamentId);
    if (tournament.format !== TournamentFormat.KNOCKOUT) throw new NotFoundException("This tournament has no bracket.");
    const [matches, players] = await Promise.all([
      this.prisma.tournamentKnockoutMatch.findMany({
        include: { games: { orderBy: { gameNumber: "asc" }, select: { blackHalfPoints: true, id: true, whiteHalfPoints: true, whitePlayerId: true } } },
        orderBy: [{ bracketRound: "asc" }, { slot: "asc" }],
        where: { tournamentId }
      }),
      this.prisma.tournamentPlayer.findMany({ select: playerSelect, where: { tournamentId } })
    ]);
    const byId = new Map(players.map((p) => [p.id, toGamePlayer(p)]));
    const rounds = matches.reduce((max, m) => Math.max(max, m.bracketRound), 0);
    return {
      matches: matches.map((m) => {
        let a = 0;
        let b = 0;
        for (const g of m.games) {
          const aWhite = g.whitePlayerId === m.playerAId;
          a += (aWhite ? g.whiteHalfPoints : g.blackHalfPoints) ?? 0;
          b += (aWhite ? g.blackHalfPoints : g.whiteHalfPoints) ?? 0;
        }
        return {
          a: m.playerAId ? (byId.get(m.playerAId) ?? null) : null,
          b: m.playerBId ? (byId.get(m.playerBId) ?? null) : null,
          bracketRound: m.bracketRound,
          decidedBy: m.decidedBy,
          gameIds: m.games.map((g) => g.id),
          id: m.id,
          score: { a, b },
          slot: m.slot,
          status: m.status,
          winnerPlayerId: m.winnerId
        };
      }),
      rounds
    };
  }

  // ── play ──

  async move(accessToken: string | undefined, tournamentId: string, gameId: string, dto: TournamentMoveRequest): Promise<TournamentGameResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.load(user, tournamentId);
    const game = await this.findGame(tournamentId, gameId);
    const color = this.colorOf(game, user.id);
    if (!color) throw new ForbiddenException("Only the two players can move.");
    this.assertPlayable(tournament, game);
    if (game.ply !== dto.ply) throw new ConflictException("The board changed. Refresh and try again.");
    if (sideToMove({ fen: game.fen, ongoing: true }) !== color) throw new BadRequestException("It is not your move.");

    const now = new Date();
    const left = this.remaining(game, color, now);
    if (left <= 0) {
      await this.finish(tournament, game, timeoutOutcome(game.fen, color), TournamentEndReason.TIMEOUT, { ply: game.ply });
      return this.reload(tournament, gameId, user.id);
    }
    const chess = replayGame(game.startFen, movesOf(game.movesJson), game.fen);
    const played = playUciMove(chess, dto.uci);
    if (!played) throw new BadRequestException("That move is not legal.");

    const berserk = color === "white" ? game.whiteBerserk : game.blackBerserk;
    const clockMs = clockAfterMove(left, game.ply, berserk ? 0 : tournament.clockIncrementMs, TOURNAMENT_CLOCK_START_PLY) ?? left;
    const move: StoredMove = { at: now.getTime(), clockMs, san: played.san, uci: played.uci };
    const outcome = outcomeAfterMove(chess, color);
    const data: Prisma.TournamentGameUpdateManyMutationInput = {
      [color === "white" ? "whiteClockMs" : "blackClockMs"]: clockMs,
      drawOfferedBy: null,
      fen: chess.fen(),
      // The opponent's first move is now due (only during the first two plies).
      firstMoveDeadline: game.ply === 0 ? new Date(now.getTime() + TOURNAMENT_FIRST_MOVE_SECONDS * 1000) : null,
      movesJson: [...movesOf(game.movesJson), move] as unknown as Prisma.InputJsonValue,
      ply: game.ply + 1,
      turnSince: now
    };

    if (!outcome) {
      const { count } = await this.prisma.tournamentGame.updateMany({ data, where: { id: gameId, ply: game.ply, status: TournamentGameStatus.ONGOING } });
      if (count === 0) throw new ConflictException("The board changed. Refresh and try again.");
    } else {
      // The move ends the game: tournament lock first, then the claim, then the result funnel.
      await this.prisma.$transaction(async (tx) => {
        const t = await this.engine.lockTournament(tx, tournamentId);
        const { count } = await tx.tournamentGame.updateMany({ data, where: { id: gameId, ply: game.ply, status: TournamentGameStatus.ONGOING } });
        if (count === 0) throw new ConflictException("The board changed. Refresh and try again.");
        await this.engine.finishGame(tx, t, gameId, this.outcomeInput(outcome), { ply: game.ply + 1 });
      });
      this.events.stateChanged(tournamentId);
    }
    this.events.gameChanged(tournamentId, gameId);
    if (!outcome) {
      // Wake the clock exactly when the opponent's time (or first-move window) runs out.
      const opponentMs = color === "white" ? game.blackClockMs : game.whiteClockMs;
      const due = game.ply + 1 < TOURNAMENT_CLOCK_START_PLY ? now.getTime() + TOURNAMENT_FIRST_MOVE_SECONDS * 1000 : now.getTime() + opponentMs;
      this.events.deadlineAt(tournamentId, due);
    }
    return this.reload(tournament, gameId, user.id);
  }

  async action(
    accessToken: string | undefined,
    tournamentId: string,
    gameId: string,
    dto: TournamentGameActionRequest
  ): Promise<TournamentGameResponse> {
    const user = await this.access.authenticate(accessToken);
    const { tournament } = await this.access.load(user, tournamentId);
    const game = await this.findGame(tournamentId, gameId);
    const color = this.colorOf(game, user.id);
    if (!color) throw new ForbiddenException("Only the two players can do that.");
    this.assertPlayable(tournament, game);
    const mine = color === "white" ? MatchColor.WHITE : MatchColor.BLACK;
    const theirs = color === "white" ? MatchColor.BLACK : MatchColor.WHITE;

    switch (dto.action) {
      case "RESIGN":
        await this.finish(tournament, game, resignationOutcome(color), TournamentEndReason.RESIGNATION, { ply: game.ply });
        break;
      case "OFFER_DRAW":
        if (game.drawOfferedBy === theirs) {
          await this.finish(tournament, game, { endReason: "DRAW_AGREED", result: "DRAW" }, TournamentEndReason.DRAW_AGREED, { ply: game.ply });
        } else {
          await this.patch(game, { drawOfferedBy: mine });
        }
        break;
      case "ACCEPT_DRAW":
        if (game.drawOfferedBy !== theirs) throw new BadRequestException("There is no draw offer to accept.");
        await this.finish(tournament, game, { endReason: "DRAW_AGREED", result: "DRAW" }, TournamentEndReason.DRAW_AGREED, { ply: game.ply });
        break;
      case "DECLINE_DRAW":
        if (game.drawOfferedBy !== theirs) throw new BadRequestException("There is no draw offer to decline.");
        await this.patch(game, { drawOfferedBy: null });
        break;
      case "CLAIM_TIMEOUT": {
        const toMove = sideToMove({ fen: game.fen, ongoing: true })!;
        if (this.remaining(game, toMove, new Date()) > 0) throw new BadRequestException("Time has not run out.");
        await this.finish(tournament, game, timeoutOutcome(game.fen, toMove), TournamentEndReason.TIMEOUT, { ply: game.ply });
        break;
      }
      case "BERSERK": {
        const arena = tournamentArenaConfigSchema.safeParse(tournament.arenaConfigJson ?? {});
        if (tournament.format !== TournamentFormat.ARENA || !arena.success || !arena.data.berserk) {
          throw new BadRequestException("Berserk isn't available in this tournament.");
        }
        const myMoves = movesOf(game.movesJson).filter((_, i) => (color === "white" ? i % 2 === 0 : i % 2 === 1)).length;
        if (myMoves > 0) throw new ConflictException("Berserk is only possible before your first move.");
        if (color === "white" ? game.whiteBerserk : game.blackBerserk) throw new ConflictException("You already went berserk.");
        const half = Math.floor(tournament.clockInitialMs / 2);
        await this.patch(game, color === "white" ? { whiteBerserk: true, whiteClockMs: half } : { blackBerserk: true, blackClockMs: half });
        break;
      }
    }
    this.events.gameChanged(tournamentId, gameId);
    return this.reload(tournament, gameId, user.id);
  }

  // ── host decisions ──

  /**
   * An ongoing game: the host decides it (forfeit / adjudication). A finished
   * game: the host corrects the result (needs the game's `version`); the
   * standings are recomputed and both values go in the audit log.
   */
  async decide(
    accessToken: string | undefined,
    tournamentId: string,
    gameId: string,
    dto: TournamentGameDecisionRequest
  ): Promise<TournamentGameResponse> {
    const user = await this.access.authenticate(accessToken);
    const loaded = await this.access.load(user, tournamentId);
    if (!canManageTournament(this.access.actor(user), loaded.facts)) {
      throw new ForbiddenException("Only this tournament's hosts and academy admins can decide games.");
    }
    const game = await this.findGame(tournamentId, gameId);
    if (!game.blackPlayerId) throw new ConflictException("A bye has no result to decide.");

    await this.prisma.$transaction(async (tx) => {
      const t = await this.engine.lockTournament(tx, tournamentId);
      const fresh = await tx.tournamentGame.findUniqueOrThrow({ where: { id: gameId } });
      if (fresh.status === TournamentGameStatus.ONGOING) {
        if (!PLAYABLE.includes(t.status)) throw new ConflictException("The tournament isn't running.");
        const finished = await this.engine.finishGame(
          tx,
          t,
          gameId,
          {
            endReason: fresh.ply < 2 ? TournamentEndReason.FORFEIT : TournamentEndReason.ADJUDICATED,
            result: dto.result,
            source: TournamentResultSource.HOST
          },
          { actorId: user.id }
        );
        if (!finished) throw new ConflictException("The game just ended. Reload it.");
        await this.audit.record(tx, {
          action: fresh.ply < 2 ? TournamentAuditAction.GAME_FORFEITED : TournamentAuditAction.GAME_ADJUDICATED,
          actorId: user.id,
          after: { result: dto.result },
          reason: dto.reason,
          targetId: gameId,
          targetType: "TournamentGame",
          tournamentId
        });
        return;
      }
      // A correction of a finished game.
      if (dto.version === undefined) throw new BadRequestException("Send the game's version to correct its result.");
      if (fresh.knockoutMatchId) {
        const match = await tx.tournamentKnockoutMatch.findUniqueOrThrow({ where: { id: fresh.knockoutMatchId } });
        const later = await tx.tournamentGame.count({ where: { gameNumber: { gt: fresh.gameNumber }, knockoutMatchId: match.id } });
        if (match.status === TournamentKnockoutMatchStatus.DECIDED || later > 0) {
          throw new ConflictException("This knockout match has moved on; its earlier results can't be changed.");
        }
      }
      if (t.status === TournamentStatus.CANCELLED) throw new ConflictException("The tournament was cancelled.");
      const [wp, bp] = halfPointsOf(dto.result);
      const { count } = await tx.tournamentGame.updateMany({
        data: { blackHalfPoints: bp, result: dto.result, resultSource: TournamentResultSource.CORRECTION, version: { increment: 1 }, whiteHalfPoints: wp },
        where: { id: gameId, status: TournamentGameStatus.FINISHED, version: dto.version }
      });
      if (count === 0) throw new ConflictException("Someone else changed this game. Reload it and try again.");
      await this.engine.recomputeStandings(tx, t);
      await this.audit.record(tx, {
        action: TournamentAuditAction.RESULT_CORRECTED,
        actorId: user.id,
        after: { result: dto.result },
        before: { result: fresh.result },
        reason: dto.reason,
        targetId: gameId,
        targetType: "TournamentGame",
        tournamentId
      });
    });
    this.events.gameChanged(tournamentId, gameId);
    this.events.stateChanged(tournamentId);
    return this.reload(loaded.tournament, gameId, user.id);
  }

  // ── sweeper (no user) ──

  /** When the next flag falls or first-move window closes in this tournament (epoch ms), if any game is on. */
  async nextDeadline(tournamentId: string): Promise<number | null> {
    const ongoing = await this.prisma.tournamentGame.findMany({
      select: { blackClockMs: true, fen: true, firstMoveDeadline: true, ply: true, turnSince: true, whiteClockMs: true },
      where: { status: TournamentGameStatus.ONGOING, tournamentId }
    });
    let next: number | null = null;
    for (const game of ongoing) {
      let due: number | null;
      if (game.ply < TOURNAMENT_CLOCK_START_PLY) due = game.firstMoveDeadline?.getTime() ?? null;
      else due = game.turnSince.getTime() + (sideToMove({ fen: game.fen, ongoing: true }) === "white" ? game.whiteClockMs : game.blackClockMs);
      if (due !== null && (next === null || due < next)) next = due;
    }
    return next;
  }

  /** Flags and no-shows of one tournament's games. Run inside the tournament's academy. */
  async sweep(tournamentId: string, now = new Date()): Promise<number> {
    const ongoing = await this.prisma.tournamentGame.findMany({
      include: gameInclude,
      where: { status: TournamentGameStatus.ONGOING, tournamentId }
    });
    let finished = 0;
    for (const game of ongoing) {
      const toMove = sideToMove({ fen: game.fen, ongoing: true })!;
      let outcome: GameOutcome | null = null;
      let reason: TournamentEndReason | null = null;
      if (game.ply < TOURNAMENT_CLOCK_START_PLY && game.firstMoveDeadline && game.firstMoveDeadline <= now) {
        // The side to move never made its first move.
        outcome = { endReason: "TIMEOUT", result: toMove === "white" ? "BLACK_WON" : "WHITE_WON" };
        reason = TournamentEndReason.NO_SHOW;
      } else if (this.remaining(game, toMove, now) <= 0) {
        outcome = timeoutOutcome(game.fen, toMove);
        reason = TournamentEndReason.TIMEOUT;
      }
      if (!outcome || !reason) continue;
      try {
        const t = await this.prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
        await this.finish(t, game, outcome, reason, { ply: game.ply });
        this.events.gameChanged(tournamentId, game.id);
        finished += 1;
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    return finished;
  }

  // ── helpers ──

  private async finish(
    tournament: Tournament,
    game: GameRow,
    outcome: GameOutcome,
    endReason: TournamentEndReason,
    options: { ply?: number } = {}
  ) {
    const now = new Date();
    const toMove = sideToMove({ fen: game.fen, ongoing: true });
    const extra: Prisma.TournamentGameUpdateManyMutationInput = {};
    if (toMove) {
      // Freeze the clock of the side to move at what was left.
      extra[toMove === "white" ? "whiteClockMs" : "blackClockMs"] = Math.max(0, this.remaining(game, toMove, now));
    }
    // An arena no-show is void (no points), and the absent player leaves the pool.
    const voided = tournament.format === TournamentFormat.ARENA && endReason === TournamentEndReason.NO_SHOW;
    let done = false;
    await this.prisma.$transaction(async (tx) => {
      const t = await this.engine.lockTournament(tx, tournament.id);
      done = await this.engine.finishGame(
        tx,
        t,
        game.id,
        {
          endReason,
          result: voided ? (outcome.result === "BLACK_WON" ? TournamentGameResult.BLACK_WON : TournamentGameResult.WHITE_WON) : (outcome.result ?? TournamentGameResult.NO_RESULT),
          source: TournamentResultSource.ENGINE
        },
        { extra, ply: options.ply }
      );
      if (done && voided) {
        // Void it after the funnel recorded who was absent: no points either way.
        await tx.tournamentGame.update({ data: { blackHalfPoints: 0, result: TournamentGameResult.NO_RESULT, whiteHalfPoints: 0 }, where: { id: game.id } });
        await this.engine.recomputeStandings(tx, t);
      }
    });
    if (!done) throw new ConflictException("The game changed. Refresh and try again.");
    this.events.stateChanged(tournament.id);
  }

  private async patch(game: GameRow, data: Prisma.TournamentGameUpdateManyMutationInput) {
    const { count } = await this.prisma.tournamentGame.updateMany({
      data,
      where: { id: game.id, ply: game.ply, status: TournamentGameStatus.ONGOING }
    });
    if (count === 0) throw new ConflictException("The game changed. Refresh and try again.");
  }

  private outcomeInput(outcome: GameOutcome) {
    return {
      endReason: outcome.endReason as TournamentEndReason,
      result: (outcome.result ?? TournamentGameResult.NO_RESULT) as TournamentGameResult,
      source: TournamentResultSource.ENGINE
    };
  }

  private assertPlayable(tournament: Tournament, game: GameRow) {
    if (game.status !== TournamentGameStatus.ONGOING) throw new BadRequestException("This game is over.");
    if (!PLAYABLE.includes(tournament.status)) throw new ConflictException("The tournament isn't running.");
  }

  private remaining(game: GameRow, color: Color, now: Date): number {
    return (
      remainingClockMs(
        { blackClockMs: game.blackClockMs, fen: game.fen, ongoing: game.status === TournamentGameStatus.ONGOING, ply: game.ply, turnSince: game.turnSince, whiteClockMs: game.whiteClockMs },
        color,
        now,
        TOURNAMENT_CLOCK_START_PLY
      ) ?? Number.POSITIVE_INFINITY
    );
  }

  private colorOf(game: GameRow, userId: string): Color | null {
    if (game.whitePlayer.user.id === userId) return "white";
    if (game.blackPlayer?.user.id === userId) return "black";
    return null;
  }

  private async findGame(tournamentId: string, gameId: string): Promise<GameRow> {
    const game = await this.prisma.tournamentGame.findFirst({ include: gameInclude, where: { id: gameId, tournamentId } });
    if (!game) throw new NotFoundException("Game not found.");
    return game;
  }

  private async reload(tournament: Tournament, gameId: string, userId: string): Promise<TournamentGameResponse> {
    const game = await this.findGame(tournament.id, gameId);
    return { game: this.toDto(game, tournament, userId, true) };
  }

  /**
   * The game as one viewer sees it. `live` (players, hosts, admins): every
   * move. Everyone else: only moves older than the spectator delay, the
   * position and clocks rebuilt at that point, and the result held back until
   * the delay has passed too.
   */
  toDto(game: GameRow, tournament: Pick<Tournament, "clockInitialMs" | "clockIncrementMs" | "spectatorDelaySec">, viewerUserId: string | null, live: boolean): TournamentGameDto {
    const now = Date.now();
    const all = movesOf(game.movesJson);
    const cutoff = now - tournament.spectatorDelaySec * 1000;
    const finishedVisible = game.status === TournamentGameStatus.FINISHED && (game.finishedAt?.getTime() ?? 0) <= cutoff;
    const delayed = !live && tournament.spectatorDelaySec > 0 && !finishedVisible;
    const moves = delayed ? all.filter((m) => m.at <= cutoff) : all;

    let fen = game.fen;
    let whiteMs = game.whiteClockMs;
    let blackMs = game.blackClockMs;
    let turnSince = game.turnSince;
    let status = game.status;
    if (delayed) {
      fen = replayFrom(game.startFen, moves);
      const lastOf = (parity: number) => [...moves.keys()].filter((i) => i % 2 === parity).map((i) => moves[i]).pop();
      whiteMs = lastOf(0)?.clockMs ?? (game.whiteBerserk ? Math.floor(tournament.clockInitialMs / 2) : tournament.clockInitialMs);
      blackMs = lastOf(1)?.clockMs ?? (game.blackBerserk ? Math.floor(tournament.clockInitialMs / 2) : tournament.clockInitialMs);
      turnSince = new Date(moves[moves.length - 1]?.at ?? game.startedAt.getTime());
      status = TournamentGameStatus.ONGOING;
    }
    const ongoing = status === TournamentGameStatus.ONGOING;
    const toMove = ongoing ? sideToMove({ fen, ongoing: true }) : null;
    const running = toMove && moves.length >= TOURNAMENT_CLOCK_START_PLY && !delayed ? toMove : null;
    const color = viewerUserId ? (game.whitePlayer.user.id === viewerUserId ? "white" : game.blackPlayer?.user.id === viewerUserId ? "black" : null) : null;
    return {
      berserk: { black: game.blackBerserk, white: game.whiteBerserk },
      black: game.blackPlayer ? toGamePlayer(game.blackPlayer) : null,
      blackHalfPoints: delayed ? null : game.blackHalfPoints,
      board: game.boardNumber,
      byeKind: game.byeKind,
      clock: {
        blackMs,
        incrementMs: tournament.clockIncrementMs,
        initialMs: tournament.clockInitialMs,
        running,
        serverNow: new Date(now).toISOString(),
        turnSince: turnSince.toISOString(),
        whiteMs
      },
      delayed,
      drawOfferedBy: delayed || !game.drawOfferedBy ? null : game.drawOfferedBy === MatchColor.WHITE ? "white" : "black",
      endReason: delayed ? null : game.endReason,
      fen,
      finishedAt: delayed ? null : (game.finishedAt?.toISOString() ?? null),
      firstMoveDeadline: delayed ? null : (game.firstMoveDeadline?.toISOString() ?? null),
      gameNumber: game.gameNumber,
      id: game.id,
      knockoutMatchId: game.knockoutMatchId,
      moves: moves.map((m) => ({ san: m.san, uci: m.uci })),
      ply: moves.length,
      result: delayed ? null : game.result,
      resultSource: delayed ? null : game.resultSource,
      roundNumber: game.roundNumber,
      startFen: game.startFen,
      startedAt: game.startedAt.toISOString(),
      status,
      tournamentId: game.tournamentId,
      version: game.version,
      viewerColor: color,
      white: toGamePlayer(game.whitePlayer),
      whiteHalfPoints: delayed ? null : game.whiteHalfPoints
    };
  }
}

/** The position after `moves` from `startFen` (moves were validated when played). */
function replayFrom(startFen: string, moves: readonly StoredMove[]): string {
  const chess = new Chess(startFen);
  for (const m of moves) {
    if (!playUciMove(chess, m.uci)) break;
  }
  return chess.fen();
}
