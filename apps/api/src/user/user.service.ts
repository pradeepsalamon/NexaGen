import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  AuthUser,
  CreateUserRequest,
  PaginatedQuery,
  UpdateUserRequest,
  UserListResponse,
  UserResponse
} from "@nexa-chess/types";
import { Prisma, User, UserRole, UserStatus } from "@prisma/client";
import { hashSecret } from "../auth/auth.utils";
import {
  paginationMeta,
  resolveOrderBy,
  resolvePagination
} from "../common/pagination";
import { optionalQueryEnum } from "../common/query-params";
import { PrismaService } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { authenticateUser } from "../auth/authenticate";

type AuthenticatedUser = Pick<User, "id" | "email" | "role" | "status">;
type UserWithProfiles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

const userInclude = {
  coachProfile: true,
  studentProfile: true
} satisfies Prisma.UserInclude;

@Injectable()
export class UserService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly messaging: MessagingDispatchService,
    private readonly prisma: PrismaService,
    private readonly trashRepository: TrashRepository
  ) { }

  async list(
    accessToken: string | undefined,
    query?: PaginatedQuery & { status?: string }
  ): Promise<UserListResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(user);

    const { page, pageSize, skip, take, search } = resolvePagination(query);

    const where: Prisma.UserWhereInput = { isDeleted: false };
    const status =
      query?.status === "ALL" ? undefined : optionalQueryEnum(query?.status, UserStatus, "status");
    if (status) where.status = status;
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
      where: { id, isDeleted: false }
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
      where: { email: data.email }
    });

    if (existingUser) {
      throw new BadRequestException("User with this email already exists.");
    }

    const passwordHash = await hashSecret(data.password);

    const newUser = await this.prisma.$transaction(async (tx) => {
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
    });

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
      where: { id, isDeleted: false },
      include: userInclude
    });

    if (!userToUpdate) {
      throw new NotFoundException("User not found.");
    }
    this.assertCanModifyTarget(authUser, userToUpdate);

    if (data.role && data.role !== userToUpdate.role) {
      this.assertCanChangeRole(authUser, userToUpdate, data.role);
    }

    if (data.email && data.email !== userToUpdate.email) {
      // See create(): must include soft-deleted rows, the unique index does.
      const existingUser = await this.prisma.withDeleted.user.findUnique({
        where: { email: data.email }
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
      const upd = await tx.user.update({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          password: passwordHash,
          role: data.role,
          status: data.status
        },
        where: { id }
      });

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
    });

    return { user: this.toAuthUser(updated) };
  }

  async archive(accessToken: string | undefined, id: string): Promise<UserResponse> {
    const authUser = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(authUser);

    const userToArchive = await this.prisma.user.findUnique({
      include: userInclude,
      where: { id, isDeleted: false }
    });

    if (!userToArchive) {
      throw new NotFoundException("User not found.");
    }

    if (userToArchive.id === authUser.id) {
      throw new BadRequestException("You cannot archive yourself.");
    }

    this.assertCanModifyTarget(authUser, userToArchive);

    const updated = await this.prisma.user.update({
      where: { id, isDeleted: false },
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
      where: { id, isDeleted: false }
    });

    if (!userToRestore) {
      throw new NotFoundException("User not found.");
    }

    this.assertCanModifyTarget(authUser, userToRestore);

    const updated = await this.prisma.user.update({
      where: { id, isDeleted: false },
      data: { status: UserStatus.ACTIVE },
      include: userInclude
    });

    this.messaging.dispatchInBackground({
      event: "ACCOUNT_APPROVED",
      userId: updated.id
    });

    return { user: this.toAuthUser(updated) };
  }

  async delete(accessToken: string | undefined, id: string): Promise<{ ok: true }> {
    const authUser = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(authUser);

    const userToDelete = await this.prisma.user.findUnique({
      where: { id, isDeleted: false }
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
