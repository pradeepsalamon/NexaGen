import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  AuthUser,
  CreateUserRequest,
  PaginatedQuery,
  UpdateExtraRolesRequest,
  UpdateExtraRolesResponse,
  UpdateUserRequest,
  UserListResponse,
  UserResponse
} from "@nexa-chess/types";
import { canHoldExtraRole } from "@nexa-chess/types";
import { type CoachProfile, Prisma, User, UserRole, UserRoleChangeAction, UserStatus } from "@prisma/client";
import { hashSecret } from "../auth/auth.utils";
import {
  paginationMeta,
  resolveOrderBy,
  resolvePagination
} from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { authenticateUser } from "../auth/authenticate";
import { queryEnum } from "../common/query-params";
import { EntitlementService } from "../platform/entitlement.service";
import { ReferralTrackerService } from "../referral/referral-tracker.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import type { PrismaTransactionClient } from "../prisma/prisma.service";

type AuthenticatedUser = Pick<User, "id" | "email" | "role" | "status">;
type UserWithProfiles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

const userInclude = {
  coachProfile: true,
  studentProfile: true
} satisfies Prisma.UserInclude;

@Injectable()
export class UserService {

  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jwtService: JwtService,
    private readonly messaging: MessagingDispatchService,
    private readonly prisma: PrismaService,
    private readonly trashRepository: TrashRepository,
    @Optional() private readonly referralTracker?: ReferralTrackerService
  ) { }

  async list(
    accessToken: string | undefined,
    query?: PaginatedQuery & { status?: string }
  ): Promise<UserListResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(user);

    const { page, pageSize, skip, take, search } = resolvePagination(query);

    // The academy's hidden "Platform support" account is never listed (§I).
    const where: Prisma.UserWhereInput = { isDeleted: false, isPlatformSupport: false };
    const status = queryEnum(query?.status, UserStatus, "status");
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } }
      ];
    }

    const orderBy = resolveOrderBy(
      query,
      ["firstName", "email", "role", "status", "createdAt"] as const,
      [{ firstName: "asc" }, { lastName: "asc" }]
    ) as Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[];

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ include: userInclude, orderBy, where, skip, take }),
      this.prisma.user.count({ where })
    ]);

    return {
      users: users.map((u) => this.toAuthUser(u)),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  async getById(accessToken: string | undefined, id: string): Promise<UserResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(user);

    const targetUser = await this.prisma.user.findUnique({
      include: userInclude,
      where: { id, isDeleted: false, isPlatformSupport: false }
    });

    if (!targetUser) {
      throw new NotFoundException("User not found.");
    }

    return { user: this.toAuthUser(targetUser) };
  }

  async create(accessToken: string | undefined, data: CreateUserRequest): Promise<UserResponse> {
    const authUser = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(authUser);
    this.assertCanCreateRole(authUser, data.role ?? UserRole.STUDENT);

    if (!data.password) {
      throw new BadRequestException("Password is required.");
    }

    // `withDeleted` bypasses the soft-delete filter. users.email is uniquely
    // indexed across deleted rows too, so a filtered read would miss the
    // conflict and the insert would fail with P2002 -> unhandled 500.
    const existingUser = await this.prisma.withDeleted.user.findUnique({
      where: { tenantId_email: { email: data.email, tenantId: requireTenantId("user") } }
    });

    if (existingUser) {
      throw new BadRequestException("User with this email already exists.");
    }

    const passwordHash = await hashSecret(data.password);

    const newUser = await this.prisma.$transaction(async (tx) => {
      if ((data.status ?? UserStatus.ACTIVE) === UserStatus.ACTIVE) {
        await this.entitlements.assertSeatAvailable(tx, data.role ?? UserRole.STUDENT);
      }
      const created = await tx.user.create({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          password: passwordHash,
          role: data.role ?? UserRole.STUDENT,
          status: data.status ?? UserStatus.ACTIVE,
          createdById: authUser.id,
          isEmailVerified: true
        }
      });

      if ((data.role ?? UserRole.STUDENT) === UserRole.STUDENT) {
        await tx.studentProfile.create({
          data: {
            userId: created.id,
            parentName: data.firstName + " Parent",
          }
        });
      } else if ((data.role ?? UserRole.STUDENT) === UserRole.COACH) {
        // An admin creating the account *is* the approval — otherwise the
        // login gate on `approvalStatus` would lock them out (AUDIT H9).
        await tx.coachProfile.create({
          data: {
            approvalStatus: UserStatus.ACTIVE,
            approvedAt: new Date(),
            approvedById: authUser.id,
            userId: created.id
          }
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: userInclude
      });
    }).catch(rethrowUniqueAsConflict);

    // Same as self sign-up (docs/REFERRALS.md "The new member's account"): a referral whose lead
    // used this email gets the account, and its new-member points. Never throws.
    if (newUser.role === UserRole.STUDENT || newUser.role === UserRole.COACH) {
      await this.referralTracker?.linkSignup({ email: newUser.email, userId: newUser.id });
    }

    return { user: this.toAuthUser(newUser) };
  }

  async update(
    accessToken: string | undefined,
    id: string,
    data: UpdateUserRequest
  ): Promise<UserResponse> {
    const authUser = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(authUser);

    const userToUpdate = await this.prisma.user.findUnique({
      where: { id, isDeleted: false, isPlatformSupport: false },
      include: userInclude
    });

    if (!userToUpdate) {
      throw new NotFoundException("User not found.");
    }
    this.assertCanModifyTarget(authUser, userToUpdate);

    if (data.role && data.role !== userToUpdate.role) {
      this.assertCanChangeRole(authUser, userToUpdate, data.role);
    }
    // Deactivating yourself would end your own session mid-edit and lock you out.
    if (data.status && data.status !== userToUpdate.status && userToUpdate.id === authUser.id) {
      throw new BadRequestException("You cannot change your own status.");
    }

    if (data.email && data.email !== userToUpdate.email) {
      // See create(): must include soft-deleted rows, the unique index does.
      const existingUser = await this.prisma.withDeleted.user.findUnique({
        where: { tenantId_email: { email: data.email, tenantId: requireTenantId("user") } }
      });
      if (existingUser) {
        throw new BadRequestException("User with this email already exists.");
      }
    }

    let passwordHash: string | undefined;
    if (data.password) {
      passwordHash = await hashSecret(data.password);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Becoming an active student/coach (by role or status) takes a plan seat.
      const nextRole = data.role ?? userToUpdate.role;
      const nextStatus = data.status ?? userToUpdate.status;
      // Extra roles the new primary role may not hold go with the change
      // (docs/MULTI_ROLE_ACCOUNTS.md §3; e.g. an admin who teaches made a coach).
      const currentExtraRoles = userToUpdate.extraRoles ?? [];
      const keptExtraRoles = currentExtraRoles.filter((role) => canHoldExtraRole(nextRole, role));
      if (
        nextStatus === UserStatus.ACTIVE &&
        (nextRole !== userToUpdate.role || userToUpdate.status !== UserStatus.ACTIVE)
      ) {
        await this.entitlements.assertSeatAvailable(tx, nextRole, id);
        // Reactivating an admin who can teach takes a coach seat again.
        if (userToUpdate.status !== UserStatus.ACTIVE && keptExtraRoles.includes(UserRole.COACH)) {
          await this.entitlements.assertSeatAvailable(tx, UserRole.COACH, id);
        }
      }
      const droppedExtraRoles = currentExtraRoles.filter((role) => !keptExtraRoles.includes(role));
      if (droppedExtraRoles.length > 0) {
        await this.recordRoleChanges(tx, id, droppedExtraRoles, UserRoleChangeAction.REMOVED, authUser.id);
      }
      const upd = await tx.user.update({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          password: passwordHash,
          role: data.role,
          status: data.status,
          ...(keptExtraRoles.length !== currentExtraRoles.length ? { extraRoles: keptExtraRoles } : {})
        },
        where: { id }
      });

      // A link sent to the old address must not vouch for the new one.
      if (data.email && data.email !== userToUpdate.email) {
        await tx.emailVerificationToken.updateMany({
          data: { usedAt: new Date() },
          where: { usedAt: null, userId: id }
        });
      }

      // A new password must lock out whoever held the old one, as the user's
      // own reset does (auth.service resetPassword): revoke every session, so
      // a stolen refresh token stops minting access tokens now.
      if (passwordHash || (data.status && data.status !== UserStatus.ACTIVE)) {
        await tx.authSession.updateMany({
          data: { revokedAt: new Date() },
          where: { revokedAt: null, userId: id }
        });
      }

      if (data.role && data.role !== userToUpdate.role) {
        // On a STUDENT<->COACH switch, retire the profile for the old role so
        // the user isn't left holding both, and (re)activate the profile for
        // the new role (AUDIT M16). Soft delete keeps rows for trash/audit;
        // a previously-retired profile is un-deleted rather than re-created
        // (its `userId` is uniquely indexed).
        if (data.role === UserRole.STUDENT) {
          if (userToUpdate.coachProfile && !userToUpdate.coachProfile.isDeleted) {
            await this.trashRepository.softDelete(
              tx,
              "CoachProfile",
              userToUpdate.coachProfile.id,
              authUser.id
            );
          }
          if (userToUpdate.studentProfile) {
            if (userToUpdate.studentProfile.isDeleted) {
              await tx.studentProfile.update({
                where: { id: userToUpdate.studentProfile.id },
                data: { isDeleted: false, deletedAt: null, deletedById: null }
              });
            }
          } else {
            await tx.studentProfile.create({
              data: { userId: upd.id, parentName: upd.firstName + " Parent" }
            });
          }
        }
        if (data.role === UserRole.COACH) {
          if (userToUpdate.studentProfile && !userToUpdate.studentProfile.isDeleted) {
            await this.trashRepository.softDelete(
              tx,
              "StudentProfile",
              userToUpdate.studentProfile.id,
              authUser.id
            );
          }
          if (userToUpdate.coachProfile) {
            if (userToUpdate.coachProfile.isDeleted) {
              await tx.coachProfile.update({
                where: { id: userToUpdate.coachProfile.id },
                data: {
                  isDeleted: false,
                  deletedAt: null,
                  deletedById: null,
                  approvalStatus: UserStatus.ACTIVE,
                  approvedAt: new Date(),
                  approvedById: authUser.id
                }
              });
            }
          } else {
            // See create(): promoting a user to COACH is itself the approval.
            await tx.coachProfile.create({
              data: {
                approvalStatus: UserStatus.ACTIVE,
                approvedAt: new Date(),
                approvedById: authUser.id,
                userId: upd.id
              }
            });
          }
        }
      }

      return tx.user.findUniqueOrThrow({
        where: { id },
        include: userInclude
      });
    }).catch(rethrowUniqueAsConflict);

    return { user: this.toAuthUser(updated) };
  }

  async archive(accessToken: string | undefined, id: string): Promise<UserResponse> {
    const authUser = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(authUser);

    const userToArchive = await this.prisma.user.findUnique({
      include: userInclude,
      where: { id, isDeleted: false, isPlatformSupport: false }
    });

    if (!userToArchive) {
      throw new NotFoundException("User not found.");
    }

    if (userToArchive.id === authUser.id) {
      throw new BadRequestException("You cannot archive yourself.");
    }

    this.assertCanModifyTarget(authUser, userToArchive);

    const updated = await this.prisma.user.update({
      where: { id, isDeleted: false, isPlatformSupport: false },
      data: { status: UserStatus.ARCHIVED },
      include: userInclude
    });

    return { user: this.toAuthUser(updated) };
  }

  async restore(accessToken: string | undefined, id: string): Promise<UserResponse> {
    const authUser = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(authUser);

    const userToRestore = await this.prisma.user.findUnique({
      include: userInclude,
      where: { id, isDeleted: false, isPlatformSupport: false }
    });

    if (!userToRestore) {
      throw new NotFoundException("User not found.");
    }

    this.assertCanModifyTarget(authUser, userToRestore);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (userToRestore.status !== UserStatus.ACTIVE) {
        await this.entitlements.assertSeatAvailable(tx, userToRestore.role, id);
        if (userToRestore.extraRoles?.includes(UserRole.COACH) && userToRestore.role !== UserRole.COACH) {
          await this.entitlements.assertSeatAvailable(tx, UserRole.COACH, id);
        }
      }
      return tx.user.update({
        where: { id, isDeleted: false, isPlatformSupport: false },
        data: { status: UserStatus.ACTIVE },
        include: userInclude
      });
    });

    this.messaging.dispatchInBackground({
      event: "ACCOUNT_APPROVED",
      userId: updated.id
    });

    return { user: this.toAuthUser(updated) };
  }

  /**
   * "Can also teach" (docs/MULTI_ROLE_ACCOUNTS.md §5.2): sets the extra roles
   * of an ADMIN / SUPER_ADMIN account. Only a SUPER_ADMIN acting as one may
   * do it (their own account included: a solo academy owner has one login).
   * Granting COACH takes a coach seat and makes sure the account has an
   * approved coach profile; removing it lets the account's sessions in coach
   * view fall back to the primary role on their next request.
   */
  async setExtraRoles(
    accessToken: string | undefined,
    id: string,
    data: UpdateExtraRolesRequest
  ): Promise<UpdateExtraRolesResponse> {
    const authUser = await this.getAuthenticatedUser(accessToken);
    if (authUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only a super admin can change who can also teach.");
    }

    const target = await this.prisma.user.findUnique({
      include: userInclude,
      where: { id, isDeleted: false, isPlatformSupport: false }
    });
    if (!target) {
      throw new NotFoundException("User not found.");
    }

    const wanted = [...new Set(data.extraRoles as UserRole[])];
    for (const role of wanted) {
      if (!canHoldExtraRole(target.role, role)) {
        throw new BadRequestException("Only an admin or super admin account can also teach.");
      }
    }
    const current = target.extraRoles ?? [];
    const granted = wanted.filter((role) => !current.includes(role));
    const removed = current.filter((role) => !wanted.includes(role));
    if (granted.length > 0 && target.status !== UserStatus.ACTIVE) {
      throw new BadRequestException("Activate the account before letting it teach.");
    }
    // Trashed rows too: `userId` is unique, so a retired profile is revived, not re-created.
    const coachProfile = granted.includes(UserRole.COACH)
      ? await this.prisma.withDeleted.coachProfile.findUnique({ where: { userId: id } })
      : null;

    const updated = granted.length === 0 && removed.length === 0
      ? target
      : await this.prisma.$transaction(async (tx) => {
          if (granted.includes(UserRole.COACH)) {
            // Under the plan's coach-limit lock, like any new coach.
            await this.entitlements.assertSeatAvailable(tx, UserRole.COACH, id);
            await this.ensureApprovedCoachProfile(tx, id, coachProfile, authUser.id);
          }
          // Claim on the roles we read, so two concurrent edits can't both apply.
          const claimed = await tx.user.updateMany({
            data: { extraRoles: wanted },
            // Also pin the role (and, for a grant, the status) we validated, so a
            // concurrent edit of the account makes this a conflict, not a bad grant.
            where: {
              extraRoles: { equals: current },
              id,
              isDeleted: false,
              role: target.role,
              ...(granted.length > 0 ? { status: UserStatus.ACTIVE } : {})
            }
          });
          if (claimed.count !== 1) {
            throw new ConflictException("This account changed meanwhile. Reload and try again.");
          }
          await this.recordRoleChanges(tx, id, granted, UserRoleChangeAction.GRANTED, authUser.id);
          await this.recordRoleChanges(tx, id, removed, UserRoleChangeAction.REMOVED, authUser.id);
          return tx.user.findUniqueOrThrow({ include: userInclude, where: { id } });
        });

    // Batches keep this account as their coach (history); the admin sees which.
    const coachedBatches = removed.includes(UserRole.COACH)
      ? (
          await this.prisma.batchCoach.findMany({
            orderBy: { batch: { name: "asc" } },
            select: { batch: { select: { id: true, name: true } } },
            where: { batch: { isDeleted: false }, coachId: id, isDeleted: false }
          })
        ).map((row) => row.batch)
      : [];

    return { coachedBatches, user: this.toAuthUser(updated) };
  }

  /** An approved, live coach profile (payroll rates, transcript consent hang off it). */
  private async ensureApprovedCoachProfile(
    tx: PrismaTransactionClient,
    userId: string,
    profile: Pick<CoachProfile, "approvalStatus" | "id" | "isDeleted"> | null,
    actorId: string
  ) {
    const approval = { approvalStatus: UserStatus.ACTIVE, approvedAt: new Date(), approvedById: actorId };
    if (!profile) {
      await tx.coachProfile.create({ data: { ...approval, userId } });
    } else if (profile.isDeleted || profile.approvalStatus !== UserStatus.ACTIVE) {
      await tx.coachProfile.update({
        data: { ...approval, deletedAt: null, deletedById: null, isDeleted: false },
        where: { id: profile.id }
      });
    }
  }

  private async recordRoleChanges(
    tx: PrismaTransactionClient,
    userId: string,
    roles: UserRole[],
    action: UserRoleChangeAction,
    actorId: string
  ) {
    for (const role of roles) {
      await tx.userRoleChange.create({ data: { action, actorId, role, userId } });
    }
  }

  async delete(accessToken: string | undefined, id: string): Promise<{ ok: true }> {
    return this.deleteAs(await this.getAuthenticatedUser(accessToken), id);
  }

  /** The one way a user is soft-deleted, also used to complete a deletion request. */
  async deleteAs(authUser: AuthenticatedUser, id: string): Promise<{ ok: true }> {
    this.assertCanManageUsers(authUser);

    const userToDelete = await this.prisma.user.findUnique({
      where: { id, isDeleted: false, isPlatformSupport: false }
    });

    if (!userToDelete) {
      throw new NotFoundException("User not found.");
    }

    if (userToDelete.id === authUser.id) {
      throw new BadRequestException("You cannot delete yourself.");
    }
    this.assertCanModifyTarget(authUser, userToDelete);
    await this.assertCanDeleteSuperAdmin(userToDelete);

    // Retire the user together with their student/coach profile in one group so
    // a trash restore brings the profile back too (AUDIT M13/M14).
    await this.prisma.$transaction((tx) =>
      this.trashRepository.cascadeSoftDelete(tx, "User", id, authUser.id, {
        metadata: { title: userToDelete.email }
      })
    );

    return { ok: true };
  }

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private assertCanManageUsers(user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("You cannot manage users.");
    }
  }

  private assertCanCreateRole(user: AuthenticatedUser, role: UserRole) {
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN)
    ) {
      throw new ForbiddenException("Only super admins can create admin users.");
    }
  }

  private assertCanModifyTarget(user: AuthenticatedUser, targetUser: Pick<User, "id" | "role">) {
    if (
      user.role === UserRole.ADMIN &&
      (targetUser.role === UserRole.ADMIN || targetUser.role === UserRole.SUPER_ADMIN)
    ) {
      throw new ForbiddenException("Admins cannot manage admin users.");
    }
  }

  private assertCanChangeRole(
    user: AuthenticatedUser,
    targetUser: Pick<User, "id" | "role">,
    role: UserRole
  ) {
    if (user.id === targetUser.id) {
      throw new BadRequestException("You cannot change your own role.");
    }

    if (
      user.role !== UserRole.SUPER_ADMIN &&
      (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN)
    ) {
      throw new ForbiddenException("Only super admins can assign admin roles.");
    }
  }

  private async assertCanDeleteSuperAdmin(targetUser: Pick<User, "id" | "role">) {
    if (targetUser.role !== UserRole.SUPER_ADMIN) {
      return;
    }

    const remainingSuperAdmins = await this.prisma.user.count({
      where: {
        id: { not: targetUser.id },
        isDeleted: false,
        role: UserRole.SUPER_ADMIN
      }
    });

    if (remainingSuperAdmins === 0) {
      throw new BadRequestException("You cannot delete the last super admin.");
    }
  }

  private toAuthUser(user: UserWithProfiles): AuthUser {
    return {
      avatarUrl: user.avatarUrl,
      coachProfile: user.coachProfile && !user.coachProfile.isDeleted
        ? {
            bio: user.coachProfile.bio,
            fideId: user.coachProfile.fideId,
            fideRating: user.coachProfile.fideRating,
            hourlyRate: user.coachProfile.hourlyRate?.toString() ?? null,
            qualification: user.coachProfile.qualification,
            specialization: user.coachProfile.specialization,
            title: user.coachProfile.title,
            yearsOfExperience: user.coachProfile.yearsOfExperience
          }
        : null,
      email: user.email,
      extraRoles: [...(user.extraRoles ?? [])],
      firstName: user.firstName,
      id: user.id,
      isEmailVerified: user.isEmailVerified,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      studentProfile: user.studentProfile && !user.studentProfile.isDeleted
        ? {
            chessRating: user.studentProfile.chessRating,
            dateOfBirth: user.studentProfile.dateOfBirth?.toISOString() ?? null,
            experienceLevel: user.studentProfile.experienceLevel,
            referralSource: user.studentProfile.referralSource,
            fideId: user.studentProfile.fideId,
            parentEmail: user.studentProfile.parentEmail,
            parentName: user.studentProfile.parentName,
            parentPhone: user.studentProfile.parentPhone,
            parentRelationship: user.studentProfile.parentRelationship
          }
        : null,
      timezone: user.timezone,
      username: user.username
    };
  }
}

/** A concurrent create/edit won the email (or username) between the pre-check and the write. */
function rethrowUniqueAsConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictException("User with this email already exists.");
  }
  // A "Can also teach" grant landed between this edit's read and its write, and
  // the new role can't hold it (docs/MULTI_ROLE_ACCOUNTS.md): the database refused.
  if (error instanceof Error && error.message.includes("users_extra_roles_v1_check")) {
    throw new ConflictException("This account changed meanwhile. Reload and try again.");
  }
  throw error;
}
