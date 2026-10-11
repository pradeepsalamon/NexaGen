import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import { API_ROUTES, updateClassRequestSchema, type UpdateClassRequest } from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
// Field-level Zod validation (AUDIT M30) — was a bare "Validation failed".
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { CoachService } from "./coach.service";

@Controller()
export class CoachController {
  constructor(private readonly coachService: CoachService) {}

  @Get(API_ROUTES.coach.dashboard)
  getDashboard(@Req() request: Request) {
    return this.coachService.getDashboard(this.getAccessToken(request));
  }

  @Get(API_ROUTES.coach.batches)
  getBatches(@Req() request: Request) {
    return this.coachService.getBatches(this.getAccessToken(request));
  }

  @Get(API_ROUTES.coach.classes)
  getTodayClasses(@Req() request: Request) {
    return this.coachService.getTodayClasses(this.getAccessToken(request));
  }

  @Get(API_ROUTES.coach.upcomingClasses)
  getUpcomingClasses(@Req() request: Request, @Query("limit") limit?: string) {
    const parsed = limit === undefined ? undefined : Number.parseInt(limit, 10);
    return this.coachService.getUpcomingClasses(
      this.getAccessToken(request),
      parsed !== undefined && Number.isNaN(parsed) ? undefined : parsed
    );
  }

  @Get(API_ROUTES.coach.classHistory)
  getClassHistory(@Req() request: Request) {
    return this.coachService.getClassHistory(this.getAccessToken(request));
  }

  @Get(API_ROUTES.coach.getClass())
  async getClass(
    @Req() request: Request,
    @Param("id") classId: string
  ) {
    const accessToken = request.cookies.nexa_access_token;
    return this.coachService.getClassById(accessToken, classId);
  }

  @Get(API_ROUTES.coach.classDetails())
  async getClassDetails(
    @Req() request: Request,
    @Param("id") classId: string
  ) {
    const accessToken = request.cookies.nexa_access_token;
    return this.coachService.getClassDetails(accessToken, classId);
  }

  @Patch(API_ROUTES.coach.updateClass())
  async updateClass(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateClassRequestSchema)) body: UpdateClassRequest,
    @Req() request: Request
  ) {
    return this.coachService.updateClass(this.getAccessToken(request), id, body);
  }

  @Patch(API_ROUTES.coach.cancelClass())
  cancelClass(@Param("id") id: string, @Req() request: Request) {
    return this.coachService.cancelClass(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.coach.students)
  getStudents(@Req() request: Request) {
    return this.coachService.getStudents(this.getAccessToken(request));
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
