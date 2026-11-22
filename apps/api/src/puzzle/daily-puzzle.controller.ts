import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import {
  API_ROUTES,
  setDailyPuzzleOverrideRequestSchema,
  startDailyPuzzleRequestSchema,
  updateBatchDailyPuzzleRequestSchema,
  updateDailyPuzzleSettingsRequestSchema,
  updateDailyPuzzleWhatsAppRequestSchema,
  type SetDailyPuzzleOverrideRequest,
  type StartDailyPuzzleRequest,
  type UpdateBatchDailyPuzzleRequest,
  type UpdateDailyPuzzleSettingsRequest,
  type UpdateDailyPuzzleWhatsAppRequest
} from "@nexa-chess/types";
import { Throttle } from "@nestjs/throttler";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { queryString } from "../common/query-params";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { DailyPuzzleService } from "./daily-puzzle.service";
import { DailyPuzzleWhatsAppService } from "./daily-puzzle-whatsapp.service";

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
  constructor(
    private readonly service: DailyPuzzleService,
    private readonly whatsapp: DailyPuzzleWhatsAppService
  ) {}

  /**
   * Public: the WhatsApp board picture's position (step 3). The signed,
   * expiring token is the credential; the web app's image route is the caller.
   * Listed in route-auth.spec.ts PUBLIC_ROUTES.
   */
  @Get(API_ROUTES.dailyPuzzle.picture())
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  picture(@Param("token") token: string) {
    return this.whatsapp.picture(token);
  }

  @Get(API_ROUTES.dailyPuzzle.today)
  today(@Req() request: Request) {
    return this.service.today(this.getAccessToken(request));
  }

  @Post(API_ROUTES.dailyPuzzle.start)
  start(@Body(new ZodBodyPipe(startDailyPuzzleRequestSchema)) body: StartDailyPuzzleRequest, @Req() request: Request) {
    return this.service.start(this.getAccessToken(request), body.level);
  }

  /** The student's own switch: today's puzzles on WhatsApp, to their account phone. */
  @Put(API_ROUTES.dailyPuzzle.whatsapp)
  setWhatsApp(
    @Body(new ZodBodyPipe(updateDailyPuzzleWhatsAppRequestSchema)) body: UpdateDailyPuzzleWhatsAppRequest,
    @Req() request: Request
  ) {
    return this.whatsapp.setForStudent(this.getAccessToken(request), body.on);
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
    return this.service.updateSettings(this.getAccessToken(request), body);
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
