import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";
import {
  API_ROUTES,
  legalPageKindSchema,
  updateLegalPageRequestSchema,
  type UpdateLegalPageRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { LegalPagesService } from "./legal-pages.service";

/** Public, by host: an academy's own wording for `/privacy` or `/terms`. */
@Controller()
@RequireFeature(null)
export class PublicLegalPagesController {
  constructor(private readonly legalPages: LegalPagesService) {}

  @Get(API_ROUTES.branding.legalPage())
  page(@Param("kind") kind: string) {
    return this.legalPages.publicPage(parseOrBadRequest(legalPageKindSchema, kind));
  }
}

/** The academy's admins write its legal pages (every plan). */
@Controller()
@RequireFeature(null)
export class LegalPagesController {
  constructor(private readonly legalPages: LegalPagesService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.branding.adminLegalPages)
  list(@Req() request: Request) {
    return this.legalPages.list(this.getAccessToken(request));
  }

  @Put(API_ROUTES.branding.adminLegalPage())
  update(
    @Req() request: Request,
    @Param("kind") kind: string,
    @Body(new ZodBodyPipe(updateLegalPageRequestSchema)) body: UpdateLegalPageRequest
  ) {
    return this.legalPages.update(this.getAccessToken(request), parseOrBadRequest(legalPageKindSchema, kind), body);
  }
}
