import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  Put,
  Req,
  ServiceUnavailableException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  TENANT_GATEWAY_PROVIDERS,
  tenantGatewayProviderSchema,
  updateTenantGatewayRequestSchema,
  type TenantGatewayProvider,
  type TenantGatewaysResponse,
  type UpdateTenantGatewayRequest
} from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { authenticateUser } from "../auth/authenticate";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { GatewayCredentialsService } from "./gateway-credentials.service";

const WEBHOOK_ROUTE: Record<TenantGatewayProvider, (key: string) => string> = {
  CASHFREE: API_ROUTES.payments.webhookCashfreeAcademy,
  RAZORPAY: API_ROUTES.payments.webhookRazorpayAcademy,
  STRIPE: API_ROUTES.payments.webhookStripeAcademy
};

/**
 * The academy's own gateway keys (docs/SAAS_MULTI_TENANCY.md §G "Two money
 * flows" 2; Phase 6). Super admin only: these are the keys money lands with.
 * Nexa's academy keeps the server's env keys and can't store any here.
 */
@Injectable()
export class TenantGatewaysService {
  constructor(
    private readonly credentials: GatewayCredentialsService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  private async superAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException("Only a super admin can change payment gateway keys.");
    return user;
  }

  async list(accessToken: string | undefined): Promise<TenantGatewaysResponse> {
    await this.superAdmin(accessToken);
    return this.view(requireTenantId("tenantGateways"));
  }

  async update(
    accessToken: string | undefined,
    providerParam: string,
    body: UpdateTenantGatewayRequest
  ): Promise<TenantGatewaysResponse> {
    const user = await this.superAdmin(accessToken);
    const provider = parseOrBadRequest(tenantGatewayProviderSchema, providerParam.toUpperCase(), "provider");
    const tenantId = requireTenantId("tenantGateways");
    if (tenantId === DEFAULT_TENANT_ID) {
      throw new BadRequestException("NexaChess's own academy uses the server's gateway keys.");
    }
    if (!this.credentials.canStore()) throw new ServiceUnavailableException("Storing gateway keys isn't set up on this server.");

    const existing = await this.prisma.tenantPaymentCredential.findUnique({
      where: { tenantId_provider: { provider, tenantId } }
    });
    const stored = existing ? this.credentials.decrypt(existing.secretsEncrypted) : null;
    const keySecret = body.keySecret ?? stored?.keySecret ?? null;
    if (!keySecret) throw new BadRequestException("Enter the secret key.");
    const webhookSecret = body.webhookSecret ?? stored?.webhookSecret ?? null;
    // Razorpay and Stripe sign webhooks with their own secret; without it no
    // payment can be confirmed, so the gateway can't go live.
    if (body.enabled && provider !== "CASHFREE" && !webhookSecret) {
      throw new BadRequestException("Enter the webhook secret to turn this gateway on.");
    }
    const data = {
      enabled: body.enabled,
      publicKey: body.publicKey,
      secretsEncrypted: this.credentials.encrypt({ keySecret, webhookSecret }),
      updatedById: user.id
    };
    await this.prisma.tenantPaymentCredential.upsert({
      create: { ...data, provider, tenantId, webhookKey: this.credentials.newWebhookKey() },
      update: data,
      where: { tenantId_provider: { provider, tenantId } }
    });
    await this.credentials.refresh(tenantId);
    return this.view(tenantId);
  }

  private async view(tenantId: string): Promise<TenantGatewaysResponse> {
    if (tenantId === DEFAULT_TENANT_ID) {
      return {
        canStore: this.credentials.canStore(),
        gateways: TENANT_GATEWAY_PROVIDERS.map((provider) => ({
          configured: false,
          enabled: false,
          hasKeySecret: false,
          hasWebhookSecret: false,
          provider,
          publicKey: null,
          updatedAt: null,
          webhookPath: null
        })),
        usesPlatformAccount: true
      };
    }
    const rows = await this.prisma.tenantPaymentCredential.findMany({ where: { tenantId } });
    return {
      canStore: this.credentials.canStore(),
      gateways: TENANT_GATEWAY_PROVIDERS.map((provider) => {
        const row = rows.find((candidate) => candidate.provider === provider);
        const secrets = row ? this.credentials.decrypt(row.secretsEncrypted) : null;
        return {
          configured: Boolean(row?.enabled && secrets),
          enabled: row?.enabled ?? false,
          hasKeySecret: Boolean(secrets?.keySecret),
          hasWebhookSecret: Boolean(secrets?.webhookSecret),
          provider,
          publicKey: row?.publicKey ?? null,
          updatedAt: row?.updatedAt.toISOString() ?? null,
          webhookPath: row ? WEBHOOK_ROUTE[provider](row.webhookKey) : null
        };
      }),
      usesPlatformAccount: false
    };
  }
}

@Controller()
@RequireFeature("studentPayments", { allowReads: true })
export class TenantGatewaysController {
  constructor(private readonly gateways: TenantGatewaysService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.adminPayments.gateways)
  list(@Req() request: Request) {
    return this.gateways.list(this.getAccessToken(request));
  }

  @Put(API_ROUTES.adminPayments.gateway())
  update(
    @Req() request: Request,
    @Param("provider") provider: string,
    @Body(new ZodBodyPipe(updateTenantGatewayRequestSchema)) body: UpdateTenantGatewayRequest
  ) {
    return this.gateways.update(this.getAccessToken(request), provider, body);
  }
}
