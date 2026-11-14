import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Put,
  Req,
  ServiceUnavailableException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  updateWhatsAppSettingsRequestSchema,
  type UpdateWhatsAppSettingsRequest,
  type WhatsAppSettingsResponse
} from "@nexa-chess/types";
import { Prisma, UserRole } from "@prisma/client";
import type { Request } from "express";
import { authenticateUser } from "../auth/authenticate";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";
import { requireTenantId } from "../tenancy/tenant-sql";
import { WhatsAppCredentialsService } from "./whatsapp-credentials.service";

/** The academy's own WhatsApp number (super admin only; §F "WhatsApp"). */
@Injectable()
export class WhatsAppSettingsService {
  private readonly env = getApiEnv();

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
    await this.assertNumberFree(tenantId, body.phoneNumberId);

    const existing = await this.prisma.whatsAppSettings.findUnique({ where: { tenantId } });
    const token = body.accessToken ? this.credentials.encrypt(body.accessToken) : existing?.accessTokenEncrypted ?? null;
    const appSecret = body.appSecret ? this.credentials.encrypt(body.appSecret) : existing?.appSecretEncrypted ?? null;
    if (body.enabled && !token) throw new BadRequestException("Enter the access token to turn WhatsApp on.");
    const data = {
      accessTokenEncrypted: token,
      appSecretEncrypted: appSecret,
      enabled: body.enabled,
      phoneNumberId: body.phoneNumberId,
      updatedById: user.id,
      ...(body.wabaId === undefined ? {} : { wabaId: body.wabaId || null }),
      // The webhook URL and verify token are made once and then kept, so what
      // the academy pasted into Meta keeps working.
      ...(existing?.webhookKey ? {} : { webhookKey: this.credentials.newWebhookKey() }),
      ...(existing?.verifyTokenEncrypted ? {} : { verifyTokenEncrypted: this.credentials.encrypt(this.credentials.newVerifyToken()) })
    };
    try {
      await this.prisma.whatsAppSettings.upsert({ create: { ...data, tenantId }, update: data, where: { tenantId } });
    } catch (error) {
      // Two academies saving the same number at once: the unique index decides.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw this.numberTaken();
      throw error;
    }
    await this.credentials.refresh(tenantId);
    return this.view(tenantId);
  }

  /** One academy per number: incoming messages are routed by it. Nexa's own number is never available. */
  private async assertNumberFree(tenantId: string, phoneNumberId: string) {
    if (phoneNumberId === this.env.WHATSAPP_PHONE_NUMBER_ID) throw this.numberTaken();
    const other = await asPlatform("whatsapp:number-check", () =>
      this.prisma.whatsAppSettings.findFirst({ select: { id: true }, where: { phoneNumberId, tenantId: { not: tenantId } } })
    );
    if (other) throw this.numberTaken();
  }

  private numberTaken() {
    return new ConflictException("This WhatsApp number is already connected to another academy.");
  }

  private async view(tenantId: string): Promise<WhatsAppSettingsResponse> {
    if (tenantId === DEFAULT_TENANT_ID) {
      return {
        configured: false,
        enabled: false,
        hasAccessToken: false,
        hasAppSecret: false,
        lastWebhookAt: null,
        phoneNumberId: null,
        receiving: false,
        updatedAt: null,
        usesPlatformNumber: true,
        verifyToken: null,
        wabaId: null,
        webhookPath: null
      };
    }
    const row = await this.prisma.whatsAppSettings.findUnique({ where: { tenantId } });
    return {
      configured: this.credentials.forTenant(tenantId) !== null,
      enabled: row?.enabled ?? false,
      hasAccessToken: Boolean(row?.accessTokenEncrypted),
      hasAppSecret: Boolean(row?.appSecretEncrypted),
      lastWebhookAt: row?.lastWebhookAt?.toISOString() ?? null,
      phoneNumberId: row?.phoneNumberId ?? null,
      receiving: row?.webhookKey ? this.credentials.inboundFor(row.webhookKey) !== null : false,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      usesPlatformNumber: false,
      verifyToken: this.credentials.decrypt(row?.verifyTokenEncrypted ?? null),
      wabaId: row?.wabaId ?? null,
      webhookPath: row?.webhookKey ? API_ROUTES.whatsappWebhookAcademy(row.webhookKey) : null
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
