import { Body, Controller, Delete, Get, Param, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  reportPuzzleRushProgressRequestSchema,
  startPuzzleRushRequestSchema,
  type ReportPuzzleRushProgressRequest,
  type StartPuzzleRushRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LiveClassPuzzleRushService } from "./live-class-puzzle-rush.service";
import { RequireFeature } from "../platform/require-feature.decorator";

@RequireFeature("interactiveClassroom", { allowReads: true })
@Controller()
export class LiveClassPuzzleRushController {
  constructor(private readonly service: LiveClassPuzzleRushService) {}

  @Get(API_ROUTES.liveClass.puzzleRush())
  getCurrent(@Param("id") id: string, @Req() request: Request) {
    return this.service.getCurrent(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.puzzleRush())
  start(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(startPuzzleRushRequestSchema)) body: StartPuzzleRushRequest,
    @Req() request: Request
  ) {
    return this.service.start(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.liveClass.puzzleRush())
  end(@Param("id") id: string, @Req() request: Request) {
    return this.service.end(this.getAccessToken(request), id);
  }

  @Put(API_ROUTES.liveClass.puzzleRushProgress())
  reportProgress(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(reportPuzzleRushProgressRequestSchema)) body: ReportPuzzleRushProgressRequest,
    @Req() request: Request
  ) {
    return this.service.reportProgress(this.getAccessToken(request), id, body);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
