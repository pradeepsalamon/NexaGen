import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import { API_ROUTES } from "@nexa-chess/types";
import type { AnalyticsRangeQuery, PaginatedQuery } from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsTablesService } from "./analytics-tables.service";

@Controller()
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly tables: AnalyticsTablesService
  ) {}

  private token(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.analytics.overview)
  overview(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.overview(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.users)
  users(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.users(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.acquisition)
  acquisition(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.acquisition(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.students)
  students(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.students(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.coaches)
  coaches(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.coaches(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.coachById())
  coachById(
    @Param("id") id: string,
    @Query() query: AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.analytics.coachById(this.token(req), id, query);
  }

  @Get(API_ROUTES.analytics.classes)
  classes(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.classes(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.attendance)
  attendance(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.attendance(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.batches)
  batches(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.batches(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.batchById())
  batchById(
    @Param("id") id: string,
    @Query() query: AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.analytics.batchById(this.token(req), id, query);
  }

  @Get(API_ROUTES.analytics.recordings)
  recordings(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.recordings(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.storage)
  storage(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.storage(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.engagement)
  engagement(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.engagement(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.operations)
  operations(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.operations(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.today)
  today(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.today(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.alerts)
  alerts(@Query() query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.alerts(this.token(req), query);
  }

  // ── drill-down tables ──

  @Get(API_ROUTES.analytics.usersTable)
  usersTable(
    @Query() query: PaginatedQuery & AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.tables.usersTable(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.coachesTable)
  coachesTable(
    @Query() query: PaginatedQuery & AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.tables.coachesTable(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.batchesTable)
  batchesTable(
    @Query() query: PaginatedQuery & AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.tables.batchesTable(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.classesTable)
  classesTable(
    @Query() query: PaginatedQuery & AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.tables.classesTable(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.recordingsTable)
  recordingsTable(
    @Query() query: PaginatedQuery & AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.tables.recordingsTable(this.token(req), query);
  }

  // ── CSV export ──

  @Get(API_ROUTES.analytics.export())
  async export(
    @Param("report") report: string,
    @Query() query: AnalyticsRangeQuery,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const { filename, csv } = await this.tables.exportCsv(
      this.token(req),
      report,
      query
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
