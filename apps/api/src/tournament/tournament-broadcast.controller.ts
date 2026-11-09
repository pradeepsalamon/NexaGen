import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  createTournamentCommentaryRequestSchema,
  hideTournamentCommentaryRequestSchema,
  pinTournamentCommentaryRequestSchema,
  setTournamentFeaturedRequestSchema,
  type CreateTournamentCommentaryRequest,
  type HideTournamentCommentaryRequest,
  type SetTournamentFeaturedRequest
} from "@nexa-chess/types";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { optionalQueryString } from "../common/query-params";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { TournamentAccessService } from "./tournament-access.service";
import { TournamentCommentaryService } from "./tournament-commentary.service";
import { TournamentRealtimeService, viewerIdentity } from "./tournament-realtime.service";

/** Commentary, featured games and the real-time token (docs/TOURNAMENTS.md Phase 6). */
@RequireFeature("tournaments")
@Controller()
export class TournamentBroadcastController {
  constructor(
    private readonly commentary: TournamentCommentaryService,
    private readonly realtime: TournamentRealtimeService,
    private readonly access: TournamentAccessService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.tournaments.commentary())
  list(@Req() request: Request, @Param("id") id: string, @Query("cursor") cursor: unknown) {
    return this.commentary.list(this.getAccessToken(request), id, optionalQueryString(cursor, "cursor"));
  }

  @Post(API_ROUTES.tournaments.commentary())
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  create(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(createTournamentCommentaryRequestSchema)) body: CreateTournamentCommentaryRequest) {
    return this.commentary.create(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.tournaments.commentaryPin())
  @HttpCode(200)
  pin(@Req() request: Request, @Param("id") id: string, @Param("itemId") itemId: string, @Body(new ZodBodyPipe(pinTournamentCommentaryRequestSchema)) body: { pinned: boolean }) {
    return this.commentary.setPinned(this.getAccessToken(request), id, itemId, body.pinned);
  }

  @Post(API_ROUTES.tournaments.commentaryHide())
  @HttpCode(200)
  hide(@Req() request: Request, @Param("id") id: string, @Param("itemId") itemId: string, @Body(new ZodBodyPipe(hideTournamentCommentaryRequestSchema)) body: HideTournamentCommentaryRequest) {
    return this.commentary.hide(this.getAccessToken(request), id, itemId, body.reason);
  }

  @Put(API_ROUTES.tournaments.featured())
  setFeatured(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(setTournamentFeaturedRequestSchema)) body: SetTournamentFeaturedRequest) {
    return this.commentary.setFeatured(this.getAccessToken(request), id, body);
  }

  /** A hidden receive-only seat in the tournament's LiveKit room (nudges only). */
  @Post(API_ROUTES.tournaments.realtimeToken())
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async realtimeToken(@Req() request: Request, @Param("id") id: string) {
    const user = await this.access.authenticate(this.getAccessToken(request));
    await this.access.load(user, id);
    return this.realtime.token(id, { identity: viewerIdentity(user.id), name: `${user.firstName} ${user.lastName ?? ""}`.trim() });
  }
}
