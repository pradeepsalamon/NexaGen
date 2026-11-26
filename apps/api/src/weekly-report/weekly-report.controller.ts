import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import { API_ROUTES } from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { WeeklyReportService } from "./weekly-report.service";

/** Weekly progress reports (docs/WEEKLY_REPORTS.md): every plan (WR-2); queries checked in the service. */
@Controller()
export class WeeklyReportController {
  constructor(private readonly reports: WeeklyReportService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.weeklyReports.mine)
  mine(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.reports.listMine(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.weeklyReports.preview())
  preview(@Req() request: Request, @Param("id") id: string) {
    return this.reports.preview(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.weeklyReports.forStudent())
  forStudent(@Req() request: Request, @Param("id") id: string, @Query() query: Record<string, unknown>) {
    return this.reports.listFor(this.getAccessToken(request), id, query);
  }
}
