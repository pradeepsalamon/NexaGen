import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  puzzleRushModeSchema,
  reportSoloRushProgressRequestSchema,
  soloRushPeriodSchema,
  startPuzzleRushRequestSchema,
  type ReportSoloRushProgressRequest,
  type StartPuzzleRushRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { z } from "zod";
import { queryString } from "../common/query-params";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { SoloPuzzleRushService } from "./solo-puzzle-rush.service";

/** Student-only: solo Storm / Racer from the practice page (docs/PUZZLE_RUSH_SOLO.md). */
@Controller()
export class SoloPuzzleRushController {
  constructor(private readonly service: SoloPuzzleRushService) {}

  @Get(API_ROUTES.puzzleRushSolo.overview)
  overview(@Req() request: Request) {
    return this.service.overview(this.getAccessToken(request));
  }

  @Post(API_ROUTES.puzzleRushSolo.runs)
  start(@Body(new ZodBodyPipe(startPuzzleRushRequestSchema)) body: StartPuzzleRushRequest, @Req() request: Request) {
    return this.service.start(this.getAccessToken(request), body.mode);
  }

  @Put(API_ROUTES.puzzleRushSolo.progress())
  reportProgress(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(reportSoloRushProgressRequestSchema)) body: ReportSoloRushProgressRequest,
    @Req() request: Request
  ) {
    return this.service.reportProgress(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.puzzleRushSolo.leaderboard)
  leaderboard(
    @Query("batchId") batchId: unknown,
    @Query("mode") mode: unknown,
    @Query("period") period: unknown,
    @Req() request: Request
  ) {
    // `queryEnum` reads "ALL" as "no filter", which is a real period here.
    const query = parseOrBadRequest(
      z.object({
        batchId: z.string().min(1).max(64),
        mode: puzzleRushModeSchema.default("STORM"),
        period: soloRushPeriodSchema.default("WEEK")
      }),
      {
        batchId: queryString(batchId, "batchId"),
        mode: queryString(mode, "mode"),
        period: queryString(period, "period")
      },
      "query"
    );
    return this.service.leaderboard(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.puzzleRushSolo.battles)
  batchBattles(
    @Query("mode") mode: unknown,
    @Query("period") period: unknown,
    @Req() request: Request
  ) {
    const query = parseOrBadRequest(
      z.object({
        mode: puzzleRushModeSchema.default("STORM"),
        period: soloRushPeriodSchema.default("WEEK")
      }),
      {
        mode: queryString(mode, "mode"),
        period: queryString(period, "period")
      },
      "query"
    );
    return this.service.batchBattles(this.getAccessToken(request), query);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
