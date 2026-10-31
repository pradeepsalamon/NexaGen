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
import { API_ROUTES } from "@nexa-chess/types";
import type { PaginatedQuery } from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { BatchService } from "./batch.service";
import { CreateBatchDto, UpdateBatchDto } from "./dto/batch.dto";

@Controller()
export class BatchController {
  constructor(private readonly batchService: BatchService) { }

  @Get(API_ROUTES.batches.list)
  list(
    @Query() query: PaginatedQuery & { status?: string },
    @Req() request: Request
  ) {
    return this.batchService.list(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.batches.assignableUsers)
  getAssignableUsers(@Req() request: Request) {
    return this.batchService.getAssignableUsers(this.getAccessToken(request));
  }

  // No web caller on purpose: list rows carry the same BatchResponse shape.
  // Kept as the single-batch read and as the cross-user suite's probe of
  // getBatchVisibilityWhere (docs/BACKLOG.md, 2026-10-31).
  @Get(API_ROUTES.batches.get())
  getById(@Param("id") id: string, @Req() request: Request) {
    return this.batchService.getById(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.batches.create)
  create(@Body() body: CreateBatchDto, @Req() request: Request) {
    return this.batchService.create(this.getAccessToken(request), body);
  }

  @Patch(API_ROUTES.batches.update())
  update(
    @Body() body: UpdateBatchDto,
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.batchService.update(this.getAccessToken(request), id, body);
  }

  @Patch(API_ROUTES.batches.archive())
  archive(@Param("id") id: string, @Req() request: Request) {
    return this.batchService.archive(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.batches.restore())
  restore(@Param("id") id: string, @Req() request: Request) {
    return this.batchService.restore(this.getAccessToken(request), id);
  }

  @Delete(API_ROUTES.batches.delete())
  delete(@Param("id") id: string, @Req() request: Request) {
    return this.batchService.delete(this.getAccessToken(request), id);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
