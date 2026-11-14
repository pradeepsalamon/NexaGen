import { Injectable, Logger } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import type { EmailVerificationPolicy } from "@nexa-chess/types";
import { UserRole, type User } from "@prisma/client";
import { createOpaqueToken, hashOpaqueToken } from "../auth/auth.utils";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";

const SETTINGS_ID = "default";
const LINK_TTL_MS = 24 * 60 * 60_000;
const SIGN_IN_RESEND_COOLDOWN_MS = 5 * 60_000;

type LinkTarget = Pick<User, "email" | "id">;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly frontendUrl = getFrontendUrl(getApiEnv());

  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService
  ) {}

  async policy(): Promise<EmailVerificationPolicy> {
    const settings = await this.prisma.emailSettings.findUnique({ where: { id: SETTINGS_ID } });
    return settings?.verificationPolicy ?? "OFF";
  }

  async setPolicy(policy: EmailVerificationPolicy, updatedById: string) {
    await this.prisma.emailSettings.upsert({
      create: { id: SETTINGS_ID, updatedById, verificationPolicy: policy },
      update: { updatedById, verificationPolicy: policy },
      where: { id: SETTINGS_ID }
    });
  }

  /** Admins are exempt, so a broken mail server can never lock everyone out. */
  async blocksSignIn(user: Pick<User, "isEmailVerified" | "role">) {
    if (user.isEmailVerified || user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
      return false;
    }
    return (await this.policy()) === "REQUIRED";
  }

  /** Only the newest link works. Throws if the mail server refuses it. */
  async sendLink(user: LinkTarget) {
    const token = createOpaqueToken();
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.updateMany({
        data: { usedAt: new Date() },
        where: { usedAt: null, userId: user.id }
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          expiresAt: new Date(Date.now() + LINK_TTL_MS),
          tokenHash: hashOpaqueToken(token),
          userId: user.id
        }
      })
    ]);

    const link = new URL("/verify-email", this.frontendUrl);
    link.searchParams.set("token", token);
    await this.mail.sendEmailVerificationLink(user.email, link.toString());
  }

  /** For flows that must carry on without the mail: the person can ask for another link. */
  async sendLinkBestEffort(user: LinkTarget) {
    try {
      await this.sendLink(user);
      return true;
    } catch (error) {
      this.logger.warn(`Could not send a verification link to user ${user.id}: ${String(error)}`);
      return false;
    }
  }

  /** Someone with the right password was refused for being unverified: a repeat try reuses a recent link. */
  async sendLinkForRefusedSignIn(user: LinkTarget): Promise<"failed" | "recent" | "sent"> {
    const latest = await this.prisma.emailVerificationToken.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
      where: { usedAt: null, userId: user.id }
    });
    if (latest && Date.now() - latest.createdAt.getTime() < SIGN_IN_RESEND_COOLDOWN_MS) return "recent";
    return (await this.sendLinkBestEffort(user)) ? "sent" : "failed";
  }
}
