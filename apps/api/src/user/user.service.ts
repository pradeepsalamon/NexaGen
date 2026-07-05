import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-gen/config/api";
import type {
  AuthUser,
  CreateUserRequest,
  UpdateUserRequest,
  UserListResponse,
  UserResponse
} from "@nexa-gen/types";
import { Prisma, User, UserRole, UserStatus } from "@prisma/client";
import { hashSecret } from "../auth/auth.utils";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "../auth/types";
import { TrashRepository } from "../trash/trash.repository";

type AuthenticatedUser = Pick<User, "id" | "email" | "role" | "status">;

const userInclude = {
  coachProfile: true,
  studentProfile: true
} satisfies Prisma.UserInclude;

@Injectable()
export class UserService {
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trashRepository: TrashRepository
  ) { }

  async list(accessToken: string | undefined): Promise<UserListResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(user);

    const users = await this.prisma.user.findMany({
      include: userInclude,
      orderBy: [{ createdAt: "desc" }],
      where: { isDeleted: false }
    });

    return { users: users.map((u) => this.toAuthUser(u as any)) };
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

    return { user: this.toAuthUser(targetUser as any) };
  }

  async create(accessToken: string | undefined, data: CreateUserRequest): Promise<UserResponse> {
    const authUser = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(authUser);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      throw new BadRequestException("User with this email already exists.");
    }

    const passwordHash = await hashSecret(data.password || "Password123!");

    const newUser = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          password: passwordHash,
          role: data.role as UserRole,
          status: data.status as UserStatus,
          createdById: authUser.id,
          isEmailVerified: true
        }
      });

      if (data.role === UserRole.STUDENT) {
        await tx.studentProfile.create({
          data: {
            userId: created.id,
            parentName: data.firstName + " Parent",
          }
        });
      } else if (data.role === UserRole.COACH) {
        await tx.coachProfile.create({
          data: {
            userId: created.id
          }
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: userInclude
      });
    });

    return { user: this.toAuthUser(newUser as any) };
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

    if (data.email && data.email !== userToUpdate.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: data.email }
      });
      if (existingUser) {
        throw new BadRequestException("User with this email already exists.");
      }
    }

    let passwordHash = undefined;
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
          role: data.role as UserRole | undefined,
          status: data.status as UserStatus | undefined
        },
        where: { id }
      });

      if (data.role && data.role !== userToUpdate.role) {
        if (data.role === UserRole.STUDENT && !userToUpdate.studentProfile) {
          await tx.studentProfile.create({
            data: { userId: upd.id, parentName: upd.firstName + " Parent" }
          });
        }
        if (data.role === UserRole.COACH && !userToUpdate.coachProfile) {
          await tx.coachProfile.create({ data: { userId: upd.id } });
        }
      }

      return tx.user.findUniqueOrThrow({
        where: { id },
        include: userInclude
      });
    });

    return { user: this.toAuthUser(updated as any) };
  }

  async archive(accessToken: string | undefined, id: string): Promise<UserResponse> {
    const authUser = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(authUser);

    const updated = await this.prisma.user.update({
      where: { id, isDeleted: false },
      data: { status: UserStatus.ARCHIVED },
      include: userInclude
    });

    return { user: this.toAuthUser(updated as any) };
  }

  async restore(accessToken: string | undefined, id: string): Promise<UserResponse> {
    const authUser = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageUsers(authUser);

    const updated = await this.prisma.user.update({
      where: { id, isDeleted: false },
      data: { status: UserStatus.ACTIVE },
      include: userInclude
    });

    return { user: this.toAuthUser(updated as any) };
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

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: authUser.id
        }
      });

      await this.trashRepository.log(tx, {
        action: "SOFT_DELETE",
        entity: "User",
        entityId: id,
        metadata: { title: userToDelete.email },
        userId: authUser.id
      });
    });

    return { ok: true };
  }

  private async getAuthenticatedUser(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }

    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
      accessToken,
      { secret: this.env.JWT_ACCESS_SECRET }
    );

    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }

    return user;
  }

  private assertCanManageUsers(user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("You cannot manage users.");
    }
  }

  private toAuthUser(user: any): AuthUser {
    return {
      avatarUrl: user.avatarUrl,
      coachProfile: user.coachProfile,
      email: user.email,
      firstName: user.firstName,
      id: user.id,
      isEmailVerified: user.isEmailVerified,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      studentProfile: user.studentProfile,
      timezone: user.timezone
    };
  }
}
