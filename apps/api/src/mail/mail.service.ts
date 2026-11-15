import { Injectable, Logger, Optional, ServiceUnavailableException } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  markdownToPlainText,
  sampleVariables,
  SYSTEM_MESSAGE_DEFINITIONS,
  type MessageVariables,
  type SystemMessageKey
} from "@nexa-chess/types";
import nodemailer from "nodemailer";
import { BrandingService } from "../branding/branding.service";
import { currentTenantId } from "../tenancy/tenant-context";
import { EMAIL_LINK_STYLE, escapeHtml, messageToEmailHtml } from "./message-html";
import { SystemMessageRenderer, type RenderedSystemMessage } from "./system-message-renderer.service";

export type MailAttachment = { filename: string; content: Buffer };
type Attachment = MailAttachment;

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

  constructor(
    private readonly renderer: SystemMessageRenderer,
    @Optional() private readonly branding?: BrandingService
  ) {}

  /**
   * One shared platform address, with another academy's name as the sender
   * name and its contact as Reply-To (docs/SAAS_MULTI_TENANCY.md §F "Email").
   * Nexa's mail is unchanged.
   */
  private async sender(): Promise<{ from: string | { address: string; name: string } | undefined; replyTo?: string }> {
    const tenantId = currentTenantId();
    if (!tenantId || !this.branding || !this.from) return { from: this.from };
    try {
      const sender = await this.branding.senderFor(tenantId);
      if (!sender.name) return { from: this.from };
      const address = /<([^>]+)>/.exec(this.from)?.[1] ?? this.from;
      return { from: { address, name: sender.name }, ...(sender.replyTo ? { replyTo: sender.replyTo } : {}) };
    } catch (error) {
      this.logger.warn(`Sender lookup failed; using the platform sender: ${(error as Error).message}`);
      return { from: this.from };
    }
  }

  async sendEmailVerificationLink(to: string, verificationLink: string) {
    await this.sendSystemEmail("EMAIL_VERIFICATION", to, { "links.verify": verificationLink });
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

  async sendDirectEmail(input: { to: string; subject: string; body: string }) {
    await this.createTransporter().sendMail({
      ...(await this.sender()),
      to: input.to,
      subject: input.subject,
      text: markdownToPlainText(input.body),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#101828">${messageToEmailHtml(input.body)}</div>
      `
    });
  }

  /**
   * One message from a messaging rule. Returns the provider's id for the log. `unsubscribeUrl`
   * is the recipient's own link: a footer line, and the header mail apps turn into a button.
   */
  async sendRuleEmail(input: {
    to: string;
    subject: string;
    body: string;
    unsubscribeUrl?: string;
  }): Promise<string | null> {
    const subject = input.subject.replace(/\s+/g, " ").trim();
    const text = markdownToPlainText(input.body);
    const html = toHtml({ action: null, body: input.body, subject });
    const info = await this.createTransporter().sendMail({
      ...(await this.sender()),
      to: input.to,
      subject,
      ...(input.unsubscribeUrl
        ? {
            headers: { "List-Unsubscribe": `<${input.unsubscribeUrl}>` },
            html: `${html}${unsubscribeFooterHtml(input.unsubscribeUrl)}`,
            text: `${text}\n\n--\nDon't want these emails? Unsubscribe: ${input.unsubscribeUrl}`
          }
        : { html, text })
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
    await this.sendRenderedSystemEmail(to, await this.renderer.render(key, variables), attachment);
  }

  /** A system message already rendered (SystemNotifier's email channel). Throws when SMTP fails. */
  async sendRenderedSystemEmail(to: string, message: RenderedSystemMessage, attachment: Attachment | null = null) {
    const transporter = this.createTransporter();

    await transporter.sendMail({
      ...(await this.sender()),
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
/** Small grey line under a notification email. The colours are email-safe literals, like the rest. */
function unsubscribeFooterHtml(url: string): string {
  return `
        <p style="font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#667085;margin-top:24px;border-top:1px solid #eaecf0;padding-top:12px">
          Don't want these emails? <a href="${escapeHtml(url)}" style="color:#667085;text-decoration:underline">Unsubscribe</a>.
        </p>`;
}

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
