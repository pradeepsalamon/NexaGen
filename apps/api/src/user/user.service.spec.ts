import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
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
        expect.objectContaining({ where: { isDeleted: false }, skip: 0, take: 20 })
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
      prismaService.user.findUnique.mockResolvedValueOnce(null);
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
    });

    it("leaves sessions alone for a plain profile edit", async () => {
      mockAuthContext();
      prismaService.user.findUnique.mockResolvedValueOnce({ id: "student-1", role: UserRole.STUDENT });
      prismaService.user.update.mockResolvedValueOnce({ id: "student-1" });
      prismaService.user.findUniqueOrThrow.mockResolvedValueOnce(studentRow("student-1"));

      await service.update("token", "student-1", { firstName: "Renamed" });

      expect(prismaService.user.update).toHaveBeenCalled();
      expect(prismaService.authSession.updateMany).not.toHaveBeenCalled();
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
      expect(result.ok).toBe(true);
    });
  });
});
