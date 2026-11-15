import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  API_ROUTES,
  EMAIL_CATEGORIES,
  EMAIL_UNSUBSCRIBE_PATH,
  type EmailCategory,
  type EmailOneClickQuery,
  type EmailPreferencesDto,
  type EmailUnsubscribeRequest,
  type UpdateEmailPreferencesRequest
} from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { createOpaqueToken } from "../auth/auth.utils";
import { PrismaService } from "../prisma/prisma.service";
import { AcademyLinksService } from "../tenancy/academy-links.service";
import { asPlatform } from "../tenancy/tenant-context";

/** What a sender needs to send (or skip) one non-essential email. */
export type NotificationEmailTarget = {
  email: string;
  /** True when the master switch or this email's category is off. */
  optedOut: boolean;
  /** RFC 8058 one-click link for the `List-Unsubscribe` header (a POST, through the web's `/api`). */
  oneClickUrl: string;
  /** The page in the footer link; with a category it offers to stop just that kind. */
  unsubscribeUrl: string;
};

type PreferenceRow = { emailOptOutCategories: EmailCategory[]; notificationEmailOptOutAt: Date | null };

/**
 * A person's own switches for non-essential email (docs/MESSAGING.md "Email channel"): a master
 * switch and one per `EmailCategory` (messaging-rule emails by event, and email staff write at
 * `/admin/email`), and the links in those emails that flip them without signing in. System emails
 * (password reset, verification, invoices) never look at them.
 */
@Injectable()
export class EmailPreferencesService {
  private readonly frontendUrl = getFrontendUrl(getApiEnv());

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Optional() private readonly links?: AcademyLinksService
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
    return this.set(user, body);
  }

  /** Public. The token is the credential, so an unknown one says nothing more than "invalid". */
  async setByLink(body: EmailUnsubscribeRequest): Promise<EmailPreferencesDto> {
    return this.byToken(body.token, (user) =>
      this.set(user, body.category ? toggleCategory(user, body.category, body.notificationEmails) : { notificationEmails: body.notificationEmails })
    );
  }

  /**
   * Public: a mail app's one-click unsubscribe (RFC 8058). Always turns emails off (never on),
   * for the email's category when the link names one, else all of them. An unknown token is
   * still a 400, like the page.
   */
  async oneClick(query: EmailOneClickQuery): Promise<{ ok: true }> {
    await this.byToken(query.token, (user) =>
      this.set(user, query.category ? toggleCategory(user, query.category, false) : { notificationEmails: false })
    );
    return { ok: true };
  }

  /**
   * Null when the account is gone. Makes the person's link token on first use. `category` is
   * the email's own kind; without one only the master switch counts.
   */
  async targetFor(userId: string, category?: EmailCategory): Promise<NotificationEmailTarget | null> {
    const user = await this.prisma.user.findUnique({
      select: { email: true, emailOptOutCategories: true, emailUnsubscribeToken: true, notificationEmailOptOutAt: true },
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

    // The academy's own address: the page there, and its `/api` for the one-click POST.
    const origin = this.links ? await this.links.origin() : this.frontendUrl;
    const page = new URL(EMAIL_UNSUBSCRIBE_PATH, origin);
    const oneClick = new URL(`/api${API_ROUTES.emailPreferences.oneClick}`, origin);
    for (const url of [page, oneClick]) {
      url.searchParams.set("token", token);
      if (category) url.searchParams.set("category", category);
    }
    return {
      email: user.email,
      oneClickUrl: oneClick.toString(),
      optedOut: isOptedOut(user, category),
      unsubscribeUrl: page.toString()
    };
  }

  private byToken<T>(token: string, run: (user: PreferenceRow & { id: string }) => Promise<T>): Promise<T> {
    // The link is opened on whichever address the email named (or by a mail app with no
    // academy at all), and the random token already names exactly one account.
    return asPlatform("email unsubscribe link: the token identifies one account", async () => {
      const user = await this.prisma.user.findUnique({
        select: { emailOptOutCategories: true, id: true, notificationEmailOptOutAt: true },
        where: { emailUnsubscribeToken: token }
      });
      if (!user) {
        throw new BadRequestException("This unsubscribe link is not valid. Use the link in a recent email.");
      }
      return run(user);
    });
  }

  private async set(
    user: PreferenceRow & { id: string },
    change: UpdateEmailPreferencesRequest
  ): Promise<EmailPreferencesDto> {
    const data: { emailOptOutCategories?: EmailCategory[]; notificationEmailOptOutAt?: Date | null } = {};
    // Keep the first opt-out date when someone unsubscribes twice.
    if (change.notificationEmails !== undefined && change.notificationEmails !== (user.notificationEmailOptOutAt === null)) {
      data.notificationEmailOptOutAt = change.notificationEmails ? null : new Date();
    }
    if (change.disabledCategories !== undefined) {
      const next = normalizeCategories(change.disabledCategories);
      if (next.join() !== normalizeCategories(user.emailOptOutCategories).join()) data.emailOptOutCategories = next;
    }
    if (Object.keys(data).length === 0) return toPreferences(user);
    const updated = await this.prisma.user.update({
      data,
      select: { emailOptOutCategories: true, notificationEmailOptOutAt: true },
      where: { id: user.id }
    });
    return toPreferences(updated);
  }

  private getAuthenticatedUser(accessToken: string | undefined) {
    // A SALES account gets payout emails too, so it may change its own setting.
    return authenticateUser(this.jwtService, this.prisma, accessToken, { allowSales: true });
  }
}

/** Whether a person refuses an email of this kind (no kind = only the master switch). */
export function isOptedOut(user: PreferenceRow, category?: EmailCategory): boolean {
  if (user.notificationEmailOptOutAt !== null) return true;
  return category !== undefined && user.emailOptOutCategories.includes(category);
}

/**
 * The change a category link makes. Turning one kind back on while everything is off also
 * turns the master switch on, with the other kinds off, so only what they asked for resumes.
 */
function toggleCategory(user: PreferenceRow, category: EmailCategory, on: boolean): UpdateEmailPreferencesRequest {
  const current = new Set(user.emailOptOutCategories);
  if (!on) {
    current.add(category);
    return { disabledCategories: [...current] };
  }
  if (user.notificationEmailOptOutAt !== null) {
    return { disabledCategories: EMAIL_CATEGORIES.filter((c) => c !== category), notificationEmails: true };
  }
  current.delete(category);
  return { disabledCategories: [...current] };
}

function normalizeCategories(categories: readonly EmailCategory[]): EmailCategory[] {
  const set = new Set(categories);
  return EMAIL_CATEGORIES.filter((category) => set.has(category));
}

function toPreferences(user: PreferenceRow): EmailPreferencesDto {
  return {
    disabledCategories: normalizeCategories(user.emailOptOutCategories ?? []),
    notificationEmails: user.notificationEmailOptOutAt === null
  };
}
