import { Test, TestingModule } from "@nestjs/testing";
import {
  ConflictException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { RegisterCoachRequest, RegisterRequest } from "@nexa-chess/types";
import {
  ReferralSource,
  UserRole,
  UserStatus
} from "@prisma/client";
import { AuthService } from "./auth.service";
import { hashRefreshToken, hashSecret } from "./auth.utils";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import type { LoginOutcome } from "./auth.service";
import { MfaService } from "./mfa/mfa.service";
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
  withDeleted: {
    user: {
      findUnique: jest.Mock;
    };
  };
  $transaction: jest.Mock;
};

describe("AuthService", () => {
  let service: AuthService;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let mailService: { sendPasswordResetLink: jest.Mock };
  let prismaService: MockPrismaService;
  let analyticsEvents: { record: jest.Mock };
  let mfaService: { loginChallenge: jest.Mock };

  const asSession = (outcome: LoginOutcome) => {
    if (outcome.kind !== "session") throw new Error("Expected a session, got an MFA challenge.");
    return outcome;
  };

  beforeEach(async () => {
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn()
    };

    analyticsEvents = { record: jest.fn().mockResolvedValue(undefined) };
    mfaService = { loginChallenge: jest.fn().mockResolvedValue(null) };

    mailService = {
      sendPasswordResetLink: jest.fn()
    };

    // `withDeleted` is the same Prisma client with the soft-delete filter
    // removed, so the double shares one user mock: a test can arrange or assert
    // through either path.
    const userMock = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn()
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
      user: userMock,
      withDeleted: { user: userMock },
      $transaction: jest.fn((operations: unknown) => operations)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: MailService, useValue: mailService },
        { provide: PrismaService, useValue: prismaService },
        { provide: AnalyticsEventService, useValue: analyticsEvents },
        { provide: MfaService, useValue: mfaService }
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
    referralSource: "ads",
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
      referralSource: ReferralSource.ADS,
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
    it("creates a PENDING student and issues no session", async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(null);
      prismaService.user.create.mockResolvedValueOnce({
        ...activeUser,
        status: UserStatus.PENDING
      });

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
      expect(createCall.data.status).toBe(UserStatus.PENDING);
      expect(createCall.data.studentProfile.create.referralSource).toBe(
        ReferralSource.ADS
      );

      expect(prismaService.authSession.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        email: "test@example.com",
        status: "PENDING_APPROVAL"
      });
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

    it("rejects a student whose registration is still pending", async () => {
      const password = "password123";
      prismaService.user.findUnique.mockResolvedValueOnce({
        ...activeUser,
        password: await hashSecret(password),
        status: UserStatus.PENDING
      });

      await expect(
        service.login({ email: activeUser.email, password }, {})
      ).rejects.toThrow("Your registration is awaiting admin approval.");
      expect(prismaService.authSession.create).not.toHaveBeenCalled();
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

      const result = asSession(
        await service.login({ email: "test@example.com", password, rememberMe: true }, {})
      );

      expect(result.user.id).toBe("usr-123");
      expect(result.accessToken).toBe("mocked-token");
      expect(result.refreshToken).toBe("mocked-token");
      expect(result.refreshTokenMaxAge).toBeGreaterThan(0);
      expect(analyticsEvents.record).toHaveBeenCalledWith("usr-123", "LOGIN");
    });

    it("stops at the second factor without creating a session", async () => {
      const password = "password123";
      prismaService.user.findUnique.mockResolvedValueOnce({
        ...activeUser,
        password: await hashSecret(password)
      });
      mfaService.loginChallenge.mockResolvedValueOnce({
        challengeToken: "challenge",
        mfaRequired: "VERIFY"
      });

      const result = await service.login({ email: activeUser.email, password }, {});

      expect(result).toEqual({ challengeToken: "challenge", kind: "mfa", mfaRequired: "VERIFY" });
      expect(prismaService.authSession.create).not.toHaveBeenCalled();
      expect(analyticsEvents.record).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    const REFRESH_TOKEN = "refresh-token";
    const liveSession = (overrides: Record<string, unknown> = {}) => ({
      expiresAt: new Date(Date.now() + 86_400_000),
      familyId: "fam-1",
      id: "sess-1",
      refreshTokenHash: hashRefreshToken(REFRESH_TOKEN),
      revokedAt: null,
      rotatedAt: null,
      user: { ...activeUser },
      ...overrides
    });

    beforeEach(() => {
      jwtService.verifyAsync.mockResolvedValue({
        sessionId: "sess-1",
        sub: "usr-123",
        type: "refresh"
      });
      jwtService.signAsync.mockResolvedValue("mocked-token");
      prismaService.authSession.create.mockResolvedValue({ id: "sess-2" });
      prismaService.authSession.update.mockResolvedValue({ id: "sess-2" });
      prismaService.authSession.updateMany.mockResolvedValue({ count: 1 });
    });

    it("rotates a live session into a successor in the same family", async () => {
      prismaService.authSession.findFirst.mockResolvedValueOnce(liveSession());

      const result = await service.refresh(REFRESH_TOKEN, {});

      expect(result.refreshToken).toBe("mocked-token");
      expect(prismaService.authSession.updateMany).toHaveBeenCalledWith({
        data: { rotatedAt: expect.any(Date) },
        where: { id: "sess-1", revokedAt: null, rotatedAt: null }
      });
      expect(prismaService.authSession.create.mock.calls[0][0].data.familyId).toBe("fam-1");
      expect(prismaService.authSession.update.mock.calls[0][0].data.refreshTokenHash).toBe(
        hashRefreshToken("mocked-token")
      );
    });

    it("re-issues within the grace window when the token was just rotated", async () => {
      prismaService.authSession.findFirst.mockResolvedValueOnce(
        liveSession({ rotatedAt: new Date(Date.now() - 5_000) })
      );

      const result = await service.refresh(REFRESH_TOKEN, {});

      expect(result.refreshToken).toBe("mocked-token");
      expect(prismaService.authSession.updateMany).not.toHaveBeenCalled();
      expect(prismaService.authSession.create).toHaveBeenCalledTimes(1);
    });

    it("treats a concurrent refresh that lost the rotation claim as within grace", async () => {
      prismaService.authSession.findFirst.mockResolvedValueOnce(liveSession());
      prismaService.authSession.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.refresh(REFRESH_TOKEN, {})).resolves.toBeDefined();
      expect(prismaService.authSession.create).toHaveBeenCalledTimes(1);
    });

    it("revokes the whole family when a rotated token is replayed after the grace window", async () => {
      prismaService.authSession.findFirst.mockResolvedValueOnce(
        liveSession({ rotatedAt: new Date(Date.now() - 60_000) })
      );

      await expect(service.refresh(REFRESH_TOKEN, {})).rejects.toThrow(UnauthorizedException);
      expect(prismaService.authSession.updateMany).toHaveBeenCalledWith({
        data: { revokedAt: expect.any(Date) },
        where: { OR: [{ id: "fam-1" }, { familyId: "fam-1" }], revokedAt: null }
      });
      expect(prismaService.authSession.create).not.toHaveBeenCalled();
    });

    it("never revives a revoked session, even moments after logout", async () => {
      prismaService.authSession.findFirst.mockResolvedValueOnce(
        liveSession({ revokedAt: new Date(Date.now() - 1_000) })
      );

      await expect(service.refresh(REFRESH_TOKEN, {})).rejects.toThrow(UnauthorizedException);
      expect(prismaService.authSession.create).not.toHaveBeenCalled();
    });

    it("rejects a token that does not match the stored hash", async () => {
      prismaService.authSession.findFirst.mockResolvedValueOnce(
        liveSession({ refreshTokenHash: hashRefreshToken("another-token") })
      );

      await expect(service.refresh(REFRESH_TOKEN, {})).rejects.toThrow(UnauthorizedException);
    });

    it("still accepts a session hashed with bcrypt before the sha256 switch", async () => {
      prismaService.authSession.findFirst.mockResolvedValueOnce(
        liveSession({ familyId: null, refreshTokenHash: await hashSecret(REFRESH_TOKEN) })
      );

      await expect(service.refresh(REFRESH_TOKEN, {})).resolves.toBeDefined();
      expect(prismaService.authSession.create.mock.calls[0][0].data.familyId).toBe("sess-1");
    });

    it("throws when there is no session", async () => {
      prismaService.authSession.findFirst.mockResolvedValueOnce(null);

      await expect(service.refresh(REFRESH_TOKEN, {})).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("registerCoach", () => {
    const registerCoachPayload: RegisterCoachRequest = {
      coachName: "Ada Coach",
      confirmPassword: "password123",
      contactNumber: "1234567890",
      email: "Coach@Example.com",
      password: "password123",
      title: "FM"
    };

    it("creates a PENDING application and issues no session", async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(null);
      prismaService.user.create.mockResolvedValueOnce({
        ...activeUser,
        email: "coach@example.com",
        role: UserRole.COACH,
        status: UserStatus.PENDING
      });

      const result = await service.registerCoach(registerCoachPayload, {});

      const createCall = prismaService.user.create.mock.calls[0][0];
      expect(createCall.data.status).toBe(UserStatus.PENDING);
      expect(createCall.data.coachProfile.create.approvalStatus).toBe(
        UserStatus.PENDING
      );

      // No session may be created — the coach cannot be logged in yet.
      expect(prismaService.authSession.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        email: "coach@example.com",
        status: "PENDING_APPROVAL"
      });
    });

    it("throws ConflictException if email is already in use", async () => {
      prismaService.user.findUnique.mockResolvedValueOnce({ id: "usr-123" });

      await expect(
        service.registerCoach(registerCoachPayload, {})
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("login (coach approval gate)", () => {
    const coachUser = (approvalStatus: UserStatus, status: UserStatus) => ({
      ...activeUser,
      coachProfile: { approvalStatus, isDeleted: false, title: "FM" },
      role: UserRole.COACH,
      status,
      studentProfile: null
    });

    it("rejects a coach whose application is still pending", async () => {
      const password = "password123";
      prismaService.user.findUnique.mockResolvedValueOnce({
        ...coachUser(UserStatus.PENDING, UserStatus.PENDING),
        password: await hashSecret(password)
      });

      await expect(
        service.login({ email: "test@example.com", password }, {})
      ).rejects.toThrow(UnauthorizedException);

      expect(prismaService.authSession.create).not.toHaveBeenCalled();
    });

    it("rejects a coach activated without an approved profile", async () => {
      const password = "password123";
      prismaService.user.findUnique.mockResolvedValueOnce({
        ...coachUser(UserStatus.PENDING, UserStatus.ACTIVE),
        password: await hashSecret(password)
      });

      await expect(
        service.login({ email: "test@example.com", password }, {})
      ).rejects.toThrow(UnauthorizedException);
    });

    it("lets an approved coach log in", async () => {
      const password = "password123";
      const approved = coachUser(UserStatus.ACTIVE, UserStatus.ACTIVE);

      prismaService.user.findUnique.mockResolvedValueOnce({
        ...approved,
        password: await hashSecret(password)
      });
      prismaService.user.update.mockResolvedValueOnce(approved);
      prismaService.authSession.create.mockResolvedValueOnce({ id: "sess-1" });
      prismaService.authSession.update.mockResolvedValueOnce({ id: "sess-1" });
      jwtService.signAsync.mockResolvedValue("mocked-token");

      const result = asSession(
        await service.login({ email: "test@example.com", password }, {})
      );

      expect(result.accessToken).toBe("mocked-token");
    });
  });

  describe("logout", () => {
    it("revokes the session's whole family", async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({
        sessionId: "sess-1",
        sub: "usr-123",
        type: "refresh"
      });

      prismaService.authSession.findFirst.mockResolvedValueOnce({ familyId: "fam-1", id: "sess-1" });

      const result = await service.logout("refresh-token");

      expect(prismaService.authSession.updateMany).toHaveBeenCalledWith({
        data: { revokedAt: expect.any(Date) },
        where: { OR: [{ id: "fam-1" }, { familyId: "fam-1" }], revokedAt: null }
      });
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
