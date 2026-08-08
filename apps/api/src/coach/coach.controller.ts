import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  PipeTransform,
  Post,
  Req
} from "@nestjs/common";
import type { Request } from "express";
import { API_ROUTES, createClassRequestSchema, updateClassRequestSchema, type CreateClassRequest, type UpdateClassRequest } from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { CoachService } from "./coach.service";

class ZodPipe implements PipeTransform {
  constructor(private schema: any) {}
  transform(value: any) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      throw new BadRequestException("Validation failed");
    }
  }
}

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
  getUpcomingClasses(@Req() request: Request) {
    return this.coachService.getUpcomingClasses(this.getAccessToken(request));
  }

  @Get(API_ROUTES.coach.classHistory)
  getClassHistory(@Req() request: Request) {
    return this.coachService.getClassHistory(this.getAccessToken(request));
  }

  @Post(API_ROUTES.coach.createClass)
  createClass(
    @Body(new ZodPipe(createClassRequestSchema)) body: CreateClassRequest, 
    @Req() request: Request
  ) {
    return this.coachService.createClass(this.getAccessToken(request), body);
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
    @Body(new ZodPipe(updateClassRequestSchema)) body: UpdateClassRequest,
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
