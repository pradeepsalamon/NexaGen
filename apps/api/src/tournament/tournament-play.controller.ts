import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  removeTournamentPlayerRequestSchema,
  tournamentGameActionRequestSchema,
  tournamentGameDecisionRequestSchema,
  tournamentMoveRequestSchema,
  tournamentStandingsQuerySchema,
  type PaginatedQuery,
  type RemoveTournamentPlayerRequest,
  type TournamentGameActionRequest,
  type TournamentGameDecisionRequest,
  type TournamentMoveRequest
} from "@nexa-chess/types";
import { Throttle } from "@nestjs/throttler";
import { TournamentGameStatus } from "@prisma/client";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { optionalQueryEnum, optionalQueryString } from "../common/query-params";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { TournamentGameService } from "./tournament-game.service";
import { TournamentRunnerService } from "./tournament-runner.service";

/** Running and playing a tournament (docs/TOURNAMENTS.md Phases 3–5). */
@RequireFeature("tournaments")
@Controller()
export class TournamentPlayController {
  constructor(
    private readonly runner: TournamentRunnerService,
    private readonly games: TournamentGameService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // ── host controls ──

  @Post(API_ROUTES.tournaments.start())
  @HttpCode(200)
  start(@Req() request: Request, @Param("id") id: string) {
    return this.runner.start(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.pause())
  @HttpCode(200)
  pause(@Req() request: Request, @Param("id") id: string) {
    return this.runner.pause(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.resume())
  @HttpCode(200)
  resume(@Req() request: Request, @Param("id") id: string) {
    return this.runner.resume(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.nextRound())
  @HttpCode(200)
  nextRound(@Req() request: Request, @Param("id") id: string) {
    return this.runner.nextRound(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.finish())
  @HttpCode(200)
  finish(@Req() request: Request, @Param("id") id: string) {
    return this.runner.finish(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.publishResults())
  @HttpCode(200)
  publishResults(@Req() request: Request, @Param("id") id: string) {
    return this.runner.publishResults(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.withdrawPlayer())
  @HttpCode(200)
  removePlayer(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("playerId") playerId: string,
    @Body(new ZodBodyPipe(removeTournamentPlayerRequestSchema)) body: RemoveTournamentPlayerRequest
  ) {
    return this.runner.removePlayer(this.getAccessToken(request), id, playerId, body);
  }

  @Post(API_ROUTES.tournaments.recomputeStandings())
  @HttpCode(200)
  recompute(@Req() request: Request, @Param("id") id: string) {
    return this.runner.recompute(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.tournaments.audit())
  audit(@Req() request: Request, @Param("id") id: string, @Query() query: PaginatedQuery) {
    return this.runner.auditLog(this.getAccessToken(request), id, query);
  }

  // ── views ──

  @Get(API_ROUTES.tournaments.live())
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  live(@Req() request: Request, @Param("id") id: string) {
    return this.runner.live(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.tournaments.standings())
  standings(@Req() request: Request, @Param("id") id: string, @Query() query: Record<string, unknown>) {
    return this.runner.standings(this.getAccessToken(request), id, parseOrBadRequest(tournamentStandingsQuerySchema, query, "query"));
  }

  @Get(API_ROUTES.tournaments.rounds())
  rounds(@Req() request: Request, @Param("id") id: string) {
    return this.games.rounds(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.tournaments.bracket())
  bracket(@Req() request: Request, @Param("id") id: string) {
    return this.games.bracket(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.tournaments.games())
  listGames(@Req() request: Request, @Param("id") id: string, @Query() query: PaginatedQuery & { status?: unknown; round?: unknown; playerId?: unknown }) {
    const round = optionalQueryString(query.round, "round");
    if (round !== undefined && !/^\d{1,3}$/.test(round)) throw new BadRequestException("round must be a round number.");
    return this.games.list(this.getAccessToken(request), id, {
      page: query.page,
      pageSize: query.pageSize,
      playerId: optionalQueryString(query.playerId, "playerId"),
      round: round === undefined ? undefined : Number(round),
      status: optionalQueryEnum(query.status, TournamentGameStatus, "status")
    });
  }

  @Get(API_ROUTES.tournaments.myGame())
  myGame(@Req() request: Request, @Param("id") id: string) {
    return this.games.mine(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.tournaments.game())
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  game(@Req() request: Request, @Param("id") id: string, @Param("gameId") gameId: string) {
    return this.games.get(this.getAccessToken(request), id, gameId);
  }

  // ── play ──

  // Bullet chess can go over the global 100/min: moves get their own budget.
  @Post(API_ROUTES.tournaments.gameMove())
  @HttpCode(200)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  move(@Req() request: Request, @Param("id") id: string, @Param("gameId") gameId: string, @Body(new ZodBodyPipe(tournamentMoveRequestSchema)) body: TournamentMoveRequest) {
    return this.games.move(this.getAccessToken(request), id, gameId, body);
  }

  @Post(API_ROUTES.tournaments.gameAction())
  @HttpCode(200)
  action(@Req() request: Request, @Param("id") id: string, @Param("gameId") gameId: string, @Body(new ZodBodyPipe(tournamentGameActionRequestSchema)) body: TournamentGameActionRequest) {
    return this.games.action(this.getAccessToken(request), id, gameId, body);
  }

  @Post(API_ROUTES.tournaments.gameDecision())
  @HttpCode(200)
  decide(@Req() request: Request, @Param("id") id: string, @Param("gameId") gameId: string, @Body(new ZodBodyPipe(tournamentGameDecisionRequestSchema)) body: TournamentGameDecisionRequest) {
    return this.games.decide(this.getAccessToken(request), id, gameId, body);
  }

  @Post(API_ROUTES.tournaments.arenaJoin())
  @HttpCode(200)
  arenaJoin(@Req() request: Request, @Param("id") id: string) {
    return this.runner.arenaJoin(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.arenaLeave())
  @HttpCode(200)
  arenaLeave(@Req() request: Request, @Param("id") id: string) {
    return this.runner.arenaLeave(this.getAccessToken(request), id);
  }
}
