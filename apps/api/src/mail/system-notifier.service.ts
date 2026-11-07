import { Injectable, Logger } from "@nestjs/common";
import { getAdminNotificationEmails, getApiEnv } from "@nexa-chess/config/api";
import {
  markdownToWhatsApp,
  SYSTEM_MESSAGE_DEFINITIONS,
  type MessageVariables,
  type SystemMessageChannel,
  type SystemMessageKey
} from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MailService, type MailAttachment } from "./mail.service";
import { SystemMessageRenderer } from "./system-message-renderer.service";

/**
 * Someone a system message can reach. Each channel uses only the contact given for it, so a
 * caller decides who gets what: an env address list is `{ email }`, an admin account
 * `{ phone, userId }`, a demo guest `{ email, phone }`.
 */
export interface SystemRecipient {
  email?: string | null;
  phone?: string | null;
  /** The account whose in-app inbox gets it. */
  userId?: string | null;
}

export type SystemChannelOutcome = "SENT" | "FAILED" | "SKIPPED";

export interface SystemSendResult {
  outcomes: Record<SystemMessageChannel, SystemChannelOutcome>;
  errors: Partial<Record<SystemMessageChannel, string>>;
}

/**
 * The one way a system message goes out (docs/MESSAGING.md "System messages"): renders the
 * saved wording once, then sends it on every channel that is switched on for the message (or,
 * for a caller that lets a person choose, on the channels they chose) and that the recipient
 * can be reached on. Never throws: each channel's outcome is returned and failures are logged.
 */
@Injectable()
export class SystemNotifier {
  private readonly logger = new Logger(SystemNotifier.name);

  constructor(
    private readonly mail: MailService,
    private readonly notifications: NotificationService,
    private readonly prisma: PrismaService,
    private readonly renderer: SystemMessageRenderer,
    private readonly whatsapp: WhatsAppService
  ) {}

  async send(
    key: SystemMessageKey,
    recipients: SystemRecipient | SystemRecipient[],
    variables: MessageVariables,
    options: {
      /** Email only. */
      attachment?: MailAttachment | null;
      /** A person's own choice for this send; still limited to what the message supports. */
      channels?: SystemMessageChannel[];
      /** In-app dedupe (per user). */
      dedupeKey?: string;
    } = {}
  ): Promise<SystemSendResult> {
    const result: SystemSendResult = { errors: {}, outcomes: { EMAIL: "SKIPPED", IN_APP: "SKIPPED", WHATSAPP: "SKIPPED" } };
    const list = Array.isArray(recipients) ? recipients : [recipients];
    if (list.length === 0) return result;

    const definition = SYSTEM_MESSAGE_DEFINITIONS[key];
    const message = await this.renderer.renderAll(key, variables);
    const channels = options.channels
      ? options.channels.filter((channel) => definition.channels.includes(channel))
      : message.channels;

    const record = (channel: SystemMessageChannel, ok: boolean, error?: string) => {
      // One failure marks the channel failed; a later success doesn't hide it.
      if (!ok) {
        result.outcomes[channel] = "FAILED";
        result.errors[channel] = error;
        this.logger.warn(`${key} by ${channel} failed: ${error}`);
      } else if (result.outcomes[channel] === "SKIPPED") {
        result.outcomes[channel] = "SENT";
      }
    };

    for (const recipient of list) {
      if (channels.includes("EMAIL") && recipient.email) {
        try {
          await this.mail.sendRenderedSystemEmail(recipient.email, message, options.attachment ?? null);
          record("EMAIL", true);
        } catch (error) {
          record("EMAIL", false, (error as Error).message);
        }
      }

      if (channels.includes("WHATSAPP") && recipient.phone) {
        // Free text: outside WhatsApp's 24h window it may not deliver (an approved template is the fix).
        const outcome = await this.whatsapp.trySendText({ body: markdownToWhatsApp(message.whatsapp), to: recipient.phone });
        record("WHATSAPP", outcome.ok, outcome.ok ? undefined : outcome.error.message);
      }

      if (channels.includes("IN_APP") && recipient.userId) {
        try {
          await this.notifications.notify({
            body: message.body,
            dedupeKey: options.dedupeKey ? `${key}:${options.dedupeKey}` : null,
            linkPath: inAppLink(message.action?.url) ?? definition.inAppLink ?? null,
            title: message.subject,
            type: "SYSTEM_MESSAGE",
            userId: recipient.userId
          });
          record("IN_APP", true);
        } catch (error) {
          record("IN_APP", false, (error as Error).message);
        }
      }
    }
    return result;
  }

  /**
   * An admin alert's recipients: the ADMIN_EMAILS list by email (as one message, as before),
   * and the academy's admin accounts by WhatsApp and in-app.
   */
  async adminAlertRecipients(): Promise<SystemRecipient[]> {
    const emails = getAdminNotificationEmails(getApiEnv());
    return [...(emails.length ? [{ email: emails.join(",") }] : []), ...(await this.academyAdmins())];
  }

  /**
   * The academy's admins and super admins, for WhatsApp and in-app (never their email: admin
   * alerts email the ADMIN_EMAILS list instead). Platform support accounts are left out.
   */
  async academyAdmins(): Promise<SystemRecipient[]> {
    const admins = await this.prisma.user.findMany({
      select: { id: true, phoneNumber: true },
      where: {
        isPlatformSupport: false,
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
        status: UserStatus.ACTIVE
      }
    });
    return admins.map((admin) => ({ phone: admin.phoneNumber, userId: admin.id }));
  }
}

/** An action link inside the app becomes the notification's path; a link elsewhere has none. */
function inAppLink(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || null;
  } catch {
    return url.startsWith("/") ? url : null;
  }
}
