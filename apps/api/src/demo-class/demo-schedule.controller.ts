import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import {
  API_ROUTES,
  createDemoScheduleRequestSchema,
  updateDemoScheduleRequestSchema,
  type CreateDemoScheduleRequest,
  type UpdateDemoScheduleRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { DemoScheduleService } from "./demo-schedule.service";
import { RequireFeature } from "../platform/require-feature.decorator";

@RequireFeature("demoClasses")
@Controller()
export class DemoScheduleController {
  constructor(private readonly demoSchedules: DemoScheduleService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.admin.demoSchedules)
  list(@Req() request: Request) {
    return this.demoSchedules.list(this.getAccessToken(request));
  }

  @Post(API_ROUTES.admin.demoSchedules)
  create(
    @Req() request: Request,
    @Body(new ZodBodyPipe(createDemoScheduleRequestSchema)) body: CreateDemoScheduleRequest
  ) {
    return this.demoSchedules.create(this.getAccessToken(request), body);
  }

  @Patch(API_ROUTES.admin.demoSchedule())
  update(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateDemoScheduleRequestSchema)) body: UpdateDemoScheduleRequest
  ) {
    return this.demoSchedules.update(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.admin.demoSchedule())
  remove(@Param("id") id: string, @Req() request: Request) {
    return this.demoSchedules.remove(this.getAccessToken(request), id);
  }
}
