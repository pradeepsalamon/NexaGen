import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  answerLiveMovePollRequestSchema,
  startLiveMovePollRequestSchema,
  updateLiveMovePollRequestSchema,
  type AnswerLiveMovePollRequest,
  type StartLiveMovePollRequest,
  type UpdateLiveMovePollRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LiveClassMovePollService } from "./live-class-move-poll.service";
import { RequireFeature } from "../platform/require-feature.decorator";

@RequireFeature("interactiveClassroom", { allowReads: true })
@Controller()
export class LiveClassMovePollController {
  constructor(private readonly service: LiveClassMovePollService) {}

  @Post(API_ROUTES.liveClass.movePoll())
  start(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(startLiveMovePollRequestSchema)) body: StartLiveMovePollRequest,
    @Req() request: Request
  ) {
    return this.service.start(this.getAccessToken(request), id, body);
  }

  @Patch(API_ROUTES.liveClass.movePoll())
  update(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateLiveMovePollRequestSchema)) body: UpdateLiveMovePollRequest,
    @Req() request: Request
  ) {
    return this.service.update(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.liveClass.movePoll())
  end(@Param("id") id: string, @Req() request: Request) {
    return this.service.end(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.movePoll())
  getCurrent(@Param("id") id: string, @Req() request: Request) {
    return this.service.getCurrent(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.movePollAnswer())
  answer(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(answerLiveMovePollRequestSchema)) body: AnswerLiveMovePollRequest,
    @Req() request: Request
  ) {
    return this.service.answer(this.getAccessToken(request), id, body);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
