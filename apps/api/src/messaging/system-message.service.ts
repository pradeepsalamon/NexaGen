import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  effectiveSystemChannels,
  findMissingRequiredVariables,
  markdownToWhatsApp,
  sampleVariables,
  DEFAULT_TENANT_ID,
  SYSTEM_MESSAGE_DEFINITIONS,
  systemMessageKeysFor,
  type SystemMessageChannel,
  type SystemMessageItem,
  type SystemMessageKey,
  type SystemMessageListResponse,
  type TestMessagingRuleResponse,
  type TestSystemMessageRequest,
  type UpdateSystemMessageRequest
} from "@nexa-chess/types";
import type { SystemMessageTemplate, User } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { NotificationService } from "../notification/notification.service";
import { SystemMessageRenderer } from "../mail/system-message-renderer.service";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MessagingRuleService } from "./messaging-rule.service";
import { maskEmail, maskPhoneNumber } from "./messaging.format";

const WITH_EDITOR = { updatedBy: { select: { firstName: true, lastName: true } } };

type SavedTemplate = SystemMessageTemplate & {
  updatedBy: { firstName: string; lastName: string | null } | null;
};

/** Admin rewording of the fixed system messages. Sending goes through SystemMessageRenderer. */
@Injectable()
export class SystemMessageService {
  constructor(
    private readonly mail: MailService,
    private readonly notifications: NotificationService,
    private readonly prisma: PrismaService,
    private readonly renderer: SystemMessageRenderer,
    private readonly rules: MessagingRuleService,
    private readonly whatsapp: WhatsAppService
  ) {}

  async list(accessToken: string | undefined): Promise<SystemMessageListResponse> {
    const admin = await this.rules.assertAdmin(accessToken);

    const rows = await this.prisma.systemMessageTemplate.findMany({ include: WITH_EDITOR });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    return {
      emailConfigured: this.mail.isConfigured(),
      messages: systemMessageKeysFor(admin.tenantId === DEFAULT_TENANT_ID).map((key) => this.toItem(key, byKey.get(key) ?? null)),
      whatsappConfigured: this.whatsapp.isConfigured()
    };
  }

  /** Saving the defaults (wording and channels) clears the row, so a later change of default reaches it. */
  async update(
    accessToken: string | undefined,
    key: SystemMessageKey,
    dto: UpdateSystemMessageRequest
  ): Promise<SystemMessageItem> {
    const admin = await this.rules.assertAdmin(accessToken);
    this.assertVisible(admin, key);
    const definition = SYSTEM_MESSAGE_DEFINITIONS[key];

    const { defaults } = definition;
    const actionLabel = definition.actionVariable ? dto.actionLabel : null;
    if (definition.actionVariable && !actionLabel) {
      throw new BadRequestException("The button needs a label.");
    }
    const missing = findMissingRequiredVariables(key, dto.body);
    if (missing.length > 0) {
      throw new BadRequestException(
        `This message must include ${missing.map((name) => `{{${name}}}`).join(", ")}.`
      );
    }
    const unsupported = dto.channels.filter((channel) => !definition.channels.includes(channel));
    if (unsupported.length > 0) {
      throw new BadRequestException(definition.channelNote ?? "This message can't be sent that way.");
    }
    const channels = new Set(dto.channels);
    if (channels.size === 0) {
      throw new BadRequestException("Keep at least one channel on, or nobody receives this message.");
    }
    // Null = the standard WhatsApp text (the default's own, else the message body).
    const typed = definition.channels.includes("WHATSAPP") ? dto.whatsappBody : null;
    const whatsappBody = typed === defaults.whatsappBody ? null : typed;

    const sameChannels =
      channels.size === definition.defaultChannels.length &&
      definition.defaultChannels.every((channel) => channels.has(channel));
    if (
      dto.subject === defaults.subject &&
      dto.body === defaults.body &&
      actionLabel === defaults.actionLabel &&
      whatsappBody === null &&
      sameChannels
    ) {
      await this.prisma.systemMessageTemplate.deleteMany({ where: { key } });
      return this.toItem(key, null);
    }

    // A switch is stored only for a channel the message supports; null means "not applicable".
    const switchFor = (channel: SystemMessageChannel) =>
      definition.channels.includes(channel) ? channels.has(channel) : null;
    const data = {
      actionLabel,
      body: dto.body,
      emailEnabled: switchFor("EMAIL"),
      inAppEnabled: switchFor("IN_APP"),
      subject: dto.subject,
      updatedById: admin.id,
      whatsappBody,
      whatsappEnabled: switchFor("WHATSAPP")
    };
    // Per-academy key (§D5 makes it the primary key; `key` alone is Nexa's today).
    const tenantId = requireTenantId("systemMessageTemplate");
    const row = await this.prisma.systemMessageTemplate.upsert({
      create: { key, ...data },
      include: WITH_EDITOR,
      update: data,
      where: { tenantId_key: { key, tenantId } }
    });
    return this.toItem(key, row);
  }

  /**
   * Sends the saved wording with example values on one channel: email to the admin's own
   * address, WhatsApp to a typed number (else theirs), in-app to their own inbox.
   */
  async test(
    accessToken: string | undefined,
    key: SystemMessageKey,
    dto: TestSystemMessageRequest
  ): Promise<TestMessagingRuleResponse> {
    const admin = await this.rules.assertAdmin(accessToken);
    this.assertVisible(admin, key);
    const definition = SYSTEM_MESSAGE_DEFINITIONS[key];
    if (!definition.channels.includes(dto.channel)) {
      throw new BadRequestException(definition.channelNote ?? "This message can't be sent that way.");
    }
    const rendered = await this.renderer.renderAll(key, sampleVariables(definition.variables));

    if (dto.channel === "WHATSAPP") return this.testWhatsApp(admin, dto, rendered.whatsapp);
    if (dto.channel === "IN_APP") {
      await this.notifications.notify({
        body: rendered.body,
        dedupeKey: null,
        linkPath: definition.inAppLink ?? null,
        title: rendered.subject,
        type: "SYSTEM_MESSAGE",
        userId: admin.id
      });
      return { error: null, preview: rendered.body, sent: true, to: "your in-app inbox" };
    }
    return this.testEmail(key, admin, rendered.body);
  }

  /** A platform-only message (e.g. the integrity alert) is Nexa's: another academy's admins never see it. */
  private assertVisible(admin: Pick<User, "tenantId">, key: SystemMessageKey) {
    if (SYSTEM_MESSAGE_DEFINITIONS[key].platformOnly && admin.tenantId !== DEFAULT_TENANT_ID) {
      throw new NotFoundException("Message not found.");
    }
  }

  private async testEmail(
    key: SystemMessageKey,
    admin: User,
    preview: string
  ): Promise<TestMessagingRuleResponse> {
    if (!this.mail.isConfigured()) {
      return { error: "Email is not configured — set the SMTP variables.", preview, sent: false, to: null };
    }
    const to = maskEmail(admin.email);
    try {
      await this.mail.sendSystemMessageSample(key, admin.email);
      return { error: null, preview, sent: true, to };
    } catch (error) {
      return { error: (error as Error).message, preview, sent: false, to };
    }
  }

  private async testWhatsApp(
    admin: User,
    dto: TestSystemMessageRequest,
    preview: string
  ): Promise<TestMessagingRuleResponse> {
    if (!this.whatsapp.isConfigured()) {
      return {
        error: "WhatsApp is not configured — set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
        preview,
        sent: false,
        to: null
      };
    }
    const to = this.whatsapp.normalizeRecipient(dto.phoneNumber ?? admin.phoneNumber);
    if (!to) {
      return {
        error: dto.phoneNumber
          ? "That is not a valid WhatsApp number."
          : "Add a phone number to your profile, or type one to test with.",
        preview,
        sent: false,
        to: null
      };
    }
    const outcome = await this.whatsapp.trySendText({ body: markdownToWhatsApp(preview), to });
    return {
      error: outcome.ok ? null : outcome.error.message,
      preview,
      sent: outcome.ok,
      to: maskPhoneNumber(to)
    };
  }

  private toItem(key: SystemMessageKey, row: SavedTemplate | null): SystemMessageItem {
    const { defaults } = SYSTEM_MESSAGE_DEFINITIONS[key];
    return {
      actionLabel: row?.actionLabel ?? defaults.actionLabel,
      body: row?.body ?? defaults.body,
      channels: effectiveSystemChannels(key, {
        EMAIL: row?.emailEnabled ?? null,
        IN_APP: row?.inAppEnabled ?? null,
        WHATSAPP: row?.whatsappEnabled ?? null
      }),
      isCustomized: Boolean(row),
      key,
      subject: row?.subject ?? defaults.subject,
      whatsappBody: row?.whatsappBody ?? null,
      updatedAt: row ? row.updatedAt.toISOString() : null,
      updatedByName: row?.updatedBy
        ? `${row.updatedBy.firstName} ${row.updatedBy.lastName ?? ""}`.trim()
        : null
    };
  }
}
