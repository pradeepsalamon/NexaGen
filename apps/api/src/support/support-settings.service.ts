import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { type ApiEnv, getApiEnv } from "@nexa-chess/config/api";
import {
  DEFAULT_TENANT_ID,
  type SupportSettingsResponse,
  type SupportSettingsValues,
  type UpdateSupportSettingsRequest
} from "@nexa-chess/types";
import { type SupportSettings, UserRole } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { EntitlementService } from "../platform/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { normalizeWhatsAppNumber } from "../whatsapp/whatsapp.utils";

export type EffectiveSupportSettings = SupportSettingsValues & { source: "ACADEMY" | "SERVER" };

type ServerDefaults = Pick<
  ApiEnv,
  | "SUPPORT_AGENT_REPLY_TEMPLATE"
  | "SUPPORT_AGENT_REPLY_TEMPLATE_LANGUAGE"
  | "SUPPORT_BOT_ENABLED"
  | "SUPPORT_LEAD_NUDGE_HOURS"
  | "SUPPORT_STAFF_REMINDER_MINUTES"
  | "SUPPORT_TEST_NUMBERS_ALLOWLIST"
  | "WHATSAPP_DEFAULT_COUNTRY_CODE"
>;

function parseNumbers(raw: string | undefined, countryCode: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => normalizeWhatsAppNumber(value, countryCode))
    .filter((value): value is string => Boolean(value));
}

/**
 * The bot settings an academy runs with (docs/WHATSAPP_SUPPORT_MODES_PLAN.md
 * §9). A saved row always wins. Without one, Nexa's academy keeps the server's
 * SUPPORT_* env values (so production behaves as before until an admin saves
 * the page) and any other academy has the bot off.
 */
export function resolveSupportSettings(
  row: Pick<
    SupportSettings,
    "agentReplyTemplate" | "agentReplyTemplateLanguage" | "botEnabled" | "leadNudgeHours" | "staffReminderMinutes" | "testNumbers"
  > | null,
  tenantId: string,
  env: ServerDefaults
): EffectiveSupportSettings {
  if (row) {
    return {
      agentReplyTemplate: row.agentReplyTemplate,
      agentReplyTemplateLanguage: row.agentReplyTemplateLanguage,
      botEnabled: row.botEnabled,
      leadNudgeHours: row.leadNudgeHours,
      source: "ACADEMY",
      staffReminderMinutes: row.staffReminderMinutes,
      testNumbers: row.testNumbers
    };
  }
  if (tenantId === DEFAULT_TENANT_ID) {
    return {
      agentReplyTemplate: env.SUPPORT_AGENT_REPLY_TEMPLATE || null,
      agentReplyTemplateLanguage: env.SUPPORT_AGENT_REPLY_TEMPLATE_LANGUAGE,
      botEnabled: env.SUPPORT_BOT_ENABLED,
      leadNudgeHours: env.SUPPORT_LEAD_NUDGE_HOURS,
      source: "SERVER",
      staffReminderMinutes: env.SUPPORT_STAFF_REMINDER_MINUTES,
      testNumbers: parseNumbers(env.SUPPORT_TEST_NUMBERS_ALLOWLIST, env.WHATSAPP_DEFAULT_COUNTRY_CODE)
    };
  }
  return {
    agentReplyTemplate: null,
    agentReplyTemplateLanguage: "en",
    botEnabled: false,
    leadNudgeHours: 20,
    source: "ACADEMY",
    staffReminderMinutes: 15,
    testNumbers: []
  };
}

/** Whether the bot may act on (or write first to) this number: switched on, and on the test list while one is set. */
export function supportAnswersNumber(settings: Pick<SupportSettingsValues, "botEnabled" | "testNumbers">, waId: string): boolean {
  if (!settings.botEnabled) return false;
  return settings.testNumbers.length === 0 || settings.testNumbers.includes(waId);
}

/**
 * Per-academy WhatsApp bot settings: what the webhook, follow-ups and staff
 * replies read, and the `/admin/support/settings` page (admins).
 */
@Injectable()
export class SupportSettingsService {
  private readonly env = getApiEnv();

  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  /** The settings for the current academy. Call inside it (request or `runInTenant`). */
  async current(): Promise<EffectiveSupportSettings> {
    const tenantId = requireTenantId("supportSettings");
    const row = await this.prisma.supportSettings.findUnique({ where: { tenantId } });
    return resolveSupportSettings(row, tenantId, this.env);
  }

  /**
   * The settings the bot acts on now: switched off when the academy's plan
   * lacks WhatsApp support, whatever was saved (the inbox stays readable).
   */
  async forBot(): Promise<EffectiveSupportSettings> {
    const settings = await this.current();
    if (!settings.botEnabled) return settings;
    const allowed = await this.entitlements.hasFeature("whatsappSupport");
    return allowed ? settings : { ...settings, botEnabled: false };
  }

  async get(accessToken: string | undefined): Promise<SupportSettingsResponse> {
    await this.getAdmin(accessToken);
    return this.view();
  }

  async update(accessToken: string | undefined, body: UpdateSupportSettingsRequest): Promise<SupportSettingsResponse> {
    const user = await this.getAdmin(accessToken);
    const tenantId = requireTenantId("supportSettings");
    const testNumbers: string[] = [];
    for (const raw of body.testNumbers) {
      const number = normalizeWhatsAppNumber(raw, this.env.WHATSAPP_DEFAULT_COUNTRY_CODE);
      if (!number) throw new BadRequestException(`"${raw.slice(0, 30)}" is not a phone number. Use the full number with country code.`);
      if (!testNumbers.includes(number)) testNumbers.push(number);
    }
    const data = {
      agentReplyTemplate: body.agentReplyTemplate || null,
      agentReplyTemplateLanguage: body.agentReplyTemplateLanguage,
      botEnabled: body.botEnabled,
      leadNudgeHours: body.leadNudgeHours,
      staffReminderMinutes: body.staffReminderMinutes,
      testNumbers,
      updatedById: user.id
    };
    await this.prisma.supportSettings.upsert({ create: { ...data, tenantId }, update: data, where: { tenantId } });
    return this.view();
  }

  private async view(): Promise<SupportSettingsResponse> {
    const tenantId = requireTenantId("supportSettings");
    const [row, whatsapp] = await Promise.all([
      this.prisma.supportSettings.findUnique({ where: { tenantId } }),
      tenantId === DEFAULT_TENANT_ID ? null : this.prisma.whatsAppSettings.findUnique({ where: { tenantId } })
    ]);
    const { source, ...values } = resolveSupportSettings(row, tenantId, this.env);
    const usesPlatformNumber = tenantId === DEFAULT_TENANT_ID;
    return {
      ...values,
      connection: {
        lastWebhookAt: whatsapp?.lastWebhookAt?.toISOString() ?? null,
        receiving: usesPlatformNumber
          ? Boolean(this.env.WHATSAPP_APP_SECRET && this.env.WHATSAPP_PHONE_NUMBER_ID)
          : Boolean(whatsapp?.enabled && whatsapp.accessTokenEncrypted && whatsapp.appSecretEncrypted && whatsapp.webhookKey),
        usesPlatformNumber
      },
      source,
      updatedAt: row?.updatedAt.toISOString() ?? null
    };
  }

  private async getAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can change the WhatsApp bot settings.");
    }
    return user;
  }
}
