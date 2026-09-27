import { Controller, Get, Param, Req } from "@nestjs/common";
import { API_ROUTES } from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ProgressService } from "./progress.service";

@Controller()
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.progress.mine)
  getMine(@Req() request: Request) {
    return this.progressService.getMine(this.getAccessToken(request));
  }

  @Get(API_ROUTES.progress.student())
  getForStudent(@Req() request: Request, @Param("id") id: string) {
    return this.progressService.getForStudent(this.getAccessToken(request), id);
  }
}
