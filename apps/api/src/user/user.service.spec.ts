import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { CreateUserRequest, UpdateUserRequest } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { UserService } from "./user.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { UNLIMITED_ENTITLEMENTS } from "../platform/entitlement.testing";

type MockPrismaService = {
  user: {
    count: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
  studentProfile: {
    create: jest.Mock;
  };
  authSession: {
    updateMany: jest.Mock;
  };
  passwordResetToken: {
    updateMany: jest.Mock;
  };
  coachProfile: {
    create: jest.Mock;
  };
  withDeleted: {
    user: {
      findUnique: jest.Mock;
    };
  };
  $transaction: jest.Mock;
};

describe("UserService", () => {
  let service: UserService;
  let prismaService: MockPrismaService;
  let jwtService: { verifyAsync: jest.Mock };
  let trashRepository: { cascadeSoftDelete: jest.Mock; log: jest.Mock };

  const studentRow = (id: string) => ({
    coachProfile: null,
    email: "student@example.com",
    firstName: "Student",
    id,
    isEmailVerified: true,
    lastName: null,
    phoneNumber: null,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
    studentProfile: null,
    timezone: "Asia/Kolkata",
    username: null
  });

  beforeEach(async () => {
    // `withDeleted` is the same Prisma client with the soft-delete filter
    // removed, so the double shares one user mock: a test can arrange or assert
    // through either path.
    const userMock = {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn()
    };

    prismaService = {
      user: userMock,
      withDeleted: { user: userMock },
      studentProfile: {
        create: jest.fn()
      },
      authSession: {
        updateMany: jest.fn()
      },
      passwordResetToken: {
        updateMany: jest.fn()
      },
      coachProfile: {
        create: jest.fn()
      },
      $transaction: jest.fn((callback: (transaction: MockPrismaService) => unknown) =>
        callback(prismaService)
      )
    };

    jwtService = {
      verifyAsync: jest.fn()
    };

    trashRepository = {
      cascadeSoftDelete: jest.fn(),
      log: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: MessagingDispatchService,
          useValue: { dispatchInBackground: jest.fn() }
        },
        { provide: PrismaService, useValue: prismaService },
        { provide: JwtService, useValue: jwtService },
        { provide: TrashRepository, useValue: trashRepository },
        UNLIMITED_ENTITLEMENTS
      ]
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockAuthContext(
    role: UserRole = UserRole.ADMIN,
    status: UserStatus = UserStatus.ACTIVE,
    id = "auth-123"
  ) {
    jwtService.verifyAsync.mockResolvedValueOnce({ sub: id, type: "access" });
    prismaService.user.findUnique.mockResolvedValueOnce({
      email: "auth@example.com",
      id,
      role,
      status
    });
  }

  const createStudentPayload: CreateUserRequest = {
    email: "student@example.com",
    firstName: "Student",
    password: "Password123",
    role: "STUDENT",
    status: "ACTIVE"
  };

  describe("list", () => {
    it("returns users for admins", async () => {
      mockAuthContext();
      prismaService.user.findMany.mockResolvedValueOnce([
        {
          coachProfile: null,
          email: "student@example.com",
          firstName: "Student",
          id: "user-1",
          isEmailVerified: true,
          lastName: null,
          phoneNumber: null,
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
          studentProfile: null,
          timezone: "Asia/Kolkata",
          username: null
        }
      ]);
      prismaService.user.count.mockResolvedValueOnce(1);

      const result = await service.list("token");

      expect(result.users).toHaveLength(1);
      expect(result.users[0].id).toBe("user-1");
      expect(result.pagination).toEqual({
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1
      });
      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isDeleted: false, isPlatformSupport: false }, skip: 0, take: 20 })
      );
    });

    it("rejects non-admin users", async () => {
      mockAuthContext(UserRole.STUDENT);

      await expect(service.list("token")).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getById", () => {
    it("returns a user by id", async () => {
      mockAuthContext();
      prismaService.user.findUnique.mockResolvedValueOnce({
        coachProfile: null,
        email: "student@example.com",
        firstName: "Student",
        id: "user-1",
        isEmailVerified: true,
        lastName: null,
        phoneNumber: null,
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        studentProfile: null,
        timezone: "Asia/Kolkata",
        username: null
      });

      const result = await service.getById("token", "user-1");

      expect(result.user.id).toBe("user-1");
    });

    it("throws NotFoundException when user is missing", async () => {
      mockAuthContext();
      prismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.getById("token", "unknown")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("create", () => {
    it("requires a password", async () => {
      mockAuthContext();

      await expect(
        service.create("token", {
          email: "student@example.com",
          firstName: "Student"
        } as CreateUserRequest)
      ).rejects.toThrow(BadRequestException);
    });

    it("prevents admins from creating admins", async () => {
      mockAuthContext(UserRole.ADMIN);

      await expect(
        service.create("token", {
          ...createStudentPayload,
          role: "ADMIN"
        })
      ).rejects.toThrow(ForbiddenException);
    });

    it("creates a student user and profile", async () => {
      mockAuthContext();
      prismaService.user.create.mockResolvedValueOnce({
        firstName: "Student",
        id: "new-user",
        role: UserRole.STUDENT
      });
      prismaService.user.findUniqueOrThrow.mockResolvedValueOnce(studentRow("new-user"));

      const result = await service.create("token", createStudentPayload);

      expect(prismaService.user.create).toHaveBeenCalled();
      expect(prismaService.studentProfile.create).toHaveBeenCalledWith({
        data: { parentName: "Student Parent", userId: "new-user" }
      });
      expect(result.user.id).toBe("new-user");
    });

    // Review A4: sign-in looks the email up lowercased.
    it("stores the email lowercased and trimmed", async () => {
      mockAuthContext();
      prismaService.user.create.mockResolvedValueOnce({ firstName: "Student", id: "new-user", role: UserRole.STUDENT });
      prismaService.user.findUniqueOrThrow.mockResolvedValueOnce(studentRow("new-user"));

      await service.create("token", { ...createStudentPayload, email: "  Ravi.K@Example.COM " });

      expect(prismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: "ravi.k@example.com" }) })
      );
      expect(prismaService.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: { equals: "ravi.k@example.com", mode: "insensitive" } })
        })
      );
    });

    it("refuses an email another account has in another letter case", async () => {
      mockAuthContext();
      prismaService.user.findFirst.mockResolvedValueOnce({ id: "old-user" });

      await expect(
        service.create("token", { ...createStudentPayload, email: "Student@Example.com" })
      ).rejects.toThrow("User with this email already exists.");
      expect(prismaService.user.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("prevents admins from modifying admins", async () => {
      mockAuthContext(UserRole.ADMIN);
      prismaService.user.findUnique.mockResolvedValueOnce({
        id: "admin-1",
        role: UserRole.ADMIN
      });

      await expect(
        service.update("token", "admin-1", { firstName: "Changed" })
      ).rejects.toThrow(ForbiddenException);
    });

    it("prevents users from changing their own role", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN, UserStatus.ACTIVE, "super-1");
      prismaService.user.findUnique.mockResolvedValueOnce({
        id: "super-1",
        role: UserRole.SUPER_ADMIN
      });

      await expect(
        service.update("token", "super-1", { role: "ADMIN" } as UpdateUserRequest)
      ).rejects.toThrow(BadRequestException);
    });

    // An admin resetting a compromised account's password must end the
    // sessions the old password opened, as the user's own reset does.
    it("revokes the user's sessions when an admin sets a new password", async () => {
      mockAuthContext();
      prismaService.user.findUnique.mockResolvedValueOnce({ id: "student-1", role: UserRole.STUDENT });
      prismaService.user.update.mockResolvedValueOnce({ id: "student-1" });
      prismaService.user.findUniqueOrThrow.mockResolvedValueOnce(studentRow("student-1"));

      await service.update("token", "student-1", { password: "New@Password1" } as UpdateUserRequest);

      expect(prismaService.authSession.updateMany).toHaveBeenCalledWith({
        data: { revokedAt: expect.any(Date) },
        where: { revokedAt: null, userId: "student-1" }
      });
      // Review A1: an unused reset or invite link dies with the old password.
      expect(prismaService.passwordResetToken.updateMany).toHaveBeenCalledWith({
        data: { usedAt: expect.any(Date) },
        where: { usedAt: null, userId: "student-1" }
      });
    });

    it("leaves sessions alone for a plain profile edit", async () => {
      mockAuthContext();
      prismaService.user.findUnique.mockResolvedValueOnce({ id: "student-1", role: UserRole.STUDENT });
      prismaService.user.update.mockResolvedValueOnce({ id: "student-1" });
      prismaService.user.findUniqueOrThrow.mockResolvedValueOnce(studentRow("student-1"));

      await service.update("token", "student-1", { firstName: "Renamed" });

      expect(prismaService.user.update).toHaveBeenCalled();
      expect(prismaService.authSession.updateMany).not.toHaveBeenCalled();
      expect(prismaService.passwordResetToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("archive", () => {
    it("prevents users from archiving themselves", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN, UserStatus.ACTIVE, "super-1");
      prismaService.user.findUnique.mockResolvedValueOnce({
        id: "super-1",
        role: UserRole.SUPER_ADMIN
      });

      await expect(service.archive("token", "super-1")).rejects.toThrow(
        BadRequestException
      );
    });

    it("archives a permitted user", async () => {
      mockAuthContext();
      prismaService.user.findUnique.mockResolvedValueOnce({
        id: "student-1",
        role: UserRole.STUDENT
      });
      prismaService.user.update.mockResolvedValueOnce({
        coachProfile: null,
        email: "student@example.com",
        firstName: "Student",
        id: "student-1",
        isEmailVerified: true,
        lastName: null,
        phoneNumber: null,
        role: UserRole.STUDENT,
        status: UserStatus.ARCHIVED,
        studentProfile: null,
        timezone: "Asia/Kolkata",
        username: null
      });

      const result = await service.archive("token", "student-1");

      expect(result.user.status).toBe("ARCHIVED");
      // Review A3: a restore must not bring an old refresh token back.
      expect(prismaService.authSession.updateMany).toHaveBeenCalledWith({
        data: { revokedAt: expect.any(Date) },
        where: { revokedAt: null, userId: "student-1" }
      });
    });
  });

  describe("delete", () => {
    it("prevents deleting yourself", async () => {
      mockAuthContext(UserRole.ADMIN, UserStatus.ACTIVE, "auth-123");
      prismaService.user.findUnique.mockResolvedValueOnce({
        email: "auth@example.com",
        id: "auth-123",
        role: UserRole.ADMIN
      });

      await expect(service.delete("token", "auth-123")).rejects.toThrow(
        BadRequestException
      );
    });

    it("prevents deleting the last super admin", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN, UserStatus.ACTIVE, "super-1");
      prismaService.user.findUnique.mockResolvedValueOnce({
        email: "last@example.com",
        id: "super-2",
        role: UserRole.SUPER_ADMIN
      });
      prismaService.user.count.mockResolvedValueOnce(0);

      await expect(service.delete("token", "super-2")).rejects.toThrow(
        BadRequestException
      );
    });

    it("cascade soft deletes a permitted user with trash metadata", async () => {
      mockAuthContext();
      prismaService.user.findUnique.mockResolvedValueOnce({
        email: "student@example.com",
        id: "student-1",
        role: UserRole.STUDENT
      });

      const result = await service.delete("token", "student-1");

      expect(trashRepository.cascadeSoftDelete).toHaveBeenCalledWith(
        prismaService,
        "User",
        "student-1",
        expect.any(String),
        { metadata: { title: "student@example.com" } }
      );
      expect(prismaService.authSession.updateMany).toHaveBeenCalledWith({
        data: { revokedAt: expect.any(Date) },
        where: { revokedAt: null, userId: "student-1" }
      });
      expect(result.ok).toBe(true);
    });
  });

  // docs/MULTI_ROLE_ACCOUNTS.md §5.2: "Can also teach".
  describe("setExtraRoles", () => {
    type Extra = {
      batchCoach: { findMany: jest.Mock };
      coachProfile: { create: jest.Mock; update: jest.Mock };
      user: { updateMany: jest.Mock };
      userRoleChange: { create: jest.Mock };
      withDeleted: { coachProfile: { findUnique: jest.Mock } };
    };
    let extra: Extra;
    let assertSeatAvailable: jest.Mock;
    const adminRow = (overrides: Record<string, unknown> = {}) => ({
      ...studentRow("admin-1"),
      extraRoles: [] as UserRole[],
      role: UserRole.ADMIN,
      ...overrides
    });

    beforeEach(() => {
      const mock = prismaService as unknown as Extra & MockPrismaService;
      mock.batchCoach = { findMany: jest.fn().mockResolvedValue([]) };
      mock.coachProfile.update = jest.fn();
      mock.user.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      mock.userRoleChange = { create: jest.fn() };
      (mock.withDeleted as unknown as Extra["withDeleted"]).coachProfile = { findUnique: jest.fn().mockResolvedValue(null) };
      extra = mock;
      assertSeatAvailable = jest.fn().mockResolvedValue(undefined);
      (service as unknown as { entitlements: { assertSeatAvailable: jest.Mock } }).entitlements.assertSeatAvailable =
        assertSeatAvailable;
    });

    it("lets a super admin make an admin able to teach", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN);
      prismaService.user.findUnique.mockResolvedValueOnce(adminRow());
      prismaService.user.findUniqueOrThrow.mockResolvedValueOnce(adminRow({ extraRoles: [UserRole.COACH] }));

      const result = await service.setExtraRoles("token", "admin-1", { extraRoles: ["COACH"] });

      expect(assertSeatAvailable).toHaveBeenCalledWith(prismaService, UserRole.COACH, "admin-1");
      expect(prismaService.coachProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ approvalStatus: UserStatus.ACTIVE, approvedById: "auth-123", userId: "admin-1" })
      });
      expect(extra.user.updateMany).toHaveBeenCalledWith({
        data: { extraRoles: [UserRole.COACH] },
        where: { extraRoles: { equals: [] }, id: "admin-1", isDeleted: false, role: UserRole.ADMIN, status: UserStatus.ACTIVE }
      });
      expect(extra.userRoleChange.create).toHaveBeenCalledWith({
        data: { action: "GRANTED", actorId: "auth-123", role: UserRole.COACH, userId: "admin-1" }
      });
      expect(result.user.extraRoles).toEqual([UserRole.COACH]);
      expect(result.coachedBatches).toEqual([]);
    });

    it("lets a super admin grant it to their own account (a solo academy owner)", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN, UserStatus.ACTIVE, "owner-1");
      prismaService.user.findUnique.mockResolvedValueOnce(adminRow({ id: "owner-1", role: UserRole.SUPER_ADMIN }));
      prismaService.user.findUniqueOrThrow.mockResolvedValueOnce(adminRow({ extraRoles: [UserRole.COACH], id: "owner-1" }));
      await expect(service.setExtraRoles("token", "owner-1", { extraRoles: ["COACH"] })).resolves.toBeDefined();
    });

    it("revives a retired coach profile instead of creating a second one", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN);
      prismaService.user.findUnique.mockResolvedValueOnce(adminRow());
      extra.withDeleted.coachProfile.findUnique.mockResolvedValueOnce({ approvalStatus: "ACTIVE", id: "cp-1", isDeleted: true });
      prismaService.user.findUniqueOrThrow.mockResolvedValueOnce(adminRow({ extraRoles: [UserRole.COACH] }));

      await service.setExtraRoles("token", "admin-1", { extraRoles: ["COACH"] });

      expect(prismaService.coachProfile.create).not.toHaveBeenCalled();
      expect(extra.coachProfile.update).toHaveBeenCalledWith({
        data: expect.objectContaining({ isDeleted: false }),
        where: { id: "cp-1" }
      });
    });

    it("refuses a plain admin", async () => {
      mockAuthContext(UserRole.ADMIN);
      await expect(service.setExtraRoles("token", "admin-1", { extraRoles: ["COACH"] })).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });

    it("refuses an account that is not staff", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN);
      prismaService.user.findUnique.mockResolvedValueOnce(adminRow({ role: UserRole.STUDENT }));
      await expect(service.setExtraRoles("token", "admin-1", { extraRoles: ["COACH"] })).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(extra.user.updateMany).not.toHaveBeenCalled();
    });

    it("refuses to grant to an inactive account", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN);
      prismaService.user.findUnique.mockResolvedValueOnce(adminRow({ status: UserStatus.ARCHIVED }));
      await expect(service.setExtraRoles("token", "admin-1", { extraRoles: ["COACH"] })).rejects.toThrow("Activate");
    });

    it("refuses when the plan has no coach seat left", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN);
      prismaService.user.findUnique.mockResolvedValueOnce(adminRow());
      assertSeatAvailable.mockRejectedValueOnce(new Error("Your plan allows 1 coach."));
      await expect(service.setExtraRoles("token", "admin-1", { extraRoles: ["COACH"] })).rejects.toThrow("1 coach");
      expect(extra.user.updateMany).not.toHaveBeenCalled();
    });

    it("loses cleanly to a concurrent change", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN);
      prismaService.user.findUnique.mockResolvedValueOnce(adminRow());
      extra.user.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.setExtraRoles("token", "admin-1", { extraRoles: ["COACH"] })).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it("removes it, records it and lists the batches still coached", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN);
      prismaService.user.findUnique.mockResolvedValueOnce(adminRow({ extraRoles: [UserRole.COACH] }));
      prismaService.user.findUniqueOrThrow.mockResolvedValueOnce(adminRow());
      extra.batchCoach.findMany.mockResolvedValueOnce([{ batch: { id: "b1", name: "Juniors" } }]);

      const result = await service.setExtraRoles("token", "admin-1", { extraRoles: [] });

      expect(assertSeatAvailable).not.toHaveBeenCalled();
      expect(extra.userRoleChange.create).toHaveBeenCalledWith({
        data: { action: "REMOVED", actorId: "auth-123", role: UserRole.COACH, userId: "admin-1" }
      });
      expect(result.coachedBatches).toEqual([{ id: "b1", name: "Juniors" }]);
    });

    it("turns a grant that raced a role change into a conflict, not a 500", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN);
      prismaService.user.findUnique.mockResolvedValueOnce(adminRow());
      prismaService.user.update.mockRejectedValueOnce(
        new Error('new row for relation "users" violates check constraint "users_extra_roles_v1_check"')
      );
      await expect(service.update("token", "admin-1", { role: UserRole.STUDENT } as UpdateUserRequest)).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it("drops the extra role when the account stops being staff", async () => {
      mockAuthContext(UserRole.SUPER_ADMIN);
      prismaService.user.findUnique.mockResolvedValueOnce(adminRow({ extraRoles: [UserRole.COACH] }));
      prismaService.user.update.mockResolvedValueOnce(adminRow({ role: UserRole.COACH }));
      prismaService.user.findUniqueOrThrow.mockResolvedValueOnce(adminRow({ role: UserRole.COACH }));

      await service.update("token", "admin-1", { role: UserRole.COACH } as UpdateUserRequest);

      expect(prismaService.user.update.mock.calls[0][0].data).toMatchObject({ extraRoles: [], role: UserRole.COACH });
      expect(extra.userRoleChange.create).toHaveBeenCalledWith({
        data: { action: "REMOVED", actorId: "auth-123", role: UserRole.COACH, userId: "admin-1" }
      });
    });
  });
});
