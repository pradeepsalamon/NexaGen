import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import {
  API_ROUTES,
  revisionRecommendRequestSchema,
  revisionReviewRequestSchema,
  revisionSkipRequestSchema,
  type RevisionRecommendRequest,
  type RevisionReviewRequest,
  type RevisionSkipRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { RevisionService } from "./revision.service";
import { RequireFeature } from "../platform/require-feature.decorator";

@RequireFeature("smartRevision")
@Controller()
export class RevisionController {
  constructor(private readonly revision: RevisionService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.revision.summaryMine)
  summaryMine(@Req() request: Request) {
    return this.revision.summaryMine(this.getAccessToken(request));
  }

  @Get(API_ROUTES.revision.sessionMine)
  sessionMine(@Req() request: Request) {
    return this.revision.sessionMine(this.getAccessToken(request));
  }

  @Post(API_ROUTES.revision.next)
  next(@Req() request: Request) {
    return this.revision.next(this.getAccessToken(request));
  }

  @Post(API_ROUTES.revision.review)
  review(@Req() request: Request, @Body(new ZodBodyPipe(revisionReviewRequestSchema)) body: RevisionReviewRequest) {
    return this.revision.review(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.revision.skip)
  skip(@Req() request: Request, @Body(new ZodBodyPipe(revisionSkipRequestSchema)) body: RevisionSkipRequest) {
    return this.revision.skip(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.revision.reportMine)
  reportMine(@Req() request: Request) {
    return this.revision.reportMine(this.getAccessToken(request));
  }

  @Get(API_ROUTES.revision.student())
  reportFor(@Req() request: Request, @Param("id") id: string) {
    return this.revision.reportFor(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.revision.recommend())
  recommend(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(revisionRecommendRequestSchema)) body: RevisionRecommendRequest
  ) {
    return this.revision.recommend(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.revision.recommendation())
  removeRecommendation(@Req() request: Request, @Param("id") id: string, @Param("itemId") itemId: string) {
    return this.revision.removeRecommendation(this.getAccessToken(request), id, itemId);
  }
}
