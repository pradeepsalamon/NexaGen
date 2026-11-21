import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  puzzleRushModeSchema,
  reportSoloRushProgressRequestSchema,
  soloRushPeriodSchema,
  startPuzzleRushRequestSchema,
  updateBatchBattleSettingsSchema,
  type ReportSoloRushProgressRequest,
  type StartPuzzleRushRequest,
  type UpdateBatchBattleSettingsRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { z } from "zod";
import { queryString } from "../common/query-params";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { SoloPuzzleRushService } from "./solo-puzzle-rush.service";

/**
 * Solo Storm / Racer from the student's practice page, and Batch Battles
 * (docs/PUZZLE_RUSH_SOLO.md). Student-only, except a batch's Batch Battles
 * settings: an admin, or a coach of that batch.
 */
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

  @Patch(API_ROUTES.puzzleRushSolo.battleSettings())
  updateBattleSettings(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateBatchBattleSettingsSchema)) body: UpdateBatchBattleSettingsRequest,
    @Req() request: Request
  ) {
    return this.service.updateBattleSettings(this.getAccessToken(request), id, body);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
