import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import { API_ROUTES } from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ActivityHistoryService } from "./activity-history.service";
import { ProgressService } from "./progress.service";

@Controller()
export class ProgressController {
  constructor(
    private readonly activityHistory: ActivityHistoryService,
    private readonly progressService: ProgressService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.progress.mine)
  getMine(@Req() request: Request) {
    return this.progressService.getMine(this.getAccessToken(request));
  }

  @Get(API_ROUTES.progress.historyMine)
  historyMine(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.activityHistory.historyMine(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.progress.summaryMine)
  summaryMine(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.activityHistory.summaryMine(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.progress.student())
  getForStudent(@Req() request: Request, @Param("id") id: string) {
    return this.progressService.getForStudent(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.progress.history())
  historyFor(@Req() request: Request, @Param("id") id: string, @Query() query: Record<string, unknown>) {
    return this.activityHistory.historyFor(this.getAccessToken(request), id, query);
  }

  @Get(API_ROUTES.progress.summary())
  summaryFor(@Req() request: Request, @Param("id") id: string, @Query() query: Record<string, unknown>) {
    return this.activityHistory.summaryFor(this.getAccessToken(request), id, query);
  }
}
