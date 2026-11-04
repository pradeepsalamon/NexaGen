import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  addPlatformTenantDomainRequestSchema,
  API_ROUTES,
  createPlatformTenantRequestSchema,
  platformTenantStatusRequestSchema,
  updatePlatformTenantRequestSchema,
  type AddPlatformTenantDomainRequest,
  type CreatePlatformTenantRequest,
  type PlatformTenantStatusRequest,
  type UpdatePlatformTenantRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { queryString } from "../common/query-params";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { PlatformTenantsService } from "./platform-tenants.service";

/** Platform console: academies, their domains, and the audit log (docs/SAAS_MULTI_TENANCY.md §I). */
@Controller()
export class PlatformTenantsController {
  constructor(private readonly tenants: PlatformTenantsService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.platform.tenants)
  list(@Req() request: Request) {
    return this.tenants.list(this.getAccessToken(request));
  }

  @Post(API_ROUTES.platform.tenants)
  create(
    @Req() request: Request,
    @Body(new ZodBodyPipe(createPlatformTenantRequestSchema)) body: CreatePlatformTenantRequest
  ) {
    return this.tenants.create(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.platform.audit)
  audit(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.tenants.audit(this.getAccessToken(request), {
      cursor: queryString(query.cursor, "cursor"),
      tenantId: queryString(query.tenantId, "tenantId")
    });
  }

  @Get(API_ROUTES.platform.tenant())
  get(@Req() request: Request, @Param("tenantId") tenantId: string) {
    return this.tenants.get(this.getAccessToken(request), tenantId);
  }

  @Patch(API_ROUTES.platform.tenant())
  update(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(updatePlatformTenantRequestSchema)) body: UpdatePlatformTenantRequest
  ) {
    return this.tenants.update(this.getAccessToken(request), tenantId, body);
  }

  @Post(API_ROUTES.platform.tenantSuspend())
  suspend(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(platformTenantStatusRequestSchema)) body: PlatformTenantStatusRequest
  ) {
    return this.tenants.suspend(this.getAccessToken(request), tenantId, body);
  }

  @Post(API_ROUTES.platform.tenantReactivate())
  reactivate(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(platformTenantStatusRequestSchema)) body: PlatformTenantStatusRequest
  ) {
    return this.tenants.reactivate(this.getAccessToken(request), tenantId, body);
  }

  @Post(API_ROUTES.platform.tenantDomains())
  addDomain(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(addPlatformTenantDomainRequestSchema)) body: AddPlatformTenantDomainRequest
  ) {
    return this.tenants.addDomain(this.getAccessToken(request), tenantId, body);
  }

  @Delete(API_ROUTES.platform.tenantDomain())
  removeDomain(@Req() request: Request, @Param("tenantId") tenantId: string, @Param("domainId") domainId: string) {
    return this.tenants.removeDomain(this.getAccessToken(request), tenantId, domainId);
  }

  @Post(API_ROUTES.platform.tenantDomainPrimary())
  makePrimary(@Req() request: Request, @Param("tenantId") tenantId: string, @Param("domainId") domainId: string) {
    return this.tenants.makePrimary(this.getAccessToken(request), tenantId, domainId);
  }
}
