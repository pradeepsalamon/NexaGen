import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import nodemailer from "nodemailer";

@Injectable()
export class MailService {
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
