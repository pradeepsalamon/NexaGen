import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  DirectEmailDto,
  DirectEmailListResponse,
  EmailAdminOverviewResponse,
  EmailVerificationPolicy,
  PaginatedQuery,
  SendDirectEmailRequest,
  UnverifiedAccountListResponse
} from "@nexa-chess/types";
import { DirectEmailStatus, Prisma, UserRole, UserStatus, type DirectEmail, type User } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { queryEnum } from "../common/query-params";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { EmailVerificationService } from "./email-verification.service";

const MAIL_REFUSED = "The mail server did not accept this email. Try again in a moment.";
const SMTP_MISSING = "Email is not set up on this server (SMTP settings).";

type Staff = Pick<User, "id" | "role">;

@Injectable()
export class EmailAdminService {
  private readonly logger = new Logger(EmailAdminService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly verification: EmailVerificationService
  ) {}

  async overview(accessToken: string | undefined): Promise<EmailAdminOverviewResponse> {
    await this.getStaff(accessToken);
    const [policy, unverifiedCount] = await Promise.all([
      this.verification.policy(),
      this.prisma.user.count({ where: unverifiedWhere() })
    ]);
    return { policy, smtpConfigured: this.mail.isConfigured(), unverifiedCount };
  }

  async setPolicy(accessToken: string | undefined, policy: EmailVerificationPolicy) {
    const staff = await this.getStaff(accessToken);
    // Links could never arrive, and REQUIRED would shut out every new account.
    if (policy !== "OFF" && !this.mail.isConfigured()) {
      throw new BadRequestException(SMTP_MISSING);
    }
    await this.verification.setPolicy(policy, staff.id);
    this.logger.log(`Email verification policy set to ${policy} by ${staff.id}.`);
    return { policy };
  }

  async listUnverified(
    accessToken: string | undefined,
    query?: PaginatedQuery
  ): Promise<UnverifiedAccountListResponse> {
    await this.getStaff(accessToken);
    const { page, pageSize, skip, search, take } = resolvePagination(query);
    const where: Prisma.UserWhereInput = {
      ...unverifiedWhere(),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        skip,
        take,
        where
      }),
      this.prisma.user.count({ where })
    ]);
    return {
      accounts: users.map((user) => ({
        email: user.email,
        id: user.id,
        name: displayName(user),
        role: user.role,
        status: user.status
      })),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  /** For turning REQUIRED on over accounts that predate it, so they are not stopped at sign-in. */
  async verifyAll(accessToken: string | undefined) {
    const staff = await this.getStaff(accessToken);
    const { count } = await this.prisma.user.updateMany({
      data: { emailVerifiedAt: new Date(), isEmailVerified: true },
      where: unverifiedWhere()
    });
    this.logger.log(`${count} accounts marked as email-verified by ${staff.id}.`);
    return { count };
  }

  async setVerified(accessToken: string | undefined, userId: string, verified: boolean) {
    const staff = await this.getStaff(accessToken);
    const target = await this.getTarget(staff, userId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        data: { emailVerifiedAt: verified ? now : null, isEmailVerified: verified },
        where: { id: target.id }
      }),
      this.prisma.emailVerificationToken.updateMany({
        data: { usedAt: now },
        where: { usedAt: null, userId: target.id }
      })
    ]);
    return { isEmailVerified: verified };
  }

  async sendVerificationLink(accessToken: string | undefined, userId: string) {
    const staff = await this.getStaff(accessToken);
    const target = await this.getTarget(staff, userId);
    if (target.isEmailVerified) {
      throw new BadRequestException("This email address is already verified.");
    }
    this.assertMailConfigured();
    try {
      await this.verification.sendLink(target);
    } catch (error) {
      this.logger.warn(`Verification link to user ${target.id} failed: ${String(error)}`);
      throw new BadGatewayException(MAIL_REFUSED);
    }
    return { ok: true as const };
  }

  async sendDirectEmail(
    accessToken: string | undefined,
    userId: string,
    payload: SendDirectEmailRequest
  ): Promise<DirectEmailDto> {
    const staff = await this.getStaff(accessToken);
    const recipient = await this.prisma.user.findUnique({ where: { id: userId, isDeleted: false } });
    if (!recipient) throw new NotFoundException("User not found.");
    this.assertMailConfigured();

    const row = await this.prisma.directEmail.create({
      data: {
        body: payload.body,
        recipientId: recipient.id,
        senderId: staff.id,
        subject: payload.subject,
        toEmail: recipient.email
      }
    });

    try {
      await this.mail.sendDirectEmail({ body: payload.body, subject: payload.subject, to: recipient.email });
    } catch (error) {
      await this.prisma.directEmail.update({
        data: { error: String(error).slice(0, 500), status: DirectEmailStatus.FAILED },
        where: { id: row.id }
      });
      this.logger.warn(`Direct email ${row.id} failed: ${String(error)}`);
      throw new BadGatewayException(MAIL_REFUSED);
    }

    const sent = await this.prisma.directEmail.update({
      data: { sentAt: new Date(), status: DirectEmailStatus.SENT },
      include: emailInclude,
      where: { id: row.id }
    });
    return toDto(sent);
  }

  async listSent(
    accessToken: string | undefined,
    query?: PaginatedQuery & { status?: string }
  ): Promise<DirectEmailListResponse> {
    await this.getStaff(accessToken);
    const { page, pageSize, skip, search, take } = resolvePagination(query);
    const status = queryEnum(query?.status, DirectEmailStatus, "status");
    const where: Prisma.DirectEmailWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { subject: { contains: search, mode: "insensitive" } },
              { toEmail: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [emails, total] = await Promise.all([
      this.prisma.directEmail.findMany({
        include: emailInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        where
      }),
      this.prisma.directEmail.count({ where })
    ]);
    return { emails: emails.map(toDto), pagination: paginationMeta(total, page, pageSize) };
  }

  private assertMailConfigured() {
    if (!this.mail.isConfigured()) throw new ServiceUnavailableException(SMTP_MISSING);
  }

  private async getStaff(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("You cannot manage email.");
    }
    return user;
  }

  /** Same limit as editing a user: a plain admin cannot change another admin's account. */
  private async getTarget(staff: Staff, userId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: userId, isDeleted: false } });
    if (!target) throw new NotFoundException("User not found.");
    if (staff.role === UserRole.ADMIN && target.role !== UserRole.COACH && target.role !== UserRole.STUDENT) {
      throw new ForbiddenException("Admins cannot manage admin users.");
    }
    return target;
  }
}

const emailInclude = {
  recipient: { select: { email: true, firstName: true, lastName: true } },
  sender: { select: { email: true, firstName: true, lastName: true } }
} satisfies Prisma.DirectEmailInclude;

type NameParts = Pick<User, "email" | "firstName" | "lastName">;

function displayName(user: NameParts) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

function unverifiedWhere(): Prisma.UserWhereInput {
  return {
    isDeleted: false,
    isEmailVerified: false,
    role: { in: [UserRole.COACH, UserRole.STUDENT] },
    status: { in: [UserStatus.ACTIVE, UserStatus.PENDING] }
  };
}

function toDto(row: DirectEmail & { recipient: NameParts; sender: NameParts | null }): DirectEmailDto {
  return {
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    error: row.error,
    id: row.id,
    recipientName: displayName(row.recipient),
    senderName: row.sender ? displayName(row.sender) : null,
    sentAt: row.sentAt?.toISOString() ?? null,
    status: row.status,
    subject: row.subject,
    toEmail: row.toEmail
  };
}
