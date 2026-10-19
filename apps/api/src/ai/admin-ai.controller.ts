import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { API_ROUTES, adminAiEchoRequestSchema, type AdminAiEchoRequest } from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { AdminAiService } from "./admin-ai.service";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

@Controller()
export class AdminAiController {
  constructor(private readonly adminAi: AdminAiService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  /** The id pino-http gave this request, so both services' log lines share it. */
  private getRequestId(request: Request): string {
    const id = (request as Request & { id?: unknown }).id;
    return typeof id === "string" && REQUEST_ID_PATTERN.test(id) ? id : randomUUID();
  }

  @Get(API_ROUTES.adminAi.status)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  status(@Req() request: Request) {
    return this.adminAi.status(this.getAccessToken(request), this.getRequestId(request));
  }

  @Post(API_ROUTES.adminAi.echo)
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  echo(@Req() request: Request, @Body(new ZodBodyPipe(adminAiEchoRequestSchema)) body: AdminAiEchoRequest) {
    return this.adminAi.echo(this.getAccessToken(request), this.getRequestId(request), body);
  }
}
