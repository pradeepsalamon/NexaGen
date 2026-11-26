import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  readWeakSpotTipRequestSchema,
  setAiReviewConsentRequestSchema,
  updateAiPlayReviewSettingsRequestSchema,
  type ReadWeakSpotTipRequest,
  type SetAiReviewConsentRequest,
  type UpdateAiPlayReviewSettingsRequest,
  type WeakSpotHomeworkRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { AiReviewConsentService } from "./ai-review-consent.service";
import { PlayReviewService } from "./play-review.service";
import { WeakSpotsService } from "./weak-spots.service";

/**
 * The play feed, engine reviews and the outside-AI switch
 * (docs/AI_PLAY_REVIEW.md). Reading is on every plan (the recording is); the
 * outside AI's switch can be turned ON only with the `aiPlayReview` feature
 * (checked in the service, so turning it OFF always works).
 */
@Controller()
export class PlayReviewController {
  constructor(
    private readonly consent: AiReviewConsentService,
    private readonly playReview: PlayReviewService,
    private readonly weakSpots: WeakSpotsService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.playReview.feedMine)
  feedMine(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.playReview.feedMine(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.playReview.feed())
  feedFor(@Req() request: Request, @Param("id") id: string, @Query() query: Record<string, unknown>) {
    return this.playReview.feedFor(this.getAccessToken(request), id, query);
  }

  @Get(API_ROUTES.playReview.itemMine())
  itemMine(@Req() request: Request, @Param("source") source: string, @Param("sourceId") sourceId: string) {
    return this.playReview.itemMine(this.getAccessToken(request), source, sourceId);
  }

  @Get(API_ROUTES.playReview.item())
  itemFor(@Req() request: Request, @Param("id") id: string, @Param("source") source: string, @Param("sourceId") sourceId: string) {
    return this.playReview.itemFor(this.getAccessToken(request), id, source, sourceId);
  }

  @Get(API_ROUTES.playReview.rollupMine)
  rollupMine(@Req() request: Request) {
    return this.playReview.rollupMine(this.getAccessToken(request));
  }

  @Get(API_ROUTES.playReview.rollup())
  rollupFor(@Req() request: Request, @Param("id") id: string) {
    return this.playReview.rollupFor(this.getAccessToken(request), id);
  }

  /** Weak spots (docs/WEAK_SPOTS.md): the student's coach and admins. */
  @Get(API_ROUTES.playReview.weakSpots())
  weakSpotsFor(@Req() request: Request, @Param("id") id: string) {
    return this.weakSpots.getFor(this.getAccessToken(request), id);
  }

  /** The student's own card (tips only once their academy read them). */
  @Get(API_ROUTES.playReview.weakSpotsMine)
  weakSpotsMine(@Req() request: Request) {
    return this.weakSpots.getMine(this.getAccessToken(request));
  }

  /** Make homework: a puzzle-set draft in the author's library (body checked in the service). */
  @Post(API_ROUTES.playReview.weakSpotHomework())
  weakSpotHomework(@Req() request: Request, @Param("id") id: string, @Body() body: WeakSpotHomeworkRequest) {
    return this.weakSpots.makeHomework(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.playReview.weakSpotTips)
  weakSpotTips(@Req() request: Request) {
    return this.weakSpots.listTips(this.getAccessToken(request));
  }

  @Put(API_ROUTES.playReview.weakSpotTip())
  readWeakSpotTip(
    @Req() request: Request,
    @Param("motif") motif: string,
    @Body(new ZodBodyPipe(readWeakSpotTipRequestSchema)) body: ReadWeakSpotTipRequest
  ) {
    return this.weakSpots.readTip(this.getAccessToken(request), motif, body);
  }

  @Delete(API_ROUTES.playReview.weakSpotTip())
  unreadWeakSpotTip(@Req() request: Request, @Param("motif") motif: string) {
    return this.weakSpots.unreadTip(this.getAccessToken(request), motif);
  }

  @Get(API_ROUTES.playReview.consentMine)
  consentMine(@Req() request: Request) {
    return this.consent.getMine(this.getAccessToken(request));
  }

  @Put(API_ROUTES.playReview.consentMine)
  setConsentMine(@Req() request: Request, @Body(new ZodBodyPipe(setAiReviewConsentRequestSchema)) body: SetAiReviewConsentRequest) {
    return this.consent.setMine(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.playReview.consent())
  consentFor(@Req() request: Request, @Param("id") id: string) {
    return this.consent.getFor(this.getAccessToken(request), id);
  }

  @Put(API_ROUTES.playReview.consent())
  setConsentFor(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(setAiReviewConsentRequestSchema)) body: SetAiReviewConsentRequest
  ) {
    return this.consent.setFor(this.getAccessToken(request), id, body);
  }
}

/** The academy's switches (`/admin/settings`). Saving needs the plan feature; reading doesn't. */
@Controller()
@RequireFeature("aiPlayReview", { allowReads: true })
export class PlayReviewSettingsController {
  constructor(private readonly consent: AiReviewConsentService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.playReview.settings)
  getSettings(@Req() request: Request) {
    return this.consent.getSettings(this.getAccessToken(request));
  }

  @Patch(API_ROUTES.playReview.settings)
  updateSettings(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateAiPlayReviewSettingsRequestSchema)) body: UpdateAiPlayReviewSettingsRequest
  ) {
    return this.consent.updateSettings(this.getAccessToken(request), body);
  }
}
