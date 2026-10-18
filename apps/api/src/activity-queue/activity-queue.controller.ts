import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  addActivityQueueItemsRequestSchema,
  addCatalogPuzzlesToQueueRequestSchema,
  advanceActivityQueueRequestSchema,
  API_ROUTES,
  createActivityQueueRequestSchema,
  renameActivityQueueRequestSchema,
  reorderActivityQueueRequestSchema,
  type AddActivityQueueItemsRequest,
  type AddCatalogPuzzlesToQueueRequest,
  type AdvanceActivityQueueRequest,
  type CreateActivityQueueRequest,
  type RenameActivityQueueRequest,
  type ReorderActivityQueueRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { ActivityQueueService } from "./activity-queue.service";

@Controller()
export class ActivityQueueController {
  constructor(private readonly service: ActivityQueueService) {}

  @Get(API_ROUTES.liveClass.activityQueueCurrent())
  current(@Param("id") id: string, @Req() request: Request) {
    return this.service.current(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.liveClass.activityQueues())
  list(@Param("id") id: string, @Req() request: Request) {
    return this.service.list(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClass.activityQueues())
  create(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(createActivityQueueRequestSchema)) body: CreateActivityQueueRequest,
    @Req() request: Request
  ) {
    return this.service.create(this.getAccessToken(request), id, body);
  }

  @Patch(API_ROUTES.liveClass.activityQueue())
  rename(
    @Param("id") id: string,
    @Param("queueId") queueId: string,
    @Body(new ZodBodyPipe(renameActivityQueueRequestSchema)) body: RenameActivityQueueRequest,
    @Req() request: Request
  ) {
    return this.service.rename(this.getAccessToken(request), id, queueId, body);
  }

  @Delete(API_ROUTES.liveClass.activityQueue())
  remove(@Param("id") id: string, @Param("queueId") queueId: string, @Req() request: Request) {
    return this.service.remove(this.getAccessToken(request), id, queueId);
  }

  @Post(API_ROUTES.liveClass.activityQueueItems())
  addItems(
    @Param("id") id: string,
    @Param("queueId") queueId: string,
    @Body(new ZodBodyPipe(addActivityQueueItemsRequestSchema)) body: AddActivityQueueItemsRequest,
    @Req() request: Request
  ) {
    return this.service.addItems(this.getAccessToken(request), id, queueId, body);
  }

  @Post(API_ROUTES.liveClass.activityQueueCatalogItems())
  addCatalogPuzzles(
    @Param("id") id: string,
    @Param("queueId") queueId: string,
    @Body(new ZodBodyPipe(addCatalogPuzzlesToQueueRequestSchema)) body: AddCatalogPuzzlesToQueueRequest,
    @Req() request: Request
  ) {
    return this.service.addCatalogPuzzles(this.getAccessToken(request), id, queueId, body);
  }

  @Put(API_ROUTES.liveClass.activityQueueItemOrder())
  reorder(
    @Param("id") id: string,
    @Param("queueId") queueId: string,
    @Body(new ZodBodyPipe(reorderActivityQueueRequestSchema)) body: ReorderActivityQueueRequest,
    @Req() request: Request
  ) {
    return this.service.reorder(this.getAccessToken(request), id, queueId, body);
  }

  @Delete(API_ROUTES.liveClass.activityQueueItem())
  removeItem(
    @Param("id") id: string,
    @Param("queueId") queueId: string,
    @Param("itemId") itemId: string,
    @Req() request: Request
  ) {
    return this.service.removeItem(this.getAccessToken(request), id, queueId, itemId);
  }

  @Post(API_ROUTES.liveClass.activityQueueLaunch())
  launch(@Param("id") id: string, @Param("queueId") queueId: string, @Req() request: Request) {
    return this.service.launch(this.getAccessToken(request), id, queueId);
  }

  @Post(API_ROUTES.liveClass.activityQueueAdvance())
  advance(
    @Param("id") id: string,
    @Param("queueId") queueId: string,
    @Body(new ZodBodyPipe(advanceActivityQueueRequestSchema)) body: AdvanceActivityQueueRequest,
    @Req() request: Request
  ) {
    return this.service.advance(this.getAccessToken(request), id, queueId, body);
  }

  @Post(API_ROUTES.liveClass.activityQueueFinish())
  finish(@Param("id") id: string, @Param("queueId") queueId: string, @Req() request: Request) {
    return this.service.finish(this.getAccessToken(request), id, queueId);
  }

  @Get(API_ROUTES.liveClass.activityQueueProgress())
  progress(@Param("id") id: string, @Param("queueId") queueId: string, @Req() request: Request) {
    return this.service.progress(this.getAccessToken(request), id, queueId);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
