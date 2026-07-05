import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { BatchService } from "./batch.service";
import { CreateBatchDto, UpdateBatchDto } from "./dto/batch.dto";

@Controller("batches")
export class BatchController {
  constructor(private readonly batchService: BatchService) { }

  @Get()
  list(@Req() request: Request) {
    return this.batchService.list(this.getAccessToken(request));
  }

  @Get("assignable-users")
  getAssignableUsers(@Req() request: Request) {
    return this.batchService.getAssignableUsers(this.getAccessToken(request));
  }

  @Get(":id")
  getById(@Param("id") id: string, @Req() request: Request) {
    return this.batchService.getById(this.getAccessToken(request), id);
  }

  @Post()
  create(@Body() body: CreateBatchDto, @Req() request: Request) {
    return this.batchService.create(this.getAccessToken(request), body);
  }

  @Patch(":id")
  update(
    @Body() body: UpdateBatchDto,
    @Param("id") id: string,
    @Req() request: Request
  ) {
    return this.batchService.update(this.getAccessToken(request), id, body);
  }

  @Patch(":id/archive")
  archive(@Param("id") id: string, @Req() request: Request) {
    return this.batchService.archive(this.getAccessToken(request), id);
  }

  @Patch(":id/restore")
  restore(@Param("id") id: string, @Req() request: Request) {
    return this.batchService.restore(this.getAccessToken(request), id);
  }

  @Delete(":id")
  delete(@Param("id") id: string, @Req() request: Request) {
    return this.batchService.delete(this.getAccessToken(request), id);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
