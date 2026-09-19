import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  assignLivePuzzleRequestSchema,
  type AssignLivePuzzleRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LiveClassPuzzleService } from "./live-class-puzzle.service";

@Controller()
export class LiveClassPuzzleController {
  constructor(private readonly service: LiveClassPuzzleService) {}

  @Post(API_ROUTES.liveClass.puzzle())
  assign(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(assignLivePuzzleRequestSchema)) body: AssignLivePuzzleRequest,
    @Req() request: Request
  ) {
    return this.service.assign(this.token(request), id, body);
  }

  @Delete(API_ROUTES.liveClass.puzzle())
  end(@Param("id") id: string, @Req() request: Request) {
    return this.service.end(this.token(request), id);
  }

  @Get(API_ROUTES.liveClass.puzzle())
  getCurrent(@Param("id") id: string, @Req() request: Request) {
    return this.service.getCurrent(this.token(request), id);
  }

  @Post(API_ROUTES.liveClass.puzzleAttempt())
  startAttempt(@Param("id") id: string, @Req() request: Request) {
    return this.service.startAttempt(this.token(request), id);
  }

  @Get(API_ROUTES.liveClass.puzzleLeaderboard())
  leaderboard(@Param("id") id: string, @Req() request: Request) {
    return this.service.leaderboard(this.token(request), id);
  }

  @Get(API_ROUTES.liveClass.puzzleBoards())
  boards(@Param("id") id: string, @Req() request: Request) {
    return this.service.boards(this.token(request), id);
  }

  private token(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
