import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import type { SendReferrerAccessLinkRequest, SendReferrerAccessLinkResponse } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { createOpaqueToken, hashOpaqueToken } from "../auth/auth.utils";
import { SystemNotifier } from "../mail/system-notifier.service";
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
    private readonly notifier: SystemNotifier,
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

    // The admin picked the channels for this send; the message's own switches don't apply.
    const sent = await this.notifier.send(
      "ACCOUNT_ACCESS",
      { email: user.email, phone: wantsWhatsApp ? phone : null },
      { "links.reset": link.toString(), "recipient.firstName": user.firstName },
      { channels: body.channels }
    );
    if (sent.outcomes.EMAIL === "FAILED") {
      this.logger.warn(`Sign-in link email to user ${user.id} failed: ${sent.errors.EMAIL}`);
    }
    const result: SendReferrerAccessLinkResponse = {
      email: sent.outcomes.EMAIL,
      whatsapp: sent.outcomes.WHATSAPP,
      whatsappError: sent.errors.WHATSAPP ?? null
    };
    return result;
  }
}
