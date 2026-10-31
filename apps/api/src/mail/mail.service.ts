import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { getAdminNotificationEmails, getApiEnv } from "@nexa-chess/config/api";
import {
  markdownToPlainText,
  sampleVariables,
  SYSTEM_MESSAGE_DEFINITIONS,
  type MessageVariables,
  type SystemMessageKey
} from "@nexa-chess/types";
import nodemailer from "nodemailer";
import { formatDemoTime } from "../messaging/messaging.format";
import { EMAIL_LINK_STYLE, escapeHtml, messageToEmailHtml } from "./message-html";
import { SystemMessageRenderer, type RenderedSystemMessage } from "./system-message-renderer.service";

type Attachment = { filename: string; content: Buffer };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly env = getApiEnv();
  private readonly from = this.env.SMTP_FROM ?? this.env.SMTP_USER;
  private readonly host = this.env.SMTP_HOST;
  private readonly pass = this.env.SMTP_PASS;
  private readonly port = this.env.SMTP_PORT;
  private readonly secure = this.env.SMTP_SECURE;
  private readonly user = this.env.SMTP_USER;

  constructor(private readonly renderer: SystemMessageRenderer) {}

  async sendPasswordResetLink(to: string, resetLink: string) {
    await this.sendSystemEmail("PASSWORD_RESET", to, { "links.reset": resetLink });
  }

  async sendEmailVerificationLink(to: string, verificationLink: string) {
    await this.sendSystemEmail("EMAIL_VERIFICATION", to, { "links.verify": verificationLink });
  }

  /** Sent to the OLD address, so a hijacked account's real owner finds out. */
  async sendEmailChangedNotice(to: string, newEmail: string) {
    await this.sendSystemEmail("EMAIL_CHANGED", to, { "email.new": newEmail });
  }

  /**
   * The receipt email. Only ever reached after a payment is verified, and the
   * caller claims a one-shot flag before calling, so a redelivered webhook
   * cannot produce a second copy.
   */
  async sendInvoiceIssued(input: {
    to: string;
    customerName: string;
    invoiceNumber: string;
    amount: string;
    sellerName: string;
    supportEmail: string | null;
    /** Short-lived signed link, used when the PDF is not attached. */
    downloadUrl: string | null;
    attachment: Attachment | null;
  }) {
    await this.sendSystemEmail(
      "INVOICE_EMAIL",
      input.to,
      {
        "customer.name": input.customerName,
        "invoice.amount": input.amount,
        "invoice.attachmentNote": input.attachment ? "It is attached to this email as a PDF." : "",
        "invoice.downloadNote": input.downloadUrl ? "This download link expires in 7 days." : "",
        "invoice.number": input.invoiceNumber,
        "links.download": input.downloadUrl ?? "",
        "seller.name": input.sellerName,
        "support.line": input.supportEmail
          ? `Questions? Reply to this email or write to ${input.supportEmail}.`
          : "Questions? Just reply to this email."
      },
      input.attachment
    );
  }

  /**
   * Confirms a demo class registration for a visitor who has no account — the
   * only record of the class they'll get if they picked email as their contact
   * method instead of a phone number.
   */
  async sendDemoClassRegistrationConfirmation(input: {
    to: string;
    guestName: string;
    classTopic: string;
    startsAt: Date;
    joinUrl: string;
  }) {
    await this.sendSystemEmail("DEMO_REGISTRATION_EMAIL", input.to, {
      "demo.dateTime": formatDemoTime(input.startsAt),
      "demo.topic": input.classTopic,
      "guest.name": input.guestName,
      "links.join": input.joinUrl
    });
  }

  async sendDemoClassInvitation(input: {
    to: string;
    guestName: string;
    classTopic: string;
    startsAt: Date;
    joinUrl: string;
  }) {
    await this.sendSystemEmail("DEMO_INVITATION_EMAIL", input.to, {
      "demo.dateTime": formatDemoTime(input.startsAt),
      "demo.topic": input.classTopic,
      "guest.email": input.to,
      "guest.name": input.guestName,
      "links.join": input.joinUrl
    });
  }

  /**
   * Notifies staff of a new academy "book a demo" lead. Skips silently (no
   * throw) when either SMTP or `ADMIN_EMAILS` is unset — callers treat this
   * as fire-and-forget and must never fail lead creation on it.
   */
  async sendNewLeadNotification(input: {
    studentName: string;
    parentName: string;
    studentAge: number;
    experienceLevel: string;
    phone: string;
    source: string | null;
    campaign: string | null;
  }) {
    const recipients = getAdminNotificationEmails(this.env);
    if (recipients.length === 0) {
      this.logger.warn("Skipped new-lead notification: ADMIN_EMAILS is unset.");
      return;
    }

    await this.sendSystemEmail("NEW_LEAD_ADMIN", recipients.join(","), {
      "lead.campaign": input.campaign ?? "-",
      "lead.experience": input.experienceLevel,
      "lead.parentName": input.parentName,
      "lead.phone": input.phone,
      "lead.source": input.source ?? "Unknown",
      "lead.studentAge": String(input.studentAge),
      "lead.studentName": input.studentName
    });
  }

  async sendAccountDeletionRequested(input: { email: string; name: string; reason: string | null; role: string }) {
    const recipients = getAdminNotificationEmails(this.env);
    if (recipients.length === 0) {
      this.logger.warn("Skipped account-deletion notification: ADMIN_EMAILS is unset.");
      return;
    }

    await this.sendSystemEmail("ACCOUNT_DELETION_REQUESTED_ADMIN", recipients.join(","), {
      "request.reason": input.reason || "-",
      "requester.email": input.email,
      "requester.name": input.name,
      "requester.role": input.role
    });
  }

  async sendAccountDeletionResolved(input: { completed: boolean; email: string; note: string | null }) {
    await this.sendSystemEmail(
      input.completed ? "ACCOUNT_DELETION_COMPLETED" : "ACCOUNT_DELETION_DECLINED",
      input.email,
      { "request.noteLine": input.note ? `Note from the academy: ${input.note}` : "" }
    );
  }

  /** A message staff wrote themselves: formatted text, never trusted as HTML. */
  async sendDirectEmail(input: { to: string; subject: string; body: string }) {
    await this.createTransporter().sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      text: markdownToPlainText(input.body),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#101828">${messageToEmailHtml(input.body)}</div>
      `
    });
  }

  /** One message from a messaging rule. Returns the provider's id for the log. */
  async sendRuleEmail(input: { to: string; subject: string; body: string }): Promise<string | null> {
    const subject = input.subject.replace(/\s+/g, " ").trim();
    const info = await this.createTransporter().sendMail({
      from: this.from,
      to: input.to,
      subject,
      text: markdownToPlainText(input.body),
      html: toHtml({ action: null, body: input.body, subject })
    });
    return info.messageId ?? null;
  }

  /** The saved wording with example values, for an admin checking their edit. */
  async sendSystemMessageSample(key: SystemMessageKey, to: string) {
    await this.sendSystemEmail(key, to, sampleVariables(SYSTEM_MESSAGE_DEFINITIONS[key].variables));
  }

  isConfigured() {
    return Boolean(this.host && this.user && this.pass && this.from);
  }

  private async sendSystemEmail(
    key: SystemMessageKey,
    to: string,
    variables: MessageVariables,
    attachment: Attachment | null = null
  ) {
    const transporter = this.createTransporter();
    const message = await this.renderer.render(key, variables);

    await transporter.sendMail({
      from: this.from,
      to,
      subject: message.subject,
      text: toText(message),
      html: toHtml(message),
      ...(attachment
        ? {
            attachments: [
              {
                filename: attachment.filename,
                content: attachment.content,
                contentType: "application/pdf"
              }
            ]
          }
        : {})
    });
  }

  private createTransporter() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("SMTP is not configured.");
    }

    return nodemailer.createTransport({
      auth: {
        pass: this.pass,
        user: this.user
      },
      // The outbox worker sends one at a time, so a hung server must not stall it.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      host: this.host,
      port: this.port,
      secure: this.secure,
      socketTimeout: 30_000
    });
  }
}

function toText({ action, body }: RenderedSystemMessage): string {
  const text = markdownToPlainText(body);
  return action && !text.includes(action.url) ? `${text}\n\n${action.label}: ${action.url}` : text;
}

/** Admin wording and member-supplied values are both escaped: never trusted as HTML. */
function toHtml({ action, body, subject }: RenderedSystemMessage): string {
  const button = action
    ? `
          <p>
            <a href="${escapeHtml(action.url)}" style="display:inline-block;background:#4278ce;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">
              ${escapeHtml(action.label)}
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p><a href="${escapeHtml(action.url)}" style="${EMAIL_LINK_STYLE}">${escapeHtml(action.url)}</a></p>`
    : "";

  return `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#101828">
          <h2>${escapeHtml(subject)}</h2>
          ${messageToEmailHtml(body)}${button}
        </div>
      `;
}
