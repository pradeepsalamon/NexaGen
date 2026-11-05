import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Put, Req, ServiceUnavailableException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  updateWhatsAppSettingsRequestSchema,
  type UpdateWhatsAppSettingsRequest,
  type WhatsAppSettingsResponse
} from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { authenticateUser } from "../auth/authenticate";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { WhatsAppCredentialsService } from "./whatsapp-credentials.service";

/** The academy's own WhatsApp number (super admin only; §F "WhatsApp"). */
@Injectable()
export class WhatsAppSettingsService {
  constructor(
    private readonly credentials: WhatsAppCredentialsService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  private async superAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException("Only a super admin can change WhatsApp settings.");
    return user;
  }

  async get(accessToken: string | undefined): Promise<WhatsAppSettingsResponse> {
    await this.superAdmin(accessToken);
    return this.view(requireTenantId("whatsappSettings"));
  }

  async update(accessToken: string | undefined, body: UpdateWhatsAppSettingsRequest): Promise<WhatsAppSettingsResponse> {
    const user = await this.superAdmin(accessToken);
    const tenantId = requireTenantId("whatsappSettings");
    if (tenantId === DEFAULT_TENANT_ID) {
      throw new BadRequestException("NexaChess's own academy uses the server's WhatsApp settings.");
    }
    if (!this.credentials.canStore()) throw new ServiceUnavailableException("Storing WhatsApp tokens isn't set up on this server.");
    const existing = await this.prisma.whatsAppSettings.findUnique({ where: { tenantId } });
    const token = body.accessToken ? this.credentials.encrypt(body.accessToken) : existing?.accessTokenEncrypted ?? null;
    if (body.enabled && !token) throw new BadRequestException("Enter the access token to turn WhatsApp on.");
    const data = { accessTokenEncrypted: token, enabled: body.enabled, phoneNumberId: body.phoneNumberId, updatedById: user.id };
    await this.prisma.whatsAppSettings.upsert({ create: { ...data, tenantId }, update: data, where: { tenantId } });
    await this.credentials.refresh(tenantId);
    return this.view(tenantId);
  }

  private async view(tenantId: string): Promise<WhatsAppSettingsResponse> {
    if (tenantId === DEFAULT_TENANT_ID) {
      return { configured: false, enabled: false, hasAccessToken: false, phoneNumberId: null, updatedAt: null, usesPlatformNumber: true };
    }
    const row = await this.prisma.whatsAppSettings.findUnique({ where: { tenantId } });
    return {
      configured: this.credentials.forTenant(tenantId) !== null,
      enabled: row?.enabled ?? false,
      hasAccessToken: Boolean(row?.accessTokenEncrypted),
      phoneNumberId: row?.phoneNumberId ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      usesPlatformNumber: false
    };
  }
}

@Controller()
export class WhatsAppSettingsController {
  constructor(private readonly settings: WhatsAppSettingsService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.branding.whatsapp)
  get(@Req() request: Request) {
    return this.settings.get(this.getAccessToken(request));
  }

  @Put(API_ROUTES.branding.whatsapp)
  update(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateWhatsAppSettingsRequestSchema)) body: UpdateWhatsAppSettingsRequest
  ) {
    return this.settings.update(this.getAccessToken(request), body);
  }
}
