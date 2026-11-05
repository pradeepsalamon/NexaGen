import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  API_ROUTES,
  BRAND_ASSET_MAX_BYTES,
  brandAssetKindSchema,
  updateTenantBrandingRequestSchema,
  updateWhiteLabelRequestSchema,
  type UpdateTenantBrandingRequest,
  type UpdateWhiteLabelRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { RequireAccessTokenInterceptor } from "../common/security/require-access-token.interceptor";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { BrandingService } from "./branding.service";
import { DomainCheckService } from "../tenancy/domain-check.service";

const MAX_ASSET_BYTES = Math.max(...Object.values(BRAND_ASSET_MAX_BYTES));

/** Public, by host: what every page on the academy's address needs before sign-in. */
@Controller()
@RequireFeature(null)
export class PublicBrandingController {
  constructor(
    private readonly branding: BrandingService,
    private readonly domainCheck: DomainCheckService
  ) {}

  @Get(API_ROUTES.branding.publicConfig)
  publicConfig() {
    return this.branding.publicConfig();
  }

  /** Echoes a token the console just issued, proving this host reaches this deployment. */
  @Get(API_ROUTES.branding.domainCheck())
  check(@Param("token") token: string) {
    if (!this.domainCheck.isIssued(token)) throw new NotFoundException();
    return { token };
  }
}

/** The academy's admins: logo, colours, sender name (plan `brandIdentity`). */
@Controller()
@RequireFeature("brandIdentity", { allowReads: true })
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.branding.admin)
  get(@Req() request: Request) {
    return this.branding.get(this.getAccessToken(request));
  }

  @Put(API_ROUTES.branding.admin)
  update(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateTenantBrandingRequestSchema)) body: UpdateTenantBrandingRequest
  ) {
    return this.branding.update(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.branding.asset())
  @UseInterceptors(
    RequireAccessTokenInterceptor,
    FileInterceptor("file", { limits: { fields: 2, fileSize: MAX_ASSET_BYTES, files: 1 } })
  )
  uploadAsset(@Req() request: Request, @Param("kind") kind: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.branding.uploadAsset(this.getAccessToken(request), parseOrBadRequest(brandAssetKindSchema, kind), file);
  }

  @Delete(API_ROUTES.branding.asset())
  clearAsset(@Req() request: Request, @Param("kind") kind: string) {
    return this.branding.clearAsset(this.getAccessToken(request), parseOrBadRequest(brandAssetKindSchema, kind));
  }

  /** Hide or show "Powered by NexaChess" (plan `whiteLabel`). */
  @Put(API_ROUTES.branding.whiteLabel)
  @RequireFeature("whiteLabel")
  setWhiteLabel(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateWhiteLabelRequestSchema)) body: UpdateWhiteLabelRequest
  ) {
    return this.branding.setWhiteLabel(this.getAccessToken(request), body);
  }

  /** The academy's own addresses and DNS target (plan `customDomain`). */
  @Get(API_ROUTES.branding.domains)
  @RequireFeature("customDomain")
  domains(@Req() request: Request) {
    return this.branding.domains(this.getAccessToken(request));
  }
}
