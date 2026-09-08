import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  createBatchScheduleRequestSchema,
  previewBatchScheduleRequestSchema,
  scheduleOccurrenceActionRequestSchema,
  updateBatchScheduleRequestSchema,
  type CreateBatchScheduleRequest,
  type PreviewBatchScheduleRequest,
  type ScheduleOccurrenceActionRequest,
  type UpdateBatchScheduleRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { BatchScheduleService } from "./batch-schedule.service";

@Controller()
export class BatchScheduleController {
  constructor(private readonly service: BatchScheduleService) {}

  private token(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.batchSchedules.list)
  list(@Req() request: Request, @Query("batchId") batchId?: string) {
    return this.service.list(this.token(request), batchId);
  }

  @Get(API_ROUTES.batchSchedules.calendar)
  calendar(
    @Req() request: Request,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("batchId") batchId?: string
  ) {
    return this.service.calendar(this.token(request), { from, to, batchId });
  }

  @Post(API_ROUTES.batchSchedules.preview)
  preview(
    @Req() request: Request,
    @Body(new ZodBodyPipe(previewBatchScheduleRequestSchema))
    body: PreviewBatchScheduleRequest
  ) {
    return this.service.preview(this.token(request), body);
  }

  @Post(API_ROUTES.batchSchedules.create)
  create(
    @Req() request: Request,
    @Body(new ZodBodyPipe(createBatchScheduleRequestSchema))
    body: CreateBatchScheduleRequest
  ) {
    return this.service.create(this.token(request), body);
  }

  @Get(API_ROUTES.batchSchedules.get())
  get(@Req() request: Request, @Param("id") id: string) {
    return this.service.get(this.token(request), id);
  }

  @Patch(API_ROUTES.batchSchedules.update())
  update(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateBatchScheduleRequestSchema))
    body: UpdateBatchScheduleRequest
  ) {
    return this.service.update(this.token(request), id, body);
  }

  @Post(API_ROUTES.batchSchedules.regenerate())
  regenerate(@Req() request: Request, @Param("id") id: string) {
    return this.service.regenerate(this.token(request), id);
  }

  @Delete(API_ROUTES.batchSchedules.deactivate())
  deactivate(@Req() request: Request, @Param("id") id: string) {
    return this.service.deactivate(this.token(request), id);
  }

  @Patch(API_ROUTES.batchSchedules.occurrenceAction())
  occurrenceAction(
    @Req() request: Request,
    @Param("classId") classId: string,
    @Body(new ZodBodyPipe(scheduleOccurrenceActionRequestSchema))
    body: ScheduleOccurrenceActionRequest
  ) {
    return this.service.occurrenceAction(this.token(request), classId, body);
  }
}
