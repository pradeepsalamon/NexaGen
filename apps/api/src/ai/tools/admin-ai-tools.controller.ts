import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { API_ROUTES, runAssistantToolSchema, type RunAssistantToolRequest } from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../../auth/types";
import { ZodBodyPipe } from "../../common/zod-body.pipe";
import { AdminAiToolsService } from "./admin-ai-tools.service";

@Controller()
export class AdminAiToolsController {
  constructor(private readonly tools: AdminAiToolsService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.adminAi.tools)
  list(@Req() request: Request) {
    return this.tools.list(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminAi.runTool)
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  run(@Req() request: Request, @Body(new ZodBodyPipe(runAssistantToolSchema)) body: RunAssistantToolRequest) {
    return this.tools.run(this.getAccessToken(request), body);
  }
}
