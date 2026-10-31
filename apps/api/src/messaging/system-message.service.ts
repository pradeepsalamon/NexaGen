import { BadRequestException, Injectable } from "@nestjs/common";
import {
  findMissingRequiredVariables,
  markdownToWhatsApp,
  sampleVariables,
  SYSTEM_MESSAGE_DEFINITIONS,
  SYSTEM_MESSAGE_KEYS,
  type SystemMessageItem,
  type SystemMessageKey,
  type SystemMessageListResponse,
  type TestMessagingRuleResponse,
  type TestSystemMessageRequest,
  type UpdateSystemMessageRequest
} from "@nexa-chess/types";
import type { SystemMessageTemplate, User } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { SystemMessageRenderer } from "../mail/system-message-renderer.service";
import { PrismaService } from "../prisma/prisma.service";
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
    private readonly prisma: PrismaService,
    private readonly renderer: SystemMessageRenderer,
    private readonly rules: MessagingRuleService,
    private readonly whatsapp: WhatsAppService
  ) {}

  async list(accessToken: string | undefined): Promise<SystemMessageListResponse> {
    await this.rules.assertAdmin(accessToken);

    const rows = await this.prisma.systemMessageTemplate.findMany({ include: WITH_EDITOR });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    return {
      emailConfigured: this.mail.isConfigured(),
      messages: SYSTEM_MESSAGE_KEYS.map((key) => this.toItem(key, byKey.get(key) ?? null)),
      whatsappConfigured: this.whatsapp.isConfigured()
    };
  }

  /** Saving the default wording clears the row, so a later change of default reaches it. */
  async update(
    accessToken: string | undefined,
    key: SystemMessageKey,
    dto: UpdateSystemMessageRequest
  ): Promise<SystemMessageItem> {
    const admin = await this.rules.assertAdmin(accessToken);
    const definition = SYSTEM_MESSAGE_DEFINITIONS[key];

    const subject = definition.channel === "EMAIL" ? dto.subject : null;
    const actionLabel = definition.actionVariable ? dto.actionLabel : null;
    if (definition.channel === "EMAIL" && !subject) {
      throw new BadRequestException("An email needs a subject.");
    }
    if (definition.actionVariable && !actionLabel) {
      throw new BadRequestException("The button needs a label.");
    }
    const missing = findMissingRequiredVariables(key, dto.body);
    if (missing.length > 0) {
      throw new BadRequestException(
        `This message must include ${missing.map((name) => `{{${name}}}`).join(", ")}.`
      );
    }

    const { defaults } = definition;
    if (
      subject === defaults.subject &&
      dto.body === defaults.body &&
      actionLabel === defaults.actionLabel
    ) {
      await this.prisma.systemMessageTemplate.deleteMany({ where: { key } });
      return this.toItem(key, null);
    }

    const data = { actionLabel, body: dto.body, subject, updatedById: admin.id };
    const row = await this.prisma.systemMessageTemplate.upsert({
      create: { key, ...data },
      include: WITH_EDITOR,
      update: data,
      where: { key }
    });
    return this.toItem(key, row);
  }

  /** Sends the saved wording with example values. An email test only goes to the admin's own account. */
  async test(
    accessToken: string | undefined,
    key: SystemMessageKey,
    dto: TestSystemMessageRequest
  ): Promise<TestMessagingRuleResponse> {
    const admin = await this.rules.assertAdmin(accessToken);
    const definition = SYSTEM_MESSAGE_DEFINITIONS[key];
    const { body: preview } = await this.renderer.render(key, sampleVariables(definition.variables));

    return definition.channel === "EMAIL"
      ? this.testEmail(key, admin, preview)
      : this.testWhatsApp(admin, dto, preview);
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
      actionLabel: row ? row.actionLabel : defaults.actionLabel,
      body: row ? row.body : defaults.body,
      isCustomized: Boolean(row),
      key,
      subject: row ? row.subject : defaults.subject,
      updatedAt: row ? row.updatedAt.toISOString() : null,
      updatedByName: row?.updatedBy
        ? `${row.updatedBy.firstName} ${row.updatedBy.lastName ?? ""}`.trim()
        : null
    };
  }
}
