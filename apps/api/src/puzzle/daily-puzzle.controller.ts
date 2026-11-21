import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import {
  API_ROUTES,
  setDailyPuzzleOverrideRequestSchema,
  startDailyPuzzleRequestSchema,
  updateBatchDailyPuzzleRequestSchema,
  updateDailyPuzzleSettingsRequestSchema,
  type SetDailyPuzzleOverrideRequest,
  type StartDailyPuzzleRequest,
  type UpdateBatchDailyPuzzleRequest,
  type UpdateDailyPuzzleSettingsRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { queryString } from "../common/query-params";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { DailyPuzzleService } from "./daily-puzzle.service";

const scheduleQuerySchema = z.object({
  batchId: z.string().min(1).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").optional()
});

/**
 * Puzzle of the Day (docs/PUZZLE_OF_THE_DAY.md): students read today's puzzles
 * and open an attempt; admins (academy or any batch) and coaches (own batch)
 * manage the schedule, overrides and switches.
 */
@Controller()
export class DailyPuzzleController {
  constructor(private readonly service: DailyPuzzleService) {}

  @Get(API_ROUTES.dailyPuzzle.today)
  today(@Req() request: Request) {
    return this.service.today(this.getAccessToken(request));
  }

  @Post(API_ROUTES.dailyPuzzle.start)
  start(@Body(new ZodBodyPipe(startDailyPuzzleRequestSchema)) body: StartDailyPuzzleRequest, @Req() request: Request) {
    return this.service.start(this.getAccessToken(request), body.level);
  }

  @Get(API_ROUTES.dailyPuzzle.schedule)
  schedule(@Query("batchId") batchId: unknown, @Query("from") from: unknown, @Req() request: Request) {
    const query = parseOrBadRequest(
      scheduleQuerySchema,
      { batchId: queryString(batchId, "batchId"), from: queryString(from, "from") },
      "query"
    );
    return this.service.schedule(this.getAccessToken(request), query);
  }

  @Put(API_ROUTES.dailyPuzzle.overrides)
  setOverride(
    @Body(new ZodBodyPipe(setDailyPuzzleOverrideRequestSchema)) body: SetDailyPuzzleOverrideRequest,
    @Req() request: Request
  ) {
    return this.service.setOverride(this.getAccessToken(request), body);
  }

  @Put(API_ROUTES.dailyPuzzle.settings)
  updateSettings(
    @Body(new ZodBodyPipe(updateDailyPuzzleSettingsRequestSchema)) body: UpdateDailyPuzzleSettingsRequest,
    @Req() request: Request
  ) {
    return this.service.updateSettings(this.getAccessToken(request), body.enabled);
  }

  @Patch(API_ROUTES.dailyPuzzle.batch())
  updateBatch(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateBatchDailyPuzzleRequestSchema)) body: UpdateBatchDailyPuzzleRequest,
    @Req() request: Request
  ) {
    return this.service.updateBatch(this.getAccessToken(request), id, body.enabled);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
