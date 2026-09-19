import { Body, Controller, Delete, Get, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  updateChessAppearanceAdminRequestSchema,
  updateChessAppearanceRequestSchema,
  type UpdateChessAppearanceAdminRequest,
  type UpdateChessAppearanceRequest,
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { ChessAppearanceService } from "./chess-appearance.service";

@Controller()
export class ChessAppearanceController {
  constructor(private readonly appearanceService: ChessAppearanceService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.chessAppearance.get)
  getResolved(@Req() request: Request) {
    return this.appearanceService.getResolvedAppearance(this.getAccessToken(request));
  }

  @Get(API_ROUTES.chessAppearance.catalog)
  getCatalog(@Req() request: Request) {
    return this.appearanceService.getCatalog(this.getAccessToken(request));
  }

  @Put(API_ROUTES.chessAppearance.me)
  updateMe(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateChessAppearanceRequestSchema)) body: UpdateChessAppearanceRequest,
  ) {
    return this.appearanceService.updateMyPreference(this.getAccessToken(request), body);
  }

  @Delete(API_ROUTES.chessAppearance.me)
  resetMe(@Req() request: Request) {
    return this.appearanceService.resetMyPreference(this.getAccessToken(request));
  }

  @Get(API_ROUTES.chessAppearance.admin)
  getAdmin(@Req() request: Request) {
    return this.appearanceService.getGlobalSettings(this.getAccessToken(request));
  }

  @Put(API_ROUTES.chessAppearance.admin)
  updateAdmin(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateChessAppearanceAdminRequestSchema))
    body: UpdateChessAppearanceAdminRequest,
  ) {
    return this.appearanceService.updateGlobalSettings(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.chessAppearance.adminReset)
  resetAdmin(@Req() request: Request) {
    return this.appearanceService.resetGlobalSettings(this.getAccessToken(request));
  }
}
