import { Body, Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  playoutMoveRequestSchema,
  submitMcqAnswerRequestSchema,
  type PlayoutMoveRequest,
  type SubmitMcqAnswerRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { ActivityRunService } from "./activity-run.service";
import { PlayoutGameService } from "./playout-game.service";

@RequireFeature("interactiveClassroom", { allowReads: true })
@Controller()
export class ActivityRunController {
  constructor(
    private readonly runs: ActivityRunService,
    private readonly games: PlayoutGameService
  ) {}

  @Get(API_ROUTES.liveClass.activityRun())
  state(@Param("id") id: string, @Req() request: Request) {
    return this.runs.state(this.getAccessToken(request), id);
  }

  // ── Coach-owner / admin. Monitoring is GET only. ──

  @Get(API_ROUTES.liveClass.activityRunMonitor())
  monitor(@Param("id") id: string, @Param("runId") runId: string, @Req() request: Request) {
    return this.runs.monitor(this.getAccessToken(request), id, runId);
  }

  @Get(API_ROUTES.liveClass.activityRunGame())
  gameDetail(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Param("gameId") gameId: string,
    @Req() request: Request
  ) {
    return this.runs.gameDetail(this.getAccessToken(request), id, runId, gameId);
  }

  @Post(API_ROUTES.liveClass.activityRunEnd())
  @HttpCode(200)
  end(@Param("id") id: string, @Param("runId") runId: string, @Req() request: Request) {
    return this.runs.end(this.getAccessToken(request), id, runId);
  }

  @Post(API_ROUTES.liveClass.activityRunReveal())
  @HttpCode(200)
  reveal(@Param("id") id: string, @Param("runId") runId: string, @Req() request: Request) {
    return this.runs.reveal(this.getAccessToken(request), id, runId);
  }

  // ── Student, and only their own ──

  @Post(API_ROUTES.liveClass.mcqAnswers())
  @HttpCode(200)
  submitMcq(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Body(new ZodBodyPipe(submitMcqAnswerRequestSchema)) body: SubmitMcqAnswerRequest,
    @Req() request: Request
  ) {
    return this.runs.submitMcq(this.getAccessToken(request), id, runId, body);
  }

  @Post(API_ROUTES.liveClass.playoutStart())
  @HttpCode(200)
  startGame(@Param("id") id: string, @Param("runId") runId: string, @Req() request: Request) {
    return this.games.start(this.getAccessToken(request), id, runId);
  }

  @Post(API_ROUTES.liveClass.playoutMove())
  @HttpCode(200)
  move(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Param("gameId") gameId: string,
    @Body(new ZodBodyPipe(playoutMoveRequestSchema)) body: PlayoutMoveRequest,
    @Req() request: Request
  ) {
    return this.games.move(this.getAccessToken(request), id, runId, gameId, body);
  }

  @Post(API_ROUTES.liveClass.playoutContinue())
  @HttpCode(200)
  continueGame(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Param("gameId") gameId: string,
    @Req() request: Request
  ) {
    return this.games.continueGame(this.getAccessToken(request), id, runId, gameId);
  }

  @Post(API_ROUTES.liveClass.playoutHint())
  @HttpCode(200)
  hint(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Param("gameId") gameId: string,
    @Req() request: Request
  ) {
    return this.games.hint(this.getAccessToken(request), id, runId, gameId);
  }

  @Post(API_ROUTES.liveClass.playoutRetry())
  @HttpCode(200)
  retry(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Param("gameId") gameId: string,
    @Req() request: Request
  ) {
    return this.games.retry(this.getAccessToken(request), id, runId, gameId);
  }

  @Post(API_ROUTES.liveClass.playoutResign())
  @HttpCode(200)
  resign(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Param("gameId") gameId: string,
    @Req() request: Request
  ) {
    return this.games.resign(this.getAccessToken(request), id, runId, gameId);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
