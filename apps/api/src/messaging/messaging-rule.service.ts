import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  DEFAULT_MESSAGING_RULES,
  MESSAGING_EVENTS,
  MESSAGING_EVENT_DEFINITIONS,
  renderMessageTemplate,
  sampleVariablesFor,
  type MessageDeliveryItem,
  type MessageDeliveryListResponse,
  type MessageDeliveryQuery,
  type MessagingEvent,
  type MessagingRuleItem,
  type MessagingRuleListResponse,
  type TestMessagingRuleRequest,
  type TestMessagingRuleResponse,
  type UpdateMessagingRuleRequest
} from "@nexa-chess/types";
import {
  Prisma,
  UserRole,
  type MessageDelivery,
  type MessagingRule,
  type User
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { maskPhoneNumber } from "./messaging.format";
import { authenticateUser } from "../auth/authenticate";

/**
 * Admin-facing CRUD over the one-row-per-event rule table, plus the delivery
 * log. The dispatcher reads rules through {@link getRule}, which is also what
 * seeds a missing row from the shared defaults.
 */
@Injectable()
export class MessagingRuleService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService
  ) {}

  // ── admin API ──

  async list(accessToken: string | undefined): Promise<MessagingRuleListResponse> {
    await this.assertAdmin(accessToken);
    await this.seedMissingRules();

    const rows = await this.prisma.messagingRule.findMany({
      include: { updatedBy: { select: { firstName: true, lastName: true } } }
    });
    const byEvent = new Map(rows.map((row) => [row.event, row]));

    return {
      // Catalogue order, not insertion order — the UI reads as a story.
      rules: MESSAGING_EVENTS.map((event) => this.toItem(byEvent.get(event)!)),
      whatsappConfigured: this.whatsapp.isConfigured()
    };
  }

  async update(
    accessToken: string | undefined,
    event: MessagingEvent,
    dto: UpdateMessagingRuleRequest
  ): Promise<MessagingRuleItem> {
    const admin = await this.assertAdmin(accessToken);
    await this.getRule(event);

    const definition = MESSAGING_EVENT_DEFINITIONS[event];
    if (dto.audience && !definition.audiences.includes(dto.audience)) {
      throw new ForbiddenException(
        `"${definition.label}" cannot be sent to ${dto.audience}.`
      );
    }

    const row = await this.prisma.messagingRule.update({
      where: { event },
      data: {
        ...(dto.enabled === undefined ? {} : { enabled: dto.enabled }),
        ...(dto.whatsappEnabled === undefined
          ? {}
          : { whatsappEnabled: dto.whatsappEnabled }),
        ...(dto.inAppEnabled === undefined
          ? {}
          : { inAppEnabled: dto.inAppEnabled }),
        ...(dto.audience === undefined ? {} : { audience: dto.audience }),
        // A lead time on an immediate event would be silently ignored.
        ...(dto.leadTimeMinutes === undefined || !definition.supportsLeadTime
          ? {}
          : { leadTimeMinutes: dto.leadTimeMinutes }),
        // A send time on a lead-time event would be silently ignored too.
        ...(dto.scheduleMode === undefined || definition.supportsLeadTime
          ? {}
          : { scheduleMode: dto.scheduleMode }),
        ...(dto.scheduleHour === undefined ? {} : { scheduleHour: dto.scheduleHour }),
        ...(dto.scheduleMinute === undefined
          ? {}
          : { scheduleMinute: dto.scheduleMinute }),
        ...(dto.scheduleDayOfWeek === undefined
          ? {}
          : { scheduleDayOfWeek: dto.scheduleDayOfWeek }),
        ...(dto.weekdaysOnly === undefined ? {} : { weekdaysOnly: dto.weekdaysOnly }),
        ...(dto.title === undefined ? {} : { title: dto.title }),
        ...(dto.body === undefined ? {} : { body: dto.body }),
        ...(dto.whatsappTemplateName === undefined
          ? {}
          : { whatsappTemplateName: dto.whatsappTemplateName || null }),
        ...(dto.whatsappTemplateLanguage === undefined
          ? {}
          : { whatsappTemplateLanguage: dto.whatsappTemplateLanguage || null }),
        ...(dto.whatsappTemplateParams === undefined
          ? {}
          : { whatsappTemplateParams: dto.whatsappTemplateParams }),
        updatedById: admin.id
      },
      include: { updatedBy: { select: { firstName: true, lastName: true } } }
    });

    return this.toItem(row);
  }

  /** Renders the rule with sample values and sends it to one number. */
  async testRule(
    accessToken: string | undefined,
    event: MessagingEvent,
    dto: TestMessagingRuleRequest
  ): Promise<TestMessagingRuleResponse> {
    const admin = await this.assertAdmin(accessToken);
    const rule = await this.getRule(event);
    const preview = renderMessageTemplate(rule.body, sampleVariablesFor(event));

    if (!this.whatsapp.isConfigured()) {
      return {
        sent: false,
        to: null,
        preview,
        error: "WhatsApp is not configured — set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID."
      };
    }

    const to = this.whatsapp.normalizeRecipient(
      dto.phoneNumber ?? admin.phoneNumber
    );
    if (!to) {
      return {
        sent: false,
        to: null,
        preview,
        error: dto.phoneNumber
          ? "That is not a valid WhatsApp number."
          : "Add a phone number to your profile, or type one to test with."
      };
    }

    const outcome = await this.whatsapp.trySendText({ to, body: preview });

    await this.prisma.messageDelivery.create({
      data: {
        event,
        channel: "WHATSAPP",
        status: outcome.ok ? "SENT" : "FAILED",
        recipientId: admin.id,
        recipientPhone: to,
        body: preview,
        providerMessageId: outcome.ok ? outcome.result.messageId : null,
        error: outcome.ok ? null : outcome.error.message
      }
    });

    return {
      sent: outcome.ok,
      to: maskPhoneNumber(to),
      preview,
      error: outcome.ok ? null : outcome.error.message
    };
  }

  async listDeliveries(
    accessToken: string | undefined,
    query: MessageDeliveryQuery
  ): Promise<MessageDeliveryListResponse> {
    await this.assertAdmin(accessToken);

    const where: Prisma.MessageDeliveryWhereInput = {
      ...(query.event ? { event: query.event } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {})
    };

    const [rows, pending, sent, failed, skipped] = await Promise.all([
      this.prisma.messageDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        include: {
          recipient: { select: { firstName: true, lastName: true } }
        }
      }),
      this.prisma.messageDelivery.count({ where: { ...where, status: "PENDING" } }),
      this.prisma.messageDelivery.count({ where: { ...where, status: "SENT" } }),
      this.prisma.messageDelivery.count({ where: { ...where, status: "FAILED" } }),
      this.prisma.messageDelivery.count({ where: { ...where, status: "SKIPPED" } })
    ]);

    return {
      deliveries: rows.map((row) => this.toDeliveryItem(row)),
      counts: { pending, sent, failed, skipped }
    };
  }

  /** Re-queues a failed message. The worker picks it up on the next sweep. */
  async retryDelivery(
    accessToken: string | undefined,
    id: string
  ): Promise<MessageDeliveryItem> {
    await this.assertAdmin(accessToken);

    const existing = await this.prisma.messageDelivery.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Message not found.");
    }
    if (existing.status === "SENT") {
      throw new ConflictException("That message was already sent.");
    }

    const row = await this.prisma.messageDelivery.update({
      where: { id },
      data: {
        status: "PENDING",
        attempts: 0,
        scheduledFor: new Date(),
        claimedAt: null,
        error: null
      },
      include: { recipient: { select: { firstName: true, lastName: true } } }
    });

    return this.toDeliveryItem(row);
  }

  // ── used by the dispatcher ──

  /** Lead-time events time themselves; a send-time schedule does not apply. */
  usesLeadTime(event: MessagingEvent): boolean {
    return MESSAGING_EVENT_DEFINITIONS[event].supportsLeadTime;
  }

  /** The rule for an event, seeding it from the shared defaults on first use. */
  async getRule(event: MessagingEvent): Promise<MessagingRule> {
    const existing = await this.prisma.messagingRule.findUnique({
      where: { event }
    });
    if (existing) return existing;

    const defaults = DEFAULT_MESSAGING_RULES[event];
    try {
      return await this.prisma.messagingRule.create({
        data: {
          event,
          enabled: defaults.enabled,
          whatsappEnabled: defaults.whatsappEnabled,
          inAppEnabled: defaults.inAppEnabled,
          audience: defaults.audience,
          leadTimeMinutes: defaults.leadTimeMinutes,
          title: defaults.title,
          body: defaults.body
        }
      });
    } catch (error) {
      // Another request seeded it between the read and the write.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return this.prisma.messagingRule.findUniqueOrThrow({ where: { event } });
      }
      throw error;
    }
  }

  async seedMissingRules(): Promise<void> {
    const existing = await this.prisma.messagingRule.findMany({
      select: { event: true }
    });
    const have = new Set(existing.map((row) => row.event));
    const missing = MESSAGING_EVENTS.filter((event) => !have.has(event));
    if (missing.length === 0) return;

    await this.prisma.messagingRule.createMany({
      data: missing.map((event) => ({
        event,
        enabled: DEFAULT_MESSAGING_RULES[event].enabled,
        whatsappEnabled: DEFAULT_MESSAGING_RULES[event].whatsappEnabled,
        inAppEnabled: DEFAULT_MESSAGING_RULES[event].inAppEnabled,
        audience: DEFAULT_MESSAGING_RULES[event].audience,
        leadTimeMinutes: DEFAULT_MESSAGING_RULES[event].leadTimeMinutes,
        title: DEFAULT_MESSAGING_RULES[event].title,
        body: DEFAULT_MESSAGING_RULES[event].body
      })),
      skipDuplicates: true
    });
  }

  // ── auth (token-string pattern — no guards) ──

  async assertAdmin(accessToken: string | undefined): Promise<User> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only admins can manage messaging.");
    }
    return user;
  }

  private getAuthenticatedUser(accessToken: string | undefined): Promise<User> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  // ── mapping ──

  private toItem(
    row: MessagingRule & {
      updatedBy?: { firstName: string; lastName: string | null } | null;
    }
  ): MessagingRuleItem {
    return {
      event: row.event,
      enabled: row.enabled,
      whatsappEnabled: row.whatsappEnabled,
      inAppEnabled: row.inAppEnabled,
      audience: row.audience,
      leadTimeMinutes: row.leadTimeMinutes,
      scheduleMode: row.scheduleMode,
      scheduleHour: row.scheduleHour,
      scheduleMinute: row.scheduleMinute,
      scheduleDayOfWeek: row.scheduleDayOfWeek,
      weekdaysOnly: row.weekdaysOnly,
      title: row.title,
      body: row.body,
      whatsappTemplateName: row.whatsappTemplateName,
      whatsappTemplateLanguage: row.whatsappTemplateLanguage,
      whatsappTemplateParams: row.whatsappTemplateParams,
      updatedAt: row.updatedAt.toISOString(),
      updatedByName: row.updatedBy
        ? `${row.updatedBy.firstName} ${row.updatedBy.lastName ?? ""}`.trim()
        : null
    };
  }

  private toDeliveryItem(
    row: MessageDelivery & {
      recipient?: { firstName: string; lastName: string | null } | null;
    }
  ): MessageDeliveryItem {
    return {
      id: row.id,
      event: row.event,
      channel: row.channel,
      status: row.status,
      recipientName: row.recipient
        ? `${row.recipient.firstName} ${row.recipient.lastName ?? ""}`.trim()
        : null,
      recipientMasked: maskPhoneNumber(row.recipientPhone),
      body: row.body,
      error: row.error,
      attempts: row.attempts,
      scheduledFor: row.scheduledFor.toISOString(),
      createdAt: row.createdAt.toISOString()
    };
  }
}
