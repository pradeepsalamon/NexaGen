import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { hashOpaqueToken } from "../auth/auth.utils";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { EmailAdminService } from "./email-admin.service";
import { EmailVerificationService } from "./email-verification.service";

const person = (id: string, role: UserRole, overrides: Record<string, unknown> = {}) => ({
  email: `${id}@example.com`,
  firstName: id,
  id,
  isEmailVerified: false,
  lastName: null,
  role,
  status: UserStatus.ACTIVE,
  ...overrides
});

describe("email admin", () => {
  let prisma: {
    $transaction: jest.Mock;
    authSession: { findUnique: jest.Mock };
    directEmail: { count: jest.Mock; create: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    emailSettings: { findUnique: jest.Mock; upsert: jest.Mock };
    emailVerificationToken: { create: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
    user: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  };
  let mail: { isConfigured: jest.Mock; sendDirectEmail: jest.Mock; sendEmailVerificationLink: jest.Mock };
  let jwt: { verifyAsync: jest.Mock };
  let verification: EmailVerificationService;
  let service: EmailAdminService;

  // The caller is read first, by authenticateUser; the target second.
  const asCaller = (caller: ReturnType<typeof person>, target?: ReturnType<typeof person> | null) => {
    jwt.verifyAsync.mockResolvedValue({ sessionId: "s", sub: caller.id, type: "access" });
    prisma.authSession.findUnique.mockResolvedValue({ revokedAt: null, userId: caller.id });
    prisma.user.findUnique.mockReset();
    prisma.user.findUnique.mockResolvedValueOnce(caller);
    if (target !== undefined) prisma.user.findUnique.mockResolvedValueOnce(target);
  };
  const superAdmin = person("boss", UserRole.SUPER_ADMIN, { isEmailVerified: true });
  const admin = person("admin", UserRole.ADMIN, { isEmailVerified: true });

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
      authSession: { findUnique: jest.fn() },
      directEmail: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: "mail-1" }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({
            body: "Body",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            error: null,
            id: "mail-1",
            recipient: person("student", UserRole.STUDENT),
            sender: superAdmin,
            sentAt: null,
            status: "PENDING",
            subject: "Hello",
            toEmail: "student@example.com",
            ...data
          })
        )
      },
      emailSettings: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      emailVerificationToken: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      user: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 3 })
      }
    };
    mail = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendDirectEmail: jest.fn().mockResolvedValue(undefined),
      sendEmailVerificationLink: jest.fn().mockResolvedValue(undefined)
    };
    const prismaService = prisma as unknown as PrismaService;
    const mailService = mail as unknown as MailService;
    verification = new EmailVerificationService(mailService, prismaService);
    jwt = { verifyAsync: jest.fn() };
    service = new EmailAdminService(
      jwt as unknown as JwtService,
      mailService,
      prismaService,
      verification
    );
  });

  describe("EmailVerificationService", () => {
    it("treats no settings row as off", async () => {
      await expect(verification.policy()).resolves.toBe("OFF");
    });

    it.each([
      ["OFF", UserRole.STUDENT, false, false],
      ["OPTIONAL", UserRole.STUDENT, false, false],
      ["REQUIRED", UserRole.STUDENT, false, true],
      ["REQUIRED", UserRole.COACH, false, true],
      ["REQUIRED", UserRole.STUDENT, true, false],
      ["REQUIRED", UserRole.ADMIN, false, false],
      ["REQUIRED", UserRole.SUPER_ADMIN, false, false]
    ])("policy %s, role %s, verified %s: blocks sign-in = %s", async (policy, role, isEmailVerified, blocked) => {
      prisma.emailSettings.findUnique.mockResolvedValue({ verificationPolicy: policy });
      await expect(verification.blocksSignIn({ isEmailVerified, role })).resolves.toBe(blocked);
    });

    it("kills earlier links, stores only the hash and mails the raw token", async () => {
      await verification.sendLink({ email: "a@example.com", id: "u1" });

      expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        data: { usedAt: expect.any(Date) },
        where: { usedAt: null, userId: "u1" }
      });
      const [to, link] = mail.sendEmailVerificationLink.mock.calls[0] as [string, string];
      const token = new URL(link).searchParams.get("token") as string;
      expect(to).toBe("a@example.com");
      expect(new URL(link).pathname).toBe("/verify-email");
      expect(prisma.emailVerificationToken.create.mock.calls[0][0].data.tokenHash).toBe(hashOpaqueToken(token));
    });

    it("reuses a recent link when a refused sign-in is retried", async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue({ createdAt: new Date() });

      await expect(verification.sendLinkForRefusedSignIn({ email: "a@example.com", id: "u1" })).resolves.toBe("recent");
      expect(mail.sendEmailVerificationLink).not.toHaveBeenCalled();
    });

    it("sends again once the last link is old", async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 6 * 60_000) });

      await expect(verification.sendLinkForRefusedSignIn({ email: "a@example.com", id: "u1" })).resolves.toBe("sent");
    });

    it("reports a mail failure instead of throwing into the sign-in", async () => {
      mail.sendEmailVerificationLink.mockRejectedValue(new Error("smtp down"));

      await expect(verification.sendLinkForRefusedSignIn({ email: "a@example.com", id: "u1" })).resolves.toBe("failed");
    });
  });

  describe("access", () => {
    it.each([UserRole.STUDENT, UserRole.COACH])("refuses a %s", async (role) => {
      asCaller(person("someone", role));
      await expect(service.overview("token")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("stops a plain admin changing another admin's verification", async () => {
      asCaller(admin, person("other", UserRole.ADMIN));
      await expect(service.setVerified("token", "other", true)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("lets a plain admin change a student's verification", async () => {
      asCaller(admin, person("student", UserRole.STUDENT));
      await expect(service.setVerified("token", "student", true)).resolves.toEqual({ isEmailVerified: true });
    });
  });

  describe("setPolicy", () => {
    it("refuses to turn verification on without a mail server", async () => {
      asCaller(superAdmin);
      mail.isConfigured.mockReturnValue(false);
      await expect(service.setPolicy("token", "REQUIRED")).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.emailSettings.upsert).not.toHaveBeenCalled();
    });

    it("can always turn verification off", async () => {
      asCaller(superAdmin);
      mail.isConfigured.mockReturnValue(false);
      await expect(service.setPolicy("token", "OFF")).resolves.toEqual({ policy: "OFF" });
    });

    it("saves who changed it", async () => {
      asCaller(superAdmin);
      await service.setPolicy("token", "OPTIONAL");
      expect(prisma.emailSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { updatedById: "boss", verificationPolicy: "OPTIONAL" } })
      );
    });
  });

  describe("verification by staff", () => {
    it("stamps the time and retires outstanding links when marking verified", async () => {
      asCaller(superAdmin, person("student", UserRole.STUDENT));
      await service.setVerified("token", "student", true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        data: { emailVerifiedAt: expect.any(Date), isEmailVerified: true },
        where: { id: "student" }
      });
      expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalled();
    });

    it("clears the time when marking not verified", async () => {
      asCaller(superAdmin, person("student", UserRole.STUDENT, { isEmailVerified: true }));
      await service.setVerified("token", "student", false);
      expect(prisma.user.update).toHaveBeenCalledWith({
        data: { emailVerifiedAt: null, isEmailVerified: false },
        where: { id: "student" }
      });
    });

    it("won't send a link to someone already verified", async () => {
      asCaller(superAdmin, person("student", UserRole.STUDENT, { isEmailVerified: true }));
      await expect(service.sendVerificationLink("token", "student")).rejects.toBeInstanceOf(BadRequestException);
      expect(mail.sendEmailVerificationLink).not.toHaveBeenCalled();
    });

    it("turns a refused link into a 502, without the server's words", async () => {
      asCaller(superAdmin, person("student", UserRole.STUDENT));
      mail.sendEmailVerificationLink.mockRejectedValue(new Error("535 bad smtp password"));
      const error = await service.sendVerificationLink("token", "student").catch((e: Error) => e);
      expect(error).toBeInstanceOf(BadGatewayException);
      expect((error as Error).message).not.toContain("535");
    });

    it("verify-all only ever touches students and coaches", async () => {
      asCaller(superAdmin);
      await expect(service.verifyAll("token")).resolves.toEqual({ count: 3 });
      expect(prisma.user.updateMany.mock.calls[0][0].where.role).toEqual({ in: [UserRole.COACH, UserRole.STUDENT] });
    });
  });

  describe("sendDirectEmail", () => {
    const payload = { body: "Body", subject: "Hello" };

    it("logs before sending, then marks it sent", async () => {
      asCaller(superAdmin, person("student", UserRole.STUDENT));
      const order: string[] = [];
      prisma.directEmail.create.mockImplementation(() => {
        order.push("logged");
        return Promise.resolve({ id: "mail-1" });
      });
      mail.sendDirectEmail.mockImplementation(() => {
        order.push("sent");
        return Promise.resolve();
      });

      const result = await service.sendDirectEmail("token", "student", payload);

      expect(order).toEqual(["logged", "sent"]);
      expect(mail.sendDirectEmail).toHaveBeenCalledWith({ ...payload, to: "student@example.com" });
      expect(prisma.directEmail.create.mock.calls[0][0].data).toMatchObject({
        recipientId: "student",
        senderId: "boss",
        toEmail: "student@example.com"
      });
      expect(result).toMatchObject({ recipientName: "student", senderName: "boss", status: "SENT" });
    });

    it("records a failure and reports a 502", async () => {
      asCaller(superAdmin, person("student", UserRole.STUDENT));
      mail.sendDirectEmail.mockRejectedValue(new Error("smtp down"));

      await expect(service.sendDirectEmail("token", "student", payload)).rejects.toBeInstanceOf(BadGatewayException);
      expect(prisma.directEmail.update).toHaveBeenCalledWith({
        data: { error: "Error: smtp down", status: "FAILED" },
        where: { id: "mail-1" }
      });
    });

    it("logs nothing when there is no mail server", async () => {
      asCaller(superAdmin, person("student", UserRole.STUDENT));
      mail.isConfigured.mockReturnValue(false);

      await expect(service.sendDirectEmail("token", "student", payload)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.directEmail.create).not.toHaveBeenCalled();
    });

    it("404s for an unknown person", async () => {
      asCaller(superAdmin, null);
      await expect(service.sendDirectEmail("token", "missing", payload)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
