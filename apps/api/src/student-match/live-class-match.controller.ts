import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  liveMatchChallengeRequestSchema,
  liveMatchChallengeResponseRequestSchema,
  liveMatchGameActionRequestSchema,
  liveMatchMoveRequestSchema,
  liveMatchPairRequestSchema,
  startLiveMatchRoundRequestSchema,
  updateLiveMatchRoundRequestSchema,
  type LiveMatchChallengeRequest,
  type LiveMatchChallengeResponseRequest,
  type LiveMatchGameActionRequest,
  type LiveMatchMoveRequest,
  type LiveMatchPairRequest,
  type StartLiveMatchRoundRequest,
  type UpdateLiveMatchRoundRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LiveClassMatchService } from "./live-class-match.service";

@Controller()
export class LiveClassMatchController {
  constructor(private readonly service: LiveClassMatchService) {}

  @Post(API_ROUTES.liveClass.matchRound())
  start(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(startLiveMatchRoundRequestSchema)) body: StartLiveMatchRoundRequest,
    @Req() request: Request
  ) {
    return this.service.start(this.getAccessToken(request), id, body);
  }

  @Patch(API_ROUTES.liveClass.matchRound())
  update(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateLiveMatchRoundRequestSchema)) body: UpdateLiveMatchRoundRequest,
    @Req() request: Request
  ) {
    return this.service.update(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.liveClass.matchRound())
  end(@Param("id") id: string, @Req() request: Request) {
    return this.service.end(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.matchRound())
  getCurrent(@Param("id") id: string, @Req() request: Request) {
    return this.service.getCurrent(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.matchPairs())
  pair(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(liveMatchPairRequestSchema)) body: LiveMatchPairRequest,
    @Req() request: Request
  ) {
    return this.service.pair(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.matchChallenges())
  challenge(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(liveMatchChallengeRequestSchema)) body: LiveMatchChallengeRequest,
    @Req() request: Request
  ) {
    return this.service.challenge(this.getAccessToken(request), id, body);
  }

  @Patch(API_ROUTES.liveClass.matchChallenge())
  respondToChallenge(
    @Param("id") id: string,
    @Param("challengeId") challengeId: string,
    @Body(new ZodBodyPipe(liveMatchChallengeResponseRequestSchema)) body: LiveMatchChallengeResponseRequest,
    @Req() request: Request
  ) {
    return this.service.respondToChallenge(this.getAccessToken(request), id, challengeId, body);
  }

  @Post(API_ROUTES.liveClass.matchMove())
  move(
    @Param("id") id: string,
    @Param("gameId") gameId: string,
    @Body(new ZodBodyPipe(liveMatchMoveRequestSchema)) body: LiveMatchMoveRequest,
    @Req() request: Request
  ) {
    return this.service.move(this.getAccessToken(request), id, gameId, body);
  }

  @Post(API_ROUTES.liveClass.matchGameAction())
  action(
    @Param("id") id: string,
    @Param("gameId") gameId: string,
    @Body(new ZodBodyPipe(liveMatchGameActionRequestSchema)) body: LiveMatchGameActionRequest,
    @Req() request: Request
  ) {
    return this.service.action(this.getAccessToken(request), id, gameId, body);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
