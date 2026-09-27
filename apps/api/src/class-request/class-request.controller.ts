import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  classRequestStatusSchema,
  createClassChangeRequestSchema,
  reviewClassChangeRequestSchema,
  type CreateClassChangeRequest,
  type ReviewClassChangeRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { ClassRequestService } from "./class-request.service";

@Controller()
export class ClassRequestController {
  constructor(private readonly classRequestService: ClassRequestService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.classRequests.list)
  list(@Req() request: Request, @Query("status") status?: string) {
    const parsed = classRequestStatusSchema.safeParse(status);
    return this.classRequestService.list(
      this.getAccessToken(request),
      parsed.success ? parsed.data : undefined
    );
  }

  @Post(API_ROUTES.classRequests.create)
  create(
    @Req() request: Request,
    @Body(new ZodBodyPipe(createClassChangeRequestSchema)) body: CreateClassChangeRequest
  ) {
    return this.classRequestService.create(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.classRequests.withdraw())
  withdraw(@Req() request: Request, @Param("id") id: string) {
    return this.classRequestService.withdraw(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.classRequests.approve())
  approve(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(reviewClassChangeRequestSchema)) body: ReviewClassChangeRequest
  ) {
    return this.classRequestService.approve(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.classRequests.reject())
  reject(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(reviewClassChangeRequestSchema)) body: ReviewClassChangeRequest
  ) {
    return this.classRequestService.reject(this.getAccessToken(request), id, body);
  }
}
