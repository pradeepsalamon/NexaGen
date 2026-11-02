import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  markdownToWhatsApp,
  type SendReferrerAccessLinkRequest,
  type SendReferrerAccessLinkResponse
} from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { createOpaqueToken, hashOpaqueToken } from "../auth/auth.utils";
import { MailService } from "../mail/mail.service";
import { SystemMessageRenderer } from "../mail/system-message-renderer.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";

/** A set-password link lives longer than a self-service reset (30 min): it waits in an inbox. */
const ACCESS_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * An admin sends a SALES account its sign-in link by email and/or WhatsApp.
 * The link is an ordinary one-use password-reset token (`/reset-password`),
 * so the sales person chooses their own password; the admin never sees it.
 */
@Injectable()
export class ReferralAccessService {
  private readonly logger = new Logger(ReferralAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly messages: SystemMessageRenderer,
    private readonly whatsapp: WhatsAppService
  ) {}

  async sendAccessLink(userId: string, body: SendReferrerAccessLinkRequest): Promise<SendReferrerAccessLinkResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== UserRole.SALES) throw new NotFoundException("Sales account not found.");
    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException("Activate the account first; an inactive account cannot sign in.");
    }

    const wantsWhatsApp = body.channels.includes("WHATSAPP");
    const phone = body.phoneNumber?.trim() || user.phoneNumber;
    if (wantsWhatsApp && !this.whatsapp.normalizeRecipient(phone)) {
      throw new BadRequestException("Add a valid phone number to send the link by WhatsApp.");
    }
    if (body.phoneNumber?.trim() && body.phoneNumber.trim() !== user.phoneNumber) {
      await this.prisma.user.update({ data: { phoneNumber: body.phoneNumber.trim() }, where: { id: user.id } });
    }

    const token = createOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: { expiresAt: new Date(Date.now() + ACCESS_LINK_TTL_MS), tokenHash: hashOpaqueToken(token), userId: user.id }
    });
    const link = new URL("/reset-password", getFrontendUrl(getApiEnv()));
    link.searchParams.set("token", token);

    const result: SendReferrerAccessLinkResponse = { email: "SKIPPED", whatsapp: "SKIPPED", whatsappError: null };

    if (body.channels.includes("EMAIL")) {
      try {
        await this.mail.sendAccountAccessLink(user.email, user.firstName, link.toString());
        result.email = "SENT";
      } catch (error) {
        this.logger.warn(`Sign-in link email to user ${user.id} failed: ${(error as Error).message}`);
        result.email = "FAILED";
      }
    }

    if (wantsWhatsApp && phone) {
      const { body: text } = await this.messages.render("ACCOUNT_ACCESS_WHATSAPP", {
        "links.reset": link.toString(),
        "recipient.firstName": user.firstName
      });
      const outcome = await this.whatsapp.trySendText({ body: markdownToWhatsApp(text), to: phone });
      if (outcome.ok) result.whatsapp = "SENT";
      else {
        result.whatsapp = "FAILED";
        result.whatsappError = outcome.error.message;
      }
    }
    return result;
  }
}
