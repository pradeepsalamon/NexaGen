import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import { analyticsRangeQuerySchema, API_ROUTES } from "@nexa-chess/types";
import type { AnalyticsRangeQuery, PaginatedQuery } from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsTablesService } from "./analytics-tables.service";

// Loose so the table endpoints keep their page/sort/search params.
const RANGE_QUERY_PIPE = new ZodBodyPipe(analyticsRangeQuerySchema.loose());

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
  overview(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.overview(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.users)
  users(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.users(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.acquisition)
  acquisition(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.acquisition(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.students)
  students(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.students(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.coaches)
  coaches(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.coaches(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.coachById())
  coachById(
    @Param("id") id: string,
    @Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.analytics.coachById(this.token(req), id, query);
  }

  @Get(API_ROUTES.analytics.classes)
  classes(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.classes(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.attendance)
  attendance(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.attendance(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.batches)
  batches(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.batches(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.batchById())
  batchById(
    @Param("id") id: string,
    @Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.analytics.batchById(this.token(req), id, query);
  }

  @Get(API_ROUTES.analytics.recordings)
  recordings(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.recordings(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.storage)
  storage(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.storage(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.engagement)
  engagement(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.engagement(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.operations)
  operations(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.operations(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.today)
  today(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.today(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.alerts)
  alerts(@Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery, @Req() req: Request) {
    return this.analytics.alerts(this.token(req), query);
  }

  // ── drill-down tables ──

  @Get(API_ROUTES.analytics.usersTable)
  usersTable(
    @Query(RANGE_QUERY_PIPE) query: PaginatedQuery & AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.tables.usersTable(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.coachesTable)
  coachesTable(
    @Query(RANGE_QUERY_PIPE) query: PaginatedQuery & AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.tables.coachesTable(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.batchesTable)
  batchesTable(
    @Query(RANGE_QUERY_PIPE) query: PaginatedQuery & AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.tables.batchesTable(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.classesTable)
  classesTable(
    @Query(RANGE_QUERY_PIPE) query: PaginatedQuery & AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.tables.classesTable(this.token(req), query);
  }

  @Get(API_ROUTES.analytics.recordingsTable)
  recordingsTable(
    @Query(RANGE_QUERY_PIPE) query: PaginatedQuery & AnalyticsRangeQuery,
    @Req() req: Request
  ) {
    return this.tables.recordingsTable(this.token(req), query);
  }

  // ── CSV export ──

  @Get(API_ROUTES.analytics.export())
  async export(
    @Param("report") report: string,
    @Query(RANGE_QUERY_PIPE) query: AnalyticsRangeQuery,
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
