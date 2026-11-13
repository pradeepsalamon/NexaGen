import { BadRequestException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  EMAIL_UNSUBSCRIBE_PATH,
  type EmailPreferencesDto,
  type EmailUnsubscribeRequest,
  type UpdateEmailPreferencesRequest
} from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { createOpaqueToken } from "../auth/auth.utils";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";

/** What the outbox worker needs to send (or skip) one notification email. */
export type NotificationEmailTarget = {
  email: string;
  optedOut: boolean;
  unsubscribeUrl: string;
};

/**
 * A person's own switch for messaging-rule ("notification") emails, and the link in those emails
 * that flips it without signing in. System emails (password reset, verification, invoices) and
 * email that staff write by hand never look at it.
 */
@Injectable()
export class EmailPreferencesService {
  private readonly frontendUrl = getFrontendUrl(getApiEnv());

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async getMine(accessToken: string | undefined): Promise<EmailPreferencesDto> {
    const user = await this.getAuthenticatedUser(accessToken);
    return toPreferences(user);
  }

  async updateMine(
    accessToken: string | undefined,
    body: UpdateEmailPreferencesRequest
  ): Promise<EmailPreferencesDto> {
    const user = await this.getAuthenticatedUser(accessToken);
    return this.set(user, body.notificationEmails);
  }

  /** Public. The token is the credential, so an unknown one says nothing more than "invalid". */
  async setByLink(body: EmailUnsubscribeRequest): Promise<EmailPreferencesDto> {
    // The link is opened on the platform's address whichever academy the account belongs to,
    // and the random token already names exactly one account.
    return asPlatform("email unsubscribe link: the token identifies one account", async () => {
      const user = await this.prisma.user.findUnique({
        select: { id: true, notificationEmailOptOutAt: true },
        where: { emailUnsubscribeToken: body.token }
      });
      if (!user) {
        throw new BadRequestException("This unsubscribe link is not valid. Use the link in a recent email.");
      }
      return this.set(user, body.notificationEmails);
    });
  }

  /** Null when the account is gone. Makes the person's link token on first use. */
  async targetFor(userId: string): Promise<NotificationEmailTarget | null> {
    const user = await this.prisma.user.findUnique({
      select: { email: true, emailUnsubscribeToken: true, notificationEmailOptOutAt: true },
      where: { id: userId }
    });
    if (!user) return null;

    let token = user.emailUnsubscribeToken;
    if (!token) {
      token = createOpaqueToken();
      // Two sends at once: only one write lands, and both must mail the saved token.
      const claimed = await this.prisma.user.updateMany({
        data: { emailUnsubscribeToken: token },
        where: { emailUnsubscribeToken: null, id: userId }
      });
      if (claimed.count === 0) {
        const saved = await this.prisma.user.findUnique({
          select: { emailUnsubscribeToken: true },
          where: { id: userId }
        });
        if (!saved?.emailUnsubscribeToken) return null;
        token = saved.emailUnsubscribeToken;
      }
    }

    const url = new URL(EMAIL_UNSUBSCRIBE_PATH, this.frontendUrl);
    url.searchParams.set("token", token);
    return {
      email: user.email,
      optedOut: user.notificationEmailOptOutAt !== null,
      unsubscribeUrl: url.toString()
    };
  }

  private async set(
    user: { id: string; notificationEmailOptOutAt: Date | null },
    notificationEmails: boolean
  ): Promise<EmailPreferencesDto> {
    // Keep the first opt-out date when someone unsubscribes twice.
    if (notificationEmails === (user.notificationEmailOptOutAt === null)) return toPreferences(user);
    const updated = await this.prisma.user.update({
      data: { notificationEmailOptOutAt: notificationEmails ? null : new Date() },
      select: { notificationEmailOptOutAt: true },
      where: { id: user.id }
    });
    return toPreferences(updated);
  }

  private getAuthenticatedUser(accessToken: string | undefined) {
    // A SALES account gets payout emails too, so it may change its own setting.
    return authenticateUser(this.jwtService, this.prisma, accessToken, { allowSales: true });
  }
}

function toPreferences(user: { notificationEmailOptOutAt: Date | null }): EmailPreferencesDto {
  return { notificationEmails: user.notificationEmailOptOutAt === null };
}
