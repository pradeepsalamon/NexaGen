import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  updateLiveClassToolRequestSchema,
  type UpdateLiveClassToolRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { ClassroomToolsService } from "./classroom-tools.service";
import { RequireFeature } from "../platform/require-feature.decorator";

@RequireFeature("interactiveClassroom", { allowReads: true })
@Controller()
export class ClassroomToolsController {
  constructor(private readonly service: ClassroomToolsService) {}

  @Get(API_ROUTES.liveClass.tools())
  list(@Param("id") id: string, @Req() request: Request) {
    return this.service.list(this.getAccessToken(request), id);
  }

  @Put(API_ROUTES.liveClass.tool())
  update(
    @Param("id") id: string,
    @Param("tool") tool: string,
    @Body(new ZodBodyPipe(updateLiveClassToolRequestSchema)) body: UpdateLiveClassToolRequest,
    @Req() request: Request
  ) {
    return this.service.update(this.getAccessToken(request), id, tool, body.state);
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
