import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  AccountDeletionRequestItem,
  AccountDeletionRequestListResponse,
  AccountDeletionRequestResponse,
  CreateAccountDeletionRequest,
  MyAccountDeletionResponse,
  RejectAccountDeletionRequest,
  ResolveAccountDeletionRequest
} from "@nexa-chess/types";
import { AccountDeletionStatus, Prisma, UserRole, type AccountDeletionRequest, type User } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { verifySecret } from "../auth/auth.utils";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { UserService } from "../user/user.service";

type RequestRow = AccountDeletionRequest & { reviewedBy: Pick<User, "firstName" | "lastName"> | null };

const INCLUDE = { reviewedBy: { select: { firstName: true, lastName: true } } } as const;

/**
 * A user asks; an admin completes (the ordinary user soft-delete, so financial
 * history is kept and the account is restorable from Trash for 30 days) or declines.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly users: UserService
  ) {}

  async getMine(accessToken: string | undefined): Promise<MyAccountDeletionResponse> {
    const user = await this.authenticate(accessToken);
    const row = await this.prisma.accountDeletionRequest.findFirst({
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
      where: { userId: user.id }
    });
    return { request: row ? toItem(row) : null };
  }

  async request(
    accessToken: string | undefined,
    dto: CreateAccountDeletionRequest
  ): Promise<AccountDeletionRequestResponse> {
    const user = await this.authenticate(accessToken);
    // 400, not 401, so the web client doesn't refresh-and-retry.
    if (!(await verifySecret(dto.currentPassword, user.password))) {
      throw new BadRequestException("Password is incorrect.");
    }

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
    const reason = dto.reason || null;
    let row: RequestRow;
    try {
      row = await this.prisma.accountDeletionRequest.create({
        data: { reason, userEmail: user.email, userId: user.id, userName: name, userRole: user.role },
        include: INCLUDE
      });
    } catch (error) {
      // The partial unique index allows one PENDING request per user.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("You already have a deletion request waiting for review.");
      }
      throw error;
    }

    this.mail
      .sendAccountDeletionRequested({ email: user.email, name, reason, role: user.role })
      .catch((error: unknown) => this.logger.warn(`Account-deletion notice not sent: ${String(error)}`));

    return { request: toItem(row) };
  }

  async withdraw(accessToken: string | undefined): Promise<MyAccountDeletionResponse> {
    const user = await this.authenticate(accessToken);
    const { count } = await this.prisma.accountDeletionRequest.updateMany({
      data: { status: AccountDeletionStatus.WITHDRAWN },
      where: { status: AccountDeletionStatus.PENDING, userId: user.id }
    });
    if (count === 0) throw new NotFoundException("You have no deletion request waiting.");
    return this.getMine(accessToken);
  }

  async list(accessToken: string | undefined): Promise<AccountDeletionRequestListResponse> {
    await this.authenticateAdmin(accessToken);
    const rows = await this.prisma.accountDeletionRequest.findMany({
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 200
    });
    // Waiting requests first; within each group, newest first.
    const pending = rows.filter((row) => row.status === AccountDeletionStatus.PENDING);
    const rest = rows.filter((row) => row.status !== AccountDeletionStatus.PENDING);
    return { requests: [...pending, ...rest].map(toItem) };
  }

  async complete(
    accessToken: string | undefined,
    id: string,
    dto: ResolveAccountDeletionRequest
  ): Promise<AccountDeletionRequestResponse> {
    const admin = await this.authenticateAdmin(accessToken);
    const request = await this.findPending(id);
    if (!request.userId) throw new ConflictException("This account no longer exists.");

    // Already gone some other way (an admin deleted it directly) still honours the request.
    const target = await this.prisma.withDeleted.user.findUnique({
      select: { isDeleted: true },
      where: { id: request.userId }
    });
    // Claim the request first, so two admins cannot both run the deletion.
    const note = dto.note || null;
    const row = await this.resolve(id, admin.id, AccountDeletionStatus.COMPLETED, note);
    if (target && !target.isDeleted) {
      try {
        await this.users.deleteAs(admin, request.userId);
      } catch (error) {
        await this.prisma.accountDeletionRequest.updateMany({
          data: { reviewNote: null, reviewedAt: null, reviewedById: null, status: AccountDeletionStatus.PENDING },
          where: { id, status: AccountDeletionStatus.COMPLETED }
        });
        throw error;
      }
    }
    this.notifyUser(row.userEmail, true, note);
    return { request: toItem(row) };
  }

  async reject(
    accessToken: string | undefined,
    id: string,
    dto: RejectAccountDeletionRequest
  ): Promise<AccountDeletionRequestResponse> {
    const admin = await this.authenticateAdmin(accessToken);
    await this.findPending(id);
    const row = await this.resolve(id, admin.id, AccountDeletionStatus.REJECTED, dto.note);
    this.notifyUser(row.userEmail, false, dto.note);
    return { request: toItem(row) };
  }

  private async findPending(id: string) {
    const request = await this.prisma.accountDeletionRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Deletion request not found.");
    if (request.status !== AccountDeletionStatus.PENDING) {
      throw new ConflictException(`This request is already ${request.status.toLowerCase()}.`);
    }
    return request;
  }

  // Status-filtered, so a second click (or a withdraw in between) can't resolve it twice.
  private async resolve(id: string, adminId: string, status: AccountDeletionStatus, note: string | null) {
    const { count } = await this.prisma.accountDeletionRequest.updateMany({
      data: { reviewNote: note, reviewedAt: new Date(), reviewedById: adminId, status },
      where: { id, status: AccountDeletionStatus.PENDING }
    });
    if (count === 0) throw new ConflictException("This request was resolved by someone else.");
    return this.prisma.accountDeletionRequest.findUniqueOrThrow({ include: INCLUDE, where: { id } });
  }

  private notifyUser(email: string, completed: boolean, note: string | null) {
    this.mail
      .sendAccountDeletionResolved({ completed, email, note })
      .catch((error: unknown) => this.logger.warn(`Account-deletion outcome not sent: ${String(error)}`));
  }

  private authenticate(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private async authenticateAdmin(accessToken: string | undefined) {
    const user = await this.authenticate(accessToken);
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Admin access required.");
    }
    return user;
  }
}

function toItem(row: RequestRow): AccountDeletionRequestItem {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    reason: row.reason,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedByName: row.reviewedBy
      ? [row.reviewedBy.firstName, row.reviewedBy.lastName].filter(Boolean).join(" ")
      : null,
    status: row.status,
    userEmail: row.userEmail,
    userId: row.userId,
    userName: row.userName,
    userRole: row.userRole
  };
}
