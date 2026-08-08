import { Test, TestingModule } from "@nestjs/testing";
import {
  ConflictException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { RegisterRequest } from "@nexa-chess/types";
import { ExperienceLevel, UserRole, UserStatus } from "@prisma/client";
import { AuthService } from "./auth.service";
import { hashSecret } from "./auth.utils";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";

type MockPrismaService = {
  authSession: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  coachProfile: {
    create: jest.Mock;
    update: jest.Mock;
  };
  passwordResetToken: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  studentProfile: {
    create: jest.Mock;
    update: jest.Mock;
  };
  user: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe("AuthService", () => {
  let service: AuthService;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let mailService: { sendPasswordResetLink: jest.Mock };
  let prismaService: MockPrismaService;

  beforeEach(async () => {
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn()
    };

    mailService = {
      sendPasswordResetLink: jest.fn()
    };

    prismaService = {
      authSession: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn()
      },
      coachProfile: {
        create: jest.fn(),
        update: jest.fn()
      },
      passwordResetToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn()
      },
      studentProfile: {
        create: jest.fn(),
        update: jest.fn()
      },
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn()
      },
      $transaction: jest.fn((operations: unknown) => operations)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: MailService, useValue: mailService },
        { provide: PrismaService, useValue: prismaService }
      ]
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const registerPayload: RegisterRequest = {
    confirmPassword: "password123",
    contactNumber: "1234567890",
    email: "Test@Example.com",
    experienceLevel: "beginner",
    parentName: "Jane Doe",
    password: "password123",
    studentAge: "10",
    studentName: "John Doe"
  };

  const activeUser = {
    avatarUrl: null,
    coachProfile: null,
    email: "test@example.com",
    firstName: "John",
    id: "usr-123",
    isEmailVerified: true,
    lastName: "Doe",
    password: "hashed-password",
    phoneNumber: "1234567890",
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
    studentProfile: {
      chessRating: null,
      dateOfBirth: null,
      experienceLevel: ExperienceLevel.BEGINNER,
      fideId: null,
      isDeleted: false,
      parentEmail: null,
      parentName: "Jane Doe",
      parentPhone: "1234567890",
      parentRelationship: null
    },
    timezone: "Asia/Kolkata",
    username: null
  };

  describe("getCookieMaxAges", () => {
    it("returns parsed duration values based on config", () => {
      const result = service.getCookieMaxAges();

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(typeof result.accessToken).toBe("number");
      expect(typeof result.refreshToken).toBe("number");
    });
  });

  describe("register", () => {
    it("hashes the password, formats the student name, and creates a user", async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(null);
      prismaService.user.create.mockResolvedValueOnce(activeUser);
      prismaService.authSession.create.mockResolvedValueOnce({ id: "sess-1" });
      prismaService.authSession.update.mockResolvedValueOnce({ id: "sess-1" });
      jwtService.signAsync.mockResolvedValue("mocked-token");

      const result = await service.register(registerPayload, {
        ipAddress: "127.0.0.1",
        userAgent: "test-agent"
      });

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" }
      });

      const createCall = prismaService.user.create.mock.calls[0][0];
      expect(createCall.data.password).not.toBe(registerPayload.password);
      expect(createCall.data.email).toBe("test@example.com");
      expect(createCall.data.firstName).toBe("John");
      expect(createCall.data.lastName).toBe("Doe");
      expect(createCall.data.phoneNumber).toBe(registerPayload.contactNumber);
      expect(createCall.data.studentProfile.create.experienceLevel).toBe(
        ExperienceLevel.BEGINNER
      );

      expect(result.user.email).toBe("test@example.com");
      expect(result.accessToken).toBe("mocked-token");
      expect(result.refreshToken).toBe("mocked-token");
    });

    it("throws ConflictException if email is already in use", async () => {
      prismaService.user.findUnique.mockResolvedValueOnce({ id: "usr-123" });

      await expect(service.register(registerPayload, {})).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe("login", () => {
    it("throws UnauthorizedException for invalid credentials", async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login({ email: "invalid@example.com", password: "pwd" }, {})
      ).rejects.toThrow(UnauthorizedException);
    });

    it("logs in successfully and returns tokens", async () => {
      const password = "password123";
      const passwordHash = await hashSecret(password);

      prismaService.user.findUnique.mockResolvedValueOnce({
        ...activeUser,
        password: passwordHash
      });
      prismaService.user.update.mockResolvedValueOnce(activeUser);
      prismaService.authSession.create.mockResolvedValueOnce({ id: "sess-1" });
      prismaService.authSession.update.mockResolvedValueOnce({ id: "sess-1" });
      jwtService.signAsync.mockResolvedValue("mocked-token");

      const result = await service.login(
        { email: "test@example.com", password, rememberMe: true },
        {}
      );

      expect(result.user.id).toBe("usr-123");
      expect(result.accessToken).toBe("mocked-token");
      expect(result.refreshToken).toBe("mocked-token");
      expect(result.refreshTokenMaxAge).toBeGreaterThan(0);
    });
  });

  describe("logout", () => {
    it("revokes the refresh session", async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({
        sessionId: "sess-1",
        sub: "usr-123",
        type: "refresh"
      });

      const result = await service.logout("refresh-token");

      expect(prismaService.authSession.updateMany).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });
  });

  describe("me", () => {
    it("returns the authenticated user", async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({
        sub: "usr-123",
        type: "access"
      });
      prismaService.user.findUnique.mockResolvedValueOnce(activeUser);

      const { user } = await service.me("access-token");

      expect(user.id).toBe("usr-123");
    });

    it("throws UnauthorizedException if user does not exist", async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({
        sub: "usr-unknown",
        type: "access"
      });
      prismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.me("access-token")).rejects.toThrow(
        UnauthorizedException
      );
    });
  });
});
