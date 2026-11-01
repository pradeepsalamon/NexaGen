import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  type HttpException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { RegisterCoachRequest, RegisterRequest } from "@nexa-chess/types";
import {
  ReferralSource,
  UserRole,
  UserStatus
} from "@prisma/client";
import { AuthService, LOGIN_MAX_FAILED_ATTEMPTS } from "./auth.service";
import { hashRefreshToken, hashSecret } from "./auth.utils";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import type { LoginOutcome } from "./auth.service";
import { MfaService } from "./mfa/mfa.service";
import { EmailVerificationService } from "../email-admin/email-verification.service";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";

type MockPrismaService = {
  authSession: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  coachProfile: {
    create: jest.Mock;
    update: jest.Mock;
  };
  emailVerificationToken: {
    updateMany: jest.Mock;
  };
  passwordResetToken: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  studentProfile: {
    create: jest.Mock;
    update: jest.Mock;
  };
  trashAuditLog: {
    create: jest.Mock;
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
  let mailService: {
    sendPasswordResetLink: jest.Mock;
    sendEmailChangedNotice: jest.Mock;
    sendParentContactChangedNotice: jest.Mock;
  };
  let prismaService: MockPrismaService;
  let analyticsEvents: { record: jest.Mock };
  let mfaService: { loginChallenge: jest.Mock };
  let emailVerification: {
    blocksSignIn: jest.Mock;
    policy: jest.Mock;
    sendLink: jest.Mock;
    sendLinkBestEffort: jest.Mock;
    sendLinkForRefusedSignIn: jest.Mock;
  };

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
    emailVerification = {
      blocksSignIn: jest.fn().mockResolvedValue(false),
      policy: jest.fn().mockResolvedValue("OFF"),
      sendLink: jest.fn().mockResolvedValue(undefined),
      sendLinkBestEffort: jest.fn().mockResolvedValue(true),
      sendLinkForRefusedSignIn: jest.fn().mockResolvedValue("sent")
    };

    mailService = {
      sendPasswordResetLink: jest.fn(),
      sendEmailChangedNotice: jest.fn().mockResolvedValue(undefined),
      sendParentContactChangedNotice: jest.fn().mockResolvedValue(undefined)
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
        findUnique: jest.fn(),
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
        update: jest.fn(),
        updateMany: jest.fn()
      },
      studentProfile: {
        create: jest.fn(),
        update: jest.fn()
      },
      emailVerificationToken: { updateMany: jest.fn() },
      trashAuditLog: { create: jest.fn().mockResolvedValue({}) },
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
        { provide: MfaService, useValue: mfaService },
        { provide: EmailVerificationService, useValue: emailVerification }
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

    it("counts as verified and mails nothing while verification is off", async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(null);
      prismaService.user.create.mockResolvedValueOnce({ ...activeUser, status: UserStatus.PENDING });

      await service.register(registerPayload, {});

      expect(prismaService.user.create.mock.calls[0][0].data.isEmailVerified).toBe(true);
      expect(emailVerification.sendLinkBestEffort).not.toHaveBeenCalled();
    });

    it("starts unverified and sends a link once verification is on", async () => {
      emailVerification.policy.mockResolvedValue("OPTIONAL");
      prismaService.user.findUnique.mockResolvedValueOnce(null);
      prismaService.user.create.mockResolvedValueOnce({ ...activeUser, status: UserStatus.PENDING });

      await service.register(registerPayload, {});

      expect(prismaService.user.create.mock.calls[0][0].data).toMatchObject({
        emailVerifiedAt: null,
        isEmailVerified: false
      });
      expect(emailVerification.sendLinkBestEffort).toHaveBeenCalledTimes(1);
    });
  });

  describe("email verification", () => {
    const signIn = async (link: "failed" | "recent" | "sent") => {
      const password = "password123";
      prismaService.user.findUnique.mockResolvedValueOnce({
        ...activeUser,
        failedLoginAttempts: 0,
        isEmailVerified: false,
        password: await hashSecret(password)
      });
      emailVerification.blocksSignIn.mockResolvedValue(true);
      emailVerification.sendLinkForRefusedSignIn.mockResolvedValue(link);
      return service.login({ email: activeUser.email, password }, {});
    };

    it("refuses an unverified sign-in before any session or second factor", async () => {
      await expect(signIn("sent")).rejects.toThrow("We have just sent you a new link.");
      expect(prismaService.authSession.create).not.toHaveBeenCalled();
      expect(mfaService.loginChallenge).not.toHaveBeenCalled();
    });

    it("says so when the new link could not be sent", async () => {
      await expect(signIn("failed")).rejects.toThrow("please contact the academy");
    });

    it("won't send a link while verification is off", async () => {
      jwtService.verifyAsync.mockResolvedValue({ sessionId: "sess-1", sub: "usr-123", type: "access" });
      prismaService.authSession.findUnique.mockResolvedValue({ revokedAt: null, userId: "usr-123" });
      prismaService.user.findUnique.mockResolvedValueOnce({ ...activeUser, isEmailVerified: false });

      await expect(service.resendVerificationEmail("access-token")).rejects.toThrow(
        "Email verification is turned off."
      );
      expect(emailVerification.sendLink).not.toHaveBeenCalled();
    });

    it("sends a real link while verification is on", async () => {
      emailVerification.policy.mockResolvedValue("REQUIRED");
      jwtService.verifyAsync.mockResolvedValue({ sessionId: "sess-1", sub: "usr-123", type: "access" });
      prismaService.authSession.findUnique.mockResolvedValue({ revokedAt: null, userId: "usr-123" });
      prismaService.user.findUnique.mockResolvedValueOnce({ ...activeUser, isEmailVerified: false });

      await service.resendVerificationEmail("access-token");

      expect(emailVerification.sendLink).toHaveBeenCalledTimes(1);
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

    describe("per-account lockout", () => {
      const password = "password123";

      it("counts a wrong password against the account", async () => {
        prismaService.user.findUnique.mockResolvedValueOnce({
          ...activeUser,
          password: await hashSecret(password)
        });
        prismaService.user.update.mockResolvedValueOnce({ failedLoginAttempts: 1 });

        await expect(
          service.login({ email: activeUser.email, password: "wrong" }, {})
        ).rejects.toThrow(UnauthorizedException);
        expect(prismaService.user.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { failedLoginAttempts: { increment: 1 } } })
        );
      });

      it("locks sign-in on the Nth wrong password", async () => {
        prismaService.user.findUnique.mockResolvedValueOnce({
          ...activeUser,
          password: await hashSecret(password)
        });
        prismaService.user.update.mockResolvedValueOnce({
          failedLoginAttempts: LOGIN_MAX_FAILED_ATTEMPTS
        });

        await expect(
          service.login({ email: activeUser.email, password: "wrong" }, {})
        ).rejects.toThrow(UnauthorizedException);
        expect(prismaService.user.update).toHaveBeenLastCalledWith({
          data: { failedLoginAttempts: 0, loginLockedUntil: expect.any(Date) },
          where: { id: "usr-123" }
        });
      });

      it("refuses even the right password while locked, without creating a session", async () => {
        prismaService.user.findUnique.mockResolvedValueOnce({
          ...activeUser,
          loginLockedUntil: new Date(Date.now() + 10 * 60_000),
          password: await hashSecret(password)
        });

        const error = (await service
          .login({ email: activeUser.email, password }, {})
          .catch((caught: unknown) => caught)) as HttpException;

        expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(prismaService.authSession.create).not.toHaveBeenCalled();
      });

      it("clears the count once the right password is given", async () => {
        prismaService.user.findUnique.mockResolvedValueOnce({
          ...activeUser,
          failedLoginAttempts: 3,
          password: await hashSecret(password)
        });
        mfaService.loginChallenge.mockResolvedValueOnce({ challengeToken: "c", mfaRequired: "VERIFY" });

        await service.login({ email: activeUser.email, password }, {});

        expect(prismaService.user.update).toHaveBeenCalledWith({
          data: { failedLoginAttempts: 0, loginLockedUntil: null },
          where: { id: "usr-123" }
        });
      });
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

    it("only looks up sessions of active, undeleted accounts", async () => {
      prismaService.authSession.findFirst.mockResolvedValueOnce(null);

      await expect(service.refresh(REFRESH_TOKEN, {})).rejects.toThrow(UnauthorizedException);
      expect(prismaService.authSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: { isDeleted: false, status: UserStatus.ACTIVE }
          })
        })
      );
      expect(prismaService.authSession.create).not.toHaveBeenCalled();
    });

    it("signs out a coach whose approval was withdrawn", async () => {
      prismaService.authSession.findFirst.mockResolvedValueOnce(
        liveSession({
          user: {
            ...activeUser,
            coachProfile: { approvalStatus: UserStatus.PENDING },
            role: UserRole.COACH
          }
        })
      );

      await expect(service.refresh(REFRESH_TOKEN, {})).rejects.toThrow(UnauthorizedException);
      expect(prismaService.authSession.create).not.toHaveBeenCalled();
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

  describe("updateProfile", () => {
    const profile = { email: "test@example.com", firstName: "John" };

    beforeEach(async () => {
      jwtService.verifyAsync.mockResolvedValue({ sessionId: "sess-1", sub: "usr-123", type: "access" });
      prismaService.user.findUnique
        .mockResolvedValueOnce({ ...activeUser, password: await hashSecret("password123") })
        .mockResolvedValue(null);
      prismaService.user.findUniqueOrThrow.mockImplementation(() =>
        Promise.resolve({ ...activeUser, email: "new@example.com" })
      );
      prismaService.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
        callback(prismaService)
      );
      prismaService.authSession.findFirst.mockResolvedValue({ familyId: "fam-1", id: "sess-1" });
      prismaService.authSession.findUnique.mockResolvedValue({ revokedAt: null, userId: "usr-123" });
      prismaService.authSession.updateMany.mockResolvedValue({ count: 2 });
      prismaService.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });
    });

    it("kills old links and asks to verify the new address once verification is on", async () => {
      emailVerification.policy.mockResolvedValue("REQUIRED");

      await service.updateProfile("access-token", {
        ...profile,
        currentPassword: "password123",
        email: "new@example.com"
      });

      expect(prismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ emailVerifiedAt: null, isEmailVerified: false }) })
      );
      expect(prismaService.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        data: { usedAt: expect.any(Date) },
        where: { usedAt: null, userId: "usr-123" }
      });
      expect(emailVerification.sendLinkBestEffort).toHaveBeenCalledTimes(1);
    });

    it("saves other fields without asking for the password when the email is unchanged", async () => {
      await service.updateProfile("access-token", { ...profile, email: "TEST@example.com" });

      expect(prismaService.user.update).toHaveBeenCalled();
      expect(prismaService.authSession.updateMany).not.toHaveBeenCalled();
      expect(mailService.sendEmailChangedNotice).not.toHaveBeenCalled();
    });

    it("refuses an email change without the current password", async () => {
      await expect(
        service.updateProfile("access-token", { ...profile, email: "new@example.com" })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });

    it("refuses an email change with the wrong password", async () => {
      await expect(
        service.updateProfile("access-token", {
          ...profile,
          currentPassword: "wrong-password",
          email: "new@example.com"
        })
      ).rejects.toThrow("Current password is incorrect.");
      expect(prismaService.user.update).not.toHaveBeenCalled();
    });

    it("changes the email, signs other devices out and tells the old address", async () => {
      await service.updateProfile("access-token", {
        ...profile,
        currentPassword: "password123",
        email: "new@example.com"
      });

      expect(prismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: "new@example.com" }) })
      );
      expect(prismaService.authSession.updateMany).toHaveBeenCalledWith({
        data: { revokedAt: expect.any(Date) },
        where: {
          userId: "usr-123",
          revokedAt: null,
          NOT: { OR: [{ id: "fam-1" }, { familyId: "fam-1" }] }
        }
      });
      expect(mailService.sendEmailChangedNotice).toHaveBeenCalledWith(
        "test@example.com",
        "new@example.com"
      );
    });

    // V7 (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md): the parent contact
    // is the billing/notice default, so moving it needs the password and the
    // previous contact is told.
    describe("parent contact", () => {
      const studentWithParent = {
        ...activeUser,
        password: "",
        studentProfile: { ...activeUser.studentProfile, parentEmail: "mum@example.com", parentPhone: "111" }
      };
      const keepRest = {
        experienceLevel: "BEGINNER" as const,
        parentName: "Jane Doe",
        referralSource: "ADS" as const
      };

      beforeEach(async () => {
        prismaService.user.findUnique.mockReset();
        prismaService.user.findUnique
          .mockResolvedValueOnce({ ...studentWithParent, password: await hashSecret("password123") })
          .mockResolvedValue(null);
      });

      it("refuses a parent-contact change without the current password", async () => {
        await expect(
          service.updateProfile("access-token", {
            ...profile,
            studentProfile: { ...keepRest, parentEmail: "attacker@example.com", parentPhone: "111" }
          })
        ).rejects.toThrow("Enter your current password to change the parent contact.");
        expect(prismaService.user.update).not.toHaveBeenCalled();
        expect(mailService.sendParentContactChangedNotice).not.toHaveBeenCalled();
      });

      it("refuses a phone-only change with the wrong password", async () => {
        await expect(
          service.updateProfile("access-token", {
            ...profile,
            currentPassword: "wrong-password",
            studentProfile: { ...keepRest, parentEmail: "mum@example.com", parentPhone: "999" }
          })
        ).rejects.toThrow("Current password is incorrect.");
        expect(prismaService.user.update).not.toHaveBeenCalled();
      });

      it("saves with the password, tells the previous contact and audits it", async () => {
        await service.updateProfile("access-token", {
          ...profile,
          currentPassword: "password123",
          studentProfile: { ...keepRest, parentEmail: "dad@example.com", parentPhone: "111" }
        });

        expect(prismaService.studentProfile.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ parentEmail: "dad@example.com" }) })
        );
        expect(mailService.sendParentContactChangedNotice).toHaveBeenCalledWith("mum@example.com", "John Doe");
        expect(prismaService.trashAuditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: "PARENT_CONTACT_CHANGE",
            entity: "StudentProfile",
            entityId: "usr-123",
            metadata: { changedEmail: true, changedPhone: false }
          })
        });
      });

      it("needs no password when the contact is unchanged (case and spacing ignored)", async () => {
        await service.updateProfile("access-token", {
          ...profile,
          studentProfile: { ...keepRest, parentEmail: "MUM@example.com ", parentPhone: " 111" }
        });

        expect(prismaService.studentProfile.update).toHaveBeenCalled();
        expect(mailService.sendParentContactChangedNotice).not.toHaveBeenCalled();
        expect(prismaService.trashAuditLog.create).not.toHaveBeenCalled();
      });
    });

    // V6: a coach must not set their own pay rate.
    it("ignores a coach's own hourlyRate", async () => {
      prismaService.user.findUnique.mockReset();
      prismaService.user.findUnique
        .mockResolvedValueOnce({
          ...activeUser,
          role: UserRole.COACH,
          studentProfile: null,
          coachProfile: { bio: null, hourlyRate: null, title: "NONE" }
        })
        .mockResolvedValue(null);

      await service.updateProfile("access-token", {
        ...profile,
        coachProfile: { bio: "GM-level coach", hourlyRate: "9999" }
      });

      const { data } = prismaService.coachProfile.update.mock.calls[0][0];
      expect(data.bio).toBe("GM-level coach");
      expect(data).not.toHaveProperty("hourlyRate");
    });

    describe("avatarUrl", () => {
      const original = process.env.CLOUDINARY_CLOUD_NAME;
      beforeEach(() => {
        process.env.CLOUDINARY_CLOUD_NAME = "nexa";
      });
      afterEach(() => {
        process.env.CLOUDINARY_CLOUD_NAME = original;
      });

      it("accepts an image uploaded to the profile folder", async () => {
        const avatarUrl = "https://res.cloudinary.com/nexa/image/upload/v1700000000/nexa_chess/profiles/abc.png";

        await service.updateProfile("access-token", { ...profile, avatarUrl });

        expect(prismaService.user.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ avatarUrl }) })
        );
      });

      it.each([
        "https://tracker.example.com/pixel.png",
        "https://res.cloudinary.com/other-cloud/image/upload/v1/nexa_chess/profiles/abc.png",
        "https://res.cloudinary.com/nexa/image/upload/v1/nexa_chess/pgns/abc.png",
        "http://res.cloudinary.com/nexa/image/upload/v1/nexa_chess/profiles/abc.png"
      ])("refuses %s", async (avatarUrl) => {
        await expect(
          service.updateProfile("access-token", { ...profile, avatarUrl })
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prismaService.user.update).not.toHaveBeenCalled();
      });
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

  describe("resetPassword", () => {
    const payload = { confirmPassword: "New@12345", password: "New@12345", token: "reset-token" };

    beforeEach(() => {
      prismaService.passwordResetToken.findFirst.mockResolvedValue({ id: "prt-1", userId: "usr-123" });
      prismaService.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
        callback(prismaService)
      );
    });

    it("claims the token, sets the password and revokes every session", async () => {
      prismaService.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });

      await service.resetPassword(payload);

      expect(prismaService.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "prt-1", usedAt: null } })
      );
      expect(prismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "usr-123" } })
      );
      expect(prismaService.authSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { revokedAt: null, userId: "usr-123" } })
      );
    });

    it("rejects a token another request already claimed", async () => {
      prismaService.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.resetPassword(payload)).rejects.toThrow(BadRequestException);
      expect(prismaService.user.update).not.toHaveBeenCalled();
      expect(prismaService.authSession.updateMany).not.toHaveBeenCalled();
    });
  });
});
