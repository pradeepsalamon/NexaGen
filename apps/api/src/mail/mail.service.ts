import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { getAdminNotificationEmails, getApiEnv } from "@nexa-chess/config/api";
import nodemailer from "nodemailer";

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

  async sendPasswordResetLink(to: string, resetLink: string) {
    const transporter = this.createTransporter();

    await transporter.sendMail({
      from: this.from,
      to,
      subject: "Reset your Nexa Chess password",
      text: [
        "Use this link to reset your Nexa Chess password:",
        resetLink,
        "",
        "This link expires in 30 minutes. If you did not request it, you can ignore this email."
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#101828">
          <h2>Reset your Nexa Chess password</h2>
          <p>Use the button below to choose a new password. This link expires in 30 minutes.</p>
          <p>
            <a href="${resetLink}" style="display:inline-block;background:#4278ce;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">
              Reset password
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>If you did not request it, you can ignore this email.</p>
        </div>
      `
    });
  }

  async sendEmailVerificationLink(to: string, verificationLink: string) {
    const transporter = this.createTransporter();

    await transporter.sendMail({
      from: this.from,
      to,
      subject: "Verify your Nexa Chess email address",
      text: [
        "Welcome to Nexa Chess! Please verify your email address by clicking the link below:",
        verificationLink,
        "",
        "This link expires in 24 hours. If you did not create an account, you can ignore this email."
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#101828">
          <h2>Welcome to Nexa Chess!</h2>
          <p>Please verify your email address by clicking the button below. This link expires in 24 hours.</p>
          <p>
            <a href="${verificationLink}" style="display:inline-block;background:#4278ce;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">
              Verify Email Address
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p><a href="${verificationLink}">${verificationLink}</a></p>
          <p>If you did not create an account, you can ignore this email.</p>
        </div>
      `
    });
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
    attachment: { filename: string; content: Buffer } | null;
  }) {
    const transporter = this.createTransporter();

    const support = input.supportEmail
      ? `Questions? Reply to this email or write to ${input.supportEmail}.`
      : "Questions? Just reply to this email.";

    await transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: `Your ${input.sellerName} invoice ${input.invoiceNumber}`,
      text: [
        `Hi ${input.customerName},`,
        "",
        `Thank you for your payment of ${input.amount}.`,
        `Your invoice ${input.invoiceNumber} is ready.`,
        ...(input.attachment ? ["It is attached to this email as a PDF."] : []),
        ...(input.downloadUrl ? ["", `Download it here: ${input.downloadUrl}`] : []),
        "",
        "You can also find it any time under Billing in your dashboard.",
        "",
        support
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#101828">
          <h2 style="color:#4278ce;margin-bottom:4px">Payment successful</h2>
          <p style="margin-top:0">Hi ${escapeHtml(input.customerName)}, thank you for your payment of <strong>${escapeHtml(input.amount)}</strong>.</p>
          <p>Your invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> is ready.${
            input.attachment ? " It is attached to this email as a PDF." : ""
          }</p>
          ${
            input.downloadUrl
              ? `<p>
            <a href="${input.downloadUrl}" style="display:inline-block;background:#4278ce;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">
              Download invoice
            </a>
          </p>
          <p style="font-size:13px;color:#5d6672">This download link expires in 7 days.</p>`
              : ""
          }
          <p>You can also find it any time under <strong>Billing</strong> in your dashboard.</p>
          <p style="font-size:13px;color:#5d6672">${escapeHtml(support)}</p>
        </div>
      `,
      ...(input.attachment
        ? {
            attachments: [
              {
                filename: input.attachment.filename,
                content: input.attachment.content,
                contentType: "application/pdf"
              }
            ]
          }
        : {})
    });
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
    const transporter = this.createTransporter();
    const when = input.startsAt.toLocaleString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short"
    });

    await transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: `You're registered: ${input.classTopic}`,
      text: [
        `Hi ${input.guestName},`,
        "",
        `You're registered for the demo class "${input.classTopic}", scheduled for ${when}.`,
        "",
        `Join here once it starts: ${input.joinUrl}`,
        "",
        "See you there!"
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#101828">
          <h2>You're registered!</h2>
          <p>Hi ${escapeHtml(input.guestName)}, you're registered for the demo class <strong>${escapeHtml(input.classTopic)}</strong>, scheduled for ${escapeHtml(when)}.</p>
          <p>
            <a href="${input.joinUrl}" style="display:inline-block;background:#4278ce;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">
              Join once it starts
            </a>
          </p>
          <p>See you there!</p>
        </div>
      `
    });
  }

  async sendDemoClassInvitation(input: {
    to: string;
    guestName: string;
    classTopic: string;
    startsAt: Date;
    joinUrl: string;
  }) {
    const transporter = this.createTransporter();
    const when = input.startsAt.toLocaleString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short"
    });

    await transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: `You're invited: ${input.classTopic}`,
      text: [
        `Hi ${input.guestName},`,
        "",
        `You're invited to the demo class "${input.classTopic}", scheduled for ${when}.`,
        "",
        `Your personal join link — open it once the class starts: ${input.joinUrl}`,
        "",
        "See you there!"
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#101828">
          <h2>You're invited!</h2>
          <p>Hi ${escapeHtml(input.guestName)}, you're invited to the demo class <strong>${escapeHtml(input.classTopic)}</strong>, scheduled for ${escapeHtml(when)}.</p>
          <p>
            <a href="${input.joinUrl}" style="display:inline-block;background:#4278ce;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">
              Join once it starts
            </a>
          </p>
          <p>This link is personal to you. If it doesn't work, open the class page and enter this email address (<strong>${escapeHtml(input.to)}</strong>).</p>
          <p>See you there!</p>
        </div>
      `
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

    const transporter = this.createTransporter();

    await transporter.sendMail({
      from: this.from,
      to: recipients.join(","),
      subject: `New demo booking: ${input.studentName}`,
      text: [
        "A new demo class inquiry came in from the academy site.",
        "",
        `Student: ${input.studentName} (age ${input.studentAge})`,
        `Parent: ${input.parentName}`,
        `Experience: ${input.experienceLevel}`,
        `Phone: ${input.phone}`,
        `Source: ${input.source ?? "Unknown"}`,
        `Campaign: ${input.campaign ?? "-"}`
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#101828">
          <h2>New demo booking</h2>
          <p>A new demo class inquiry came in from the academy site.</p>
          <table style="border-collapse:collapse">
            <tr><td style="padding:4px 12px 4px 0;color:#5d6672">Student</td><td>${escapeHtml(input.studentName)} (age ${input.studentAge})</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#5d6672">Parent</td><td>${escapeHtml(input.parentName)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#5d6672">Experience</td><td>${escapeHtml(input.experienceLevel)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#5d6672">Phone</td><td>${escapeHtml(input.phone)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#5d6672">Source</td><td>${escapeHtml(input.source ?? "Unknown")}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#5d6672">Campaign</td><td>${escapeHtml(input.campaign ?? "-")}</td></tr>
          </table>
        </div>
      `
    });
  }

  private createTransporter() {
    if (!this.host || !this.user || !this.pass || !this.from) {
      throw new ServiceUnavailableException("SMTP is not configured.");
    }

    return nodemailer.createTransport({
      auth: {
        pass: this.pass,
        user: this.user
      },
      host: this.host,
      port: this.port,
      secure: this.secure
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
