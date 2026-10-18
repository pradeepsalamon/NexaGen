import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  addLiveSimulPlayerRequestSchema,
  liveSimulEngineMoveRequestSchema,
  liveSimulGameActionRequestSchema,
  liveSimulMoveRequestSchema,
  startLiveSimulRequestSchema,
  type AddLiveSimulPlayerRequest,
  type LiveSimulEngineMoveRequest,
  type LiveSimulGameActionRequest,
  type LiveSimulMoveRequest,
  type StartLiveSimulRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LiveClassSimulService } from "./live-class-simul.service";

@Controller()
export class LiveClassSimulController {
  constructor(private readonly service: LiveClassSimulService) {}

  @Post(API_ROUTES.liveClass.simul())
  start(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(startLiveSimulRequestSchema)) body: StartLiveSimulRequest,
    @Req() request: Request
  ) {
    return this.service.start(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.liveClass.simul())
  end(@Param("id") id: string, @Req() request: Request) {
    return this.service.end(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.simul())
  getCurrent(@Param("id") id: string, @Req() request: Request) {
    return this.service.getCurrent(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.simulPlayers())
  addPlayer(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(addLiveSimulPlayerRequestSchema)) body: AddLiveSimulPlayerRequest,
    @Req() request: Request
  ) {
    return this.service.addPlayer(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.simulMove())
  move(
    @Param("id") id: string,
    @Param("gameId") gameId: string,
    @Body(new ZodBodyPipe(liveSimulMoveRequestSchema)) body: LiveSimulMoveRequest,
    @Req() request: Request
  ) {
    return this.service.move(this.getAccessToken(request), id, gameId, body);
  }

  @Post(API_ROUTES.liveClass.simulEngineMove())
  engineMove(
    @Param("id") id: string,
    @Param("gameId") gameId: string,
    @Body(new ZodBodyPipe(liveSimulEngineMoveRequestSchema)) body: LiveSimulEngineMoveRequest,
    @Req() request: Request
  ) {
    return this.service.engineMove(this.getAccessToken(request), id, gameId, body);
  }

  @Post(API_ROUTES.liveClass.simulGameAction())
  action(
    @Param("id") id: string,
    @Param("gameId") gameId: string,
    @Body(new ZodBodyPipe(liveSimulGameActionRequestSchema)) body: LiveSimulGameActionRequest,
    @Req() request: Request
  ) {
    return this.service.action(this.getAccessToken(request), id, gameId, body);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
