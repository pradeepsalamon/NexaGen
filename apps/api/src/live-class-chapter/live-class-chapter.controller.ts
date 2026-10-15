import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  createLiveClassChapterRequestSchema,
  importLiveClassChaptersRequestSchema,
  reorderLiveClassChaptersRequestSchema,
  updateLiveClassChapterRequestSchema,
  type CreateLiveClassChapterRequest,
  type ImportLiveClassChaptersRequest,
  type ReorderLiveClassChaptersRequest,
  type UpdateLiveClassChapterRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LiveClassChapterService } from "./live-class-chapter.service";

@Controller()
export class LiveClassChapterController {
  constructor(private readonly service: LiveClassChapterService) {}

  @Get(API_ROUTES.liveClass.chapters())
  list(@Param("id") id: string, @Req() request: Request) {
    return this.service.list(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.chapters())
  create(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(createLiveClassChapterRequestSchema)) body: CreateLiveClassChapterRequest,
    @Req() request: Request
  ) {
    return this.service.create(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.liveClass.chapterImport())
  importPuzzles(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(importLiveClassChaptersRequestSchema)) body: ImportLiveClassChaptersRequest,
    @Req() request: Request
  ) {
    return this.service.importPuzzles(this.getAccessToken(request), id, body);
  }

  @Put(API_ROUTES.liveClass.chapterOrder())
  reorder(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(reorderLiveClassChaptersRequestSchema)) body: ReorderLiveClassChaptersRequest,
    @Req() request: Request
  ) {
    return this.service.reorder(this.getAccessToken(request), id, body);
  }

  @Patch(API_ROUTES.liveClass.chapter())
  update(
    @Param("id") id: string,
    @Param("chapterId") chapterId: string,
    @Body(new ZodBodyPipe(updateLiveClassChapterRequestSchema)) body: UpdateLiveClassChapterRequest,
    @Req() request: Request
  ) {
    return this.service.update(this.getAccessToken(request), id, chapterId, body);
  }

  @Delete(API_ROUTES.liveClass.chapter())
  remove(@Param("id") id: string, @Param("chapterId") chapterId: string, @Req() request: Request) {
    return this.service.remove(this.getAccessToken(request), id, chapterId);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
