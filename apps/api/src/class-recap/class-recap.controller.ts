import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  publishClassRecapRequestSchema,
  rateClassRecapRequestSchema,
  saveClassRecapRequestSchema,
  updateClassRecapSettingsRequestSchema,
  type PublishClassRecapRequest,
  type RateClassRecapRequest,
  type SaveClassRecapRequest,
  type UpdateClassRecapSettingsRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { ClassRecapService } from "./class-recap.service";

/**
 * AI class recaps (docs/CLASS_RECAPS.md). Changing one needs the
 * `aiClassRecaps` plan feature; reading doesn't, so recaps already published
 * stay readable after a plan change.
 */
@Controller()
@RequireFeature("aiClassRecaps", { allowReads: true })
export class ClassRecapController {
  constructor(private readonly recaps: ClassRecapService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.classRecaps.list)
  list(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.recaps.list(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.classRecaps.reviewCount)
  reviewCount(@Req() request: Request) {
    return this.recaps.reviewCount(this.getAccessToken(request));
  }

  @Get(API_ROUTES.classRecaps.feedMine)
  feedMine(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.recaps.feedMine(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.classRecaps.forClass())
  getForClass(@Req() request: Request, @Param("classId") classId: string) {
    return this.recaps.getForClass(this.getAccessToken(request), classId);
  }

  @Put(API_ROUTES.classRecaps.forClass())
  save(
    @Req() request: Request,
    @Param("classId") classId: string,
    @Body(new ZodBodyPipe(saveClassRecapRequestSchema)) body: SaveClassRecapRequest
  ) {
    return this.recaps.save(this.getAccessToken(request), classId, body);
  }

  @Post(API_ROUTES.classRecaps.publish())
  publish(
    @Req() request: Request,
    @Param("classId") classId: string,
    @Body(new ZodBodyPipe(publishClassRecapRequestSchema)) body: PublishClassRecapRequest
  ) {
    return this.recaps.publish(this.getAccessToken(request), classId, body);
  }

  @Post(API_ROUTES.classRecaps.unpublish())
  unpublish(@Req() request: Request, @Param("classId") classId: string) {
    return this.recaps.unpublish(this.getAccessToken(request), classId);
  }

  @Post(API_ROUTES.classRecaps.discard())
  discard(@Req() request: Request, @Param("classId") classId: string) {
    return this.recaps.discard(this.getAccessToken(request), classId);
  }

  @Post(API_ROUTES.classRecaps.restore())
  restore(@Req() request: Request, @Param("classId") classId: string) {
    return this.recaps.restore(this.getAccessToken(request), classId);
  }

  @Post(API_ROUTES.classRecaps.regenerate())
  regenerate(@Req() request: Request, @Param("classId") classId: string) {
    return this.recaps.regenerate(this.getAccessToken(request), classId);
  }

  @Post(API_ROUTES.classRecaps.rating())
  rate(
    @Req() request: Request,
    @Param("classId") classId: string,
    @Body(new ZodBodyPipe(rateClassRecapRequestSchema)) body: RateClassRecapRequest
  ) {
    return this.recaps.rate(this.getAccessToken(request), classId, body);
  }

  @Get(API_ROUTES.classRecaps.settings)
  getSettings(@Req() request: Request) {
    return this.recaps.getSettings(this.getAccessToken(request));
  }

  @Patch(API_ROUTES.classRecaps.settings)
  updateSettings(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateClassRecapSettingsRequestSchema)) body: UpdateClassRecapSettingsRequest
  ) {
    return this.recaps.updateSettings(this.getAccessToken(request), body);
  }
}
