import { Body, Controller, Get, Param, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  retentionCategorySchema,
  retentionPreviewQuerySchema,
  updateRetentionPolicySchema,
  type RetentionPreviewQuery,
  type UpdateRetentionPolicyRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe, parseOrBadRequest } from "../common/zod-body.pipe";
import { RetentionPolicyService } from "./retention-policy.service";

@Controller()
export class RetentionController {
  constructor(private readonly policies: RetentionPolicyService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.adminRetention.policies)
  list(@Req() request: Request) {
    return this.policies.list(this.getAccessToken(request));
  }

  @Put(API_ROUTES.adminRetention.policy())
  update(
    @Req() request: Request,
    @Param("category") category: string,
    @Body(new ZodBodyPipe(updateRetentionPolicySchema)) body: UpdateRetentionPolicyRequest
  ) {
    return this.policies.update(
      this.getAccessToken(request),
      parseOrBadRequest(retentionCategorySchema, category, "category"),
      body
    );
  }

  @Get(API_ROUTES.adminRetention.preview())
  preview(
    @Req() request: Request,
    @Param("category") category: string,
    @Query(new ZodBodyPipe(retentionPreviewQuerySchema)) query: RetentionPreviewQuery
  ) {
    return this.policies.preview(
      this.getAccessToken(request),
      parseOrBadRequest(retentionCategorySchema, category, "category"),
      query
    );
  }
}
