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
