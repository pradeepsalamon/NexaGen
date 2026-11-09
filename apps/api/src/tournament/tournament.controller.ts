import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  API_ROUTES,
  TOURNAMENT_IMAGE_MAX_BYTES,
  addTournamentPlayersRequestSchema,
  cancelTournamentRequestSchema,
  createTournamentRequestSchema,
  decideTournamentPlayerRequestSchema,
  publishTournamentRequestSchema,
  setTournamentHostsRequestSchema,
  tournamentFormatSchema,
  tournamentImageKindSchema,
  tournamentListTabSchema,
  updateTournamentRequestSchema,
  type AddTournamentPlayersRequest,
  type CancelTournamentRequest,
  type CreateTournamentRequest,
  type DecideTournamentPlayerRequest,
  type PaginatedQuery,
  type PublishTournamentRequest,
  type SetTournamentHostsRequest,
  type UpdateTournamentRequest
} from "@nexa-chess/types";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { optionalQueryEnum, optionalQueryString } from "../common/query-params";
import { RequireAccessTokenInterceptor } from "../common/security/require-access-token.interceptor";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { TournamentRegistrationService } from "./tournament-registration.service";
import { TournamentService } from "./tournament.service";

type ListQuery = PaginatedQuery & { tab?: unknown; format?: unknown };

/** Tournament lifecycle, discovery, hosts and registration (docs/TOURNAMENTS.md Phase 2). */
@RequireFeature("tournaments")
@Controller()
export class TournamentController {
  constructor(
    private readonly tournaments: TournamentService,
    private readonly registration: TournamentRegistrationService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // Static paths before `/tournaments/:id`.
  @Get(API_ROUTES.tournaments.capabilities)
  capabilities(@Req() request: Request) {
    return this.tournaments.capabilities(this.getAccessToken(request));
  }

  @Get(API_ROUTES.tournaments.list)
  list(@Req() request: Request, @Query() query: ListQuery) {
    const tab = optionalQueryEnum(query.tab, tournamentListTabSchema.options, "tab") ?? "upcoming";
    const format = optionalQueryEnum(query.format, tournamentFormatSchema.options, "format");
    return this.tournaments.list(this.getAccessToken(request), tab, {
      format,
      page: query.page,
      pageSize: query.pageSize,
      search: optionalQueryString(query.search, "search")
    });
  }

  @Post(API_ROUTES.tournaments.create)
  create(@Req() request: Request, @Body(new ZodBodyPipe(createTournamentRequestSchema)) body: CreateTournamentRequest) {
    return this.tournaments.create(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.tournaments.get())
  get(@Req() request: Request, @Param("id") id: string) {
    return this.tournaments.get(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.tournaments.update())
  update(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(updateTournamentRequestSchema)) body: UpdateTournamentRequest) {
    return this.tournaments.update(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.tournaments.delete())
  remove(@Req() request: Request, @Param("id") id: string) {
    return this.tournaments.delete(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.publish())
  @HttpCode(200)
  publish(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(publishTournamentRequestSchema)) body: PublishTournamentRequest) {
    return this.tournaments.publish(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.tournaments.cancel())
  @HttpCode(200)
  cancel(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(cancelTournamentRequestSchema)) body: CancelTournamentRequest) {
    return this.tournaments.cancel(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.tournaments.image())
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    RequireAccessTokenInterceptor,
    FileInterceptor("file", { limits: { fields: 2, fileSize: TOURNAMENT_IMAGE_MAX_BYTES, files: 1 } })
  )
  uploadImage(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("kind") kind: string,
    @UploadedFile() file: Express.Multer.File | undefined
  ) {
    return this.tournaments.uploadImage(this.getAccessToken(request), id, parseOrBadRequest(tournamentImageKindSchema, kind, "kind"), file);
  }

  @Delete(API_ROUTES.tournaments.image())
  removeImage(@Req() request: Request, @Param("id") id: string, @Param("kind") kind: string) {
    return this.tournaments.removeImage(this.getAccessToken(request), id, parseOrBadRequest(tournamentImageKindSchema, kind, "kind"));
  }

  @Get(API_ROUTES.tournaments.hostCandidates())
  hostCandidates(@Req() request: Request, @Param("id") id: string, @Query("search") search: unknown) {
    return this.tournaments.hostCandidates(this.getAccessToken(request), id, optionalQueryString(search, "search"));
  }

  @Put(API_ROUTES.tournaments.hosts())
  setHosts(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(setTournamentHostsRequestSchema)) body: SetTournamentHostsRequest) {
    return this.tournaments.setHosts(this.getAccessToken(request), id, body);
  }

  // ── registration ──

  @Get(API_ROUTES.tournaments.players())
  players(@Req() request: Request, @Param("id") id: string) {
    return this.registration.listPlayers(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.players())
  @HttpCode(200)
  addPlayers(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(addTournamentPlayersRequestSchema)) body: AddTournamentPlayersRequest) {
    return this.registration.addPlayers(this.getAccessToken(request), id, body);
  }

  @Patch(API_ROUTES.tournaments.player())
  decide(
    @Req() request: Request,
    @Param("id") id: string,
    @Param("playerId") playerId: string,
    @Body(new ZodBodyPipe(decideTournamentPlayerRequestSchema)) body: DecideTournamentPlayerRequest
  ) {
    return this.registration.decide(this.getAccessToken(request), id, playerId, body);
  }

  @Get(API_ROUTES.tournaments.candidates())
  candidates(@Req() request: Request, @Param("id") id: string, @Query("search") search: unknown) {
    return this.registration.candidates(this.getAccessToken(request), id, optionalQueryString(search, "search"));
  }

  @Post(API_ROUTES.tournaments.registration())
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  register(@Req() request: Request, @Param("id") id: string) {
    return this.registration.register(this.getAccessToken(request), id);
  }

  @Delete(API_ROUTES.tournaments.registration())
  withdraw(@Req() request: Request, @Param("id") id: string) {
    return this.registration.withdraw(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.invitationAccept())
  @HttpCode(200)
  acceptInvitation(@Req() request: Request, @Param("id") id: string) {
    return this.registration.acceptInvitation(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.invitationDecline())
  @HttpCode(200)
  declineInvitation(@Req() request: Request, @Param("id") id: string) {
    return this.registration.declineInvitation(this.getAccessToken(request), id);
  }
}
