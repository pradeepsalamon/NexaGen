import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  markNotificationsReadRequestSchema,
  type MarkNotificationsReadRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { NotificationService } from "./notification.service";

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get(API_ROUTES.notifications.list)
  list(@Req() request: Request) {
    return this.notificationService.list(this.getAccessToken(request));
  }

  @Post(API_ROUTES.notifications.markRead)
  markRead(
    @Body(new ZodBodyPipe(markNotificationsReadRequestSchema)) body: MarkNotificationsReadRequest,
    @Req() request: Request
  ) {
    return this.notificationService.markRead(this.getAccessToken(request), body);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
