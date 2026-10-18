import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  feedbackPlacementSchema,
  feedbackTargetSchema,
  submitFeedbackRequestSchema,
  upsertFeedbackFormRequestSchema,
  type FeedbackResponseListQuery,
  type SkipFeedbackRequest,
  type SubmitFeedbackRequest,
  type UpsertFeedbackFormRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { FeedbackService } from "./feedback.service";

@Controller()
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // ── Student ──

  @Get(API_ROUTES.feedback.pending)
  getPending(
    @Req() request: Request,
    @Query("placement") placement?: string,
    @Query("classId") classId?: string
  ) {
    const parsed = feedbackPlacementSchema.safeParse(placement);
    return this.feedbackService.getPending(this.getAccessToken(request), {
      classId: classId || undefined,
      placement: parsed.success ? parsed.data : undefined
    });
  }

  @Post(API_ROUTES.feedback.submit)
  submit(
    @Req() request: Request,
    @Body(new ZodBodyPipe(submitFeedbackRequestSchema)) body: SubmitFeedbackRequest
  ) {
    return this.feedbackService.submit(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.feedback.skip)
  skip(
    @Req() request: Request,
    @Body(new ZodBodyPipe(feedbackTargetSchema)) body: SkipFeedbackRequest
  ) {
    return this.feedbackService.skip(this.getAccessToken(request), body);
  }

  // ── Coach ──

  @Get(API_ROUTES.feedback.mine)
  getMine(@Req() request: Request) {
    return this.feedbackService.getMyFeedback(this.getAccessToken(request));
  }

  // ── Admin ──

  @Get(API_ROUTES.adminFeedback.forms)
  listForms(@Req() request: Request) {
    return this.feedbackService.listForms(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminFeedback.forms)
  createForm(
    @Req() request: Request,
    @Body(new ZodBodyPipe(upsertFeedbackFormRequestSchema)) body: UpsertFeedbackFormRequest
  ) {
    return this.feedbackService.createForm(this.getAccessToken(request), body);
  }

  @Put(API_ROUTES.adminFeedback.form())
  updateForm(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(upsertFeedbackFormRequestSchema)) body: UpsertFeedbackFormRequest
  ) {
    return this.feedbackService.updateForm(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.adminFeedback.form())
  deleteForm(@Param("id") id: string, @Req() request: Request) {
    return this.feedbackService.deleteForm(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.adminFeedback.responses)
  listResponses(@Req() request: Request, @Query() query: FeedbackResponseListQuery) {
    return this.feedbackService.listResponses(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.adminFeedback.coachRatings)
  getCoachRatings(@Req() request: Request) {
    return this.feedbackService.getCoachRatings(this.getAccessToken(request));
  }
}
