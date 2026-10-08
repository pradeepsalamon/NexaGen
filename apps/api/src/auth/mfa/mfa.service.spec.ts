import { JwtService } from "@nestjs/jwt";
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { UserRole, type User } from "@prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import { deriveMfaKey, encryptSecret, hashRecoveryCode } from "./mfa-crypto";
import { MfaService, parseRequiredRoles } from "./mfa.service";
import { generateTotp, generateTotpSecret, totpStep } from "./totp";

const env = {
  JWT_ACCESS_SECRET: "access-secret-for-tests-only-000000",
  MFA_ENCRYPTION_KEY: "k".repeat(32) as string | undefined,
  MFA_REQUIRED_ROLES: "SUPER_ADMIN,ADMIN"
};
jest.mock("@nexa-chess/config/api", () => ({ getApiEnv: () => env }));

const KEY = deriveMfaKey("k".repeat(32));

describe("MfaService", () => {
  let prisma: {
    $transaction: jest.Mock;
    authSession: { updateMany: jest.Mock };
    user: { findUnique: jest.Mock };
    userMfa: {
      delete: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let service: MfaService;
  const admin = { email: "a@nexa.test", id: "u1", role: UserRole.ADMIN } as User;
  const coach = { email: "c@nexa.test", id: "u2", role: UserRole.COACH } as User;

  beforeEach(() => {
    env.MFA_ENCRYPTION_KEY = "k".repeat(32);
    prisma = {
      $transaction: jest.fn().mockResolvedValue([]),
      authSession: { updateMany: jest.fn() },
      user: { findUnique: jest.fn() },
      userMfa: {
        delete: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn()
      }
    };
    service = new MfaService(new JwtService({}), prisma as unknown as PrismaService);
  });

  it("parses required roles, ignoring unknown names", () => {
    expect([...parseRequiredRoles(" admin, SUPER_ADMIN ,nope")]).toEqual([
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN
    ]);
    expect(parseRequiredRoles("").size).toBe(0);
  });

  describe("loginChallenge", () => {
    it("forces SETUP for a required role with nothing enrolled", async () => {
      const challenge = await service.loginChallenge(admin, true);
      expect(challenge?.mfaRequired).toBe("SETUP");
      const payload = await service.verifyChallenge(challenge!.challengeToken, "SETUP");
      expect(payload).toMatchObject({ rememberMe: true, sub: "u1" });
    });

    it("asks to VERIFY when the user has it on, whatever the role", async () => {
      prisma.userMfa.findUnique.mockResolvedValue({ enabledAt: new Date() });
      expect((await service.loginChallenge(coach, false))?.mfaRequired).toBe("VERIFY");
    });

    it("lets an optional role without MFA straight through", async () => {
      expect(await service.loginChallenge(coach, false)).toBeNull();
    });

    it("is a no-op when the server has no encryption key", async () => {
      env.MFA_ENCRYPTION_KEY = undefined;
      service = new MfaService(new JwtService({}), prisma as unknown as PrismaService);
      expect(await service.loginChallenge(admin, false)).toBeNull();
      await expect(service.beginSetup(admin)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it("won't accept a challenge issued for the other purpose", async () => {
      const challenge = await service.loginChallenge(admin, false);
      await expect(
        service.verifyChallenge(challenge!.challengeToken, "VERIFY")
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("enable", () => {
    it("confirms the first code and returns ten recovery codes", async () => {
      const secret = generateTotpSecret();
      prisma.userMfa.findUnique.mockResolvedValue({
        enabledAt: null,
        secretEncrypted: encryptSecret(secret, KEY)
      });

      const codes = await service.enable("u1", generateTotp(secret, totpStep()));

      expect(codes).toHaveLength(10);
      expect(prisma.userMfa.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { enabledAt: null, userId: "u1" } })
      );
    });

    it("rejects a wrong first code", async () => {
      prisma.userMfa.findUnique.mockResolvedValue({
        enabledAt: null,
        secretEncrypted: encryptSecret(generateTotpSecret(), KEY)
      });
      await expect(service.enable("u1", "000000")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("verifyCode", () => {
    const secret = generateTotpSecret();
    const enabledRow = (overrides = {}) => ({
      enabledAt: new Date(),
      lastUsedStep: null,
      recoveryCodeHashes: [hashRecoveryCode("abcd-1234")],
      secretEncrypted: encryptSecret(secret, KEY),
      ...overrides
    });

    it("accepts a current code once; a replay loses the conditional write", async () => {
      prisma.userMfa.findUnique.mockResolvedValue(enabledRow());
      const code = generateTotp(secret, totpStep());

      await expect(service.verifyCode("u1", code)).resolves.toBeUndefined();

      prisma.userMfa.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.verifyCode("u1", code)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("consumes a recovery code", async () => {
      prisma.userMfa.findUnique.mockResolvedValue(enabledRow());

      await service.verifyCode("u1", "ABCD 1234");

      expect(prisma.userMfa.updateMany).toHaveBeenCalledWith({
        data: { recoveryCodeHashes: [] },
        where: { recoveryCodeHashes: { has: hashRecoveryCode("abcd-1234") }, userId: "u1" }
      });
    });

    it("rejects an unknown recovery code", async () => {
      prisma.userMfa.findUnique.mockResolvedValue(enabledRow());
      await expect(service.verifyCode("u1", "ffff-ffff")).rejects.toBeInstanceOf(
        BadRequestException
      );
    });
  });

  it("signs a required role out everywhere when they turn it off", async () => {
    const secret = generateTotpSecret();
    prisma.userMfa.findUnique.mockResolvedValue({
      enabledAt: new Date(),
      lastUsedStep: null,
      recoveryCodeHashes: [],
      secretEncrypted: encryptSecret(secret, KEY)
    });

    const result = await service.disable(admin, generateTotp(secret, totpStep()));

    expect(result).toEqual({ signedOut: true });
    expect(prisma.authSession.updateMany).toHaveBeenCalled();
  });
});
