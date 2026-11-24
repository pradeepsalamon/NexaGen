import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { API_ROUTES } from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { AcademyClosureService } from "./academy-closure.service";

/** Closing an academy (docs/ACADEMY_CLOSURE.md): the academy's super admin and the platform console. */
@Controller()
export class AcademyClosureController {
  constructor(private readonly closures: AcademyClosureService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // ── the academy's super admin ──

  @Get(API_ROUTES.academyClosure.current)
  current(@Req() request: Request) {
    return this.closures.current(this.getAccessToken(request));
  }

  @Post(API_ROUTES.academyClosure.current)
  request(@Body() body: unknown, @Req() request: Request) {
    return this.closures.request(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.academyClosure.withdraw)
  @HttpCode(HttpStatus.OK)
  withdraw(@Req() request: Request) {
    return this.closures.withdraw(this.getAccessToken(request));
  }

  @Get(API_ROUTES.academyClosure.export)
  exportOwn(@Req() request: Request, @Res() res: Response) {
    return this.closures.exportOwn(this.getAccessToken(request), res);
  }

  // ── platform operators ──

  @Get(API_ROUTES.platform.closures)
  list(@Query() query: Record<string, unknown>, @Req() request: Request) {
    return this.closures.list(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.platform.closureApprove())
  @HttpCode(HttpStatus.OK)
  approve(@Param("id") id: string, @Body() body: unknown, @Req() request: Request) {
    return this.closures.approve(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.platform.closureDecline())
  @HttpCode(HttpStatus.OK)
  decline(@Param("id") id: string, @Body() body: unknown, @Req() request: Request) {
    return this.closures.decline(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.platform.closureCancelPurge())
  @HttpCode(HttpStatus.OK)
  cancelPurge(@Param("id") id: string, @Body() body: unknown, @Req() request: Request) {
    return this.closures.cancelPurge(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.platform.closureReopen())
  @HttpCode(HttpStatus.OK)
  reopen(@Param("id") id: string, @Body() body: unknown, @Req() request: Request) {
    return this.closures.reopen(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.platform.tenantClose())
  close(@Param("tenantId") tenantId: string, @Body() body: unknown, @Req() request: Request) {
    return this.closures.operatorClose(this.getAccessToken(request), tenantId, body);
  }

  @Get(API_ROUTES.platform.tenantExport())
  exportTenant(@Param("tenantId") tenantId: string, @Req() request: Request, @Res() res: Response) {
    return this.closures.exportTenant(this.getAccessToken(request), tenantId, res);
  }
}
