import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import {
  API_ROUTES,
  createAnnouncementRequestSchema,
  type CreateAnnouncementRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { AnnouncementService } from "./announcement.service";

@Controller()
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Get(API_ROUTES.announcements.list)
  list(@Req() request: Request) {
    return this.announcementService.list(this.getAccessToken(request));
  }

  @Post(API_ROUTES.announcements.create)
  create(
    @Body(new ZodBodyPipe(createAnnouncementRequestSchema))
    body: CreateAnnouncementRequest,
    @Req() request: Request
  ) {
    return this.announcementService.create(this.getAccessToken(request), body);
  }

  @Delete(API_ROUTES.announcements.delete())
  async remove(@Param("id") id: string, @Req() request: Request) {
    await this.announcementService.delete(this.getAccessToken(request), id);
    return { success: true };
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
