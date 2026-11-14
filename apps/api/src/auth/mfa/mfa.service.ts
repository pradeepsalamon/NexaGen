import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  MfaChallengeResponse,
  MfaSetupResponse,
  MfaStatusResponse
} from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { authenticateUser } from "../authenticate";
import {
  decryptSecret,
  deriveMfaKey,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode
} from "./mfa-crypto";
import { buildOtpauthUrl, generateTotpSecret, verifyTotp } from "./totp";

const CHALLENGE_TTL = "10m";
/** Wrong codes per account before the second factor locks. */
export const MFA_MAX_FAILED_ATTEMPTS = 5;
export const MFA_LOCKOUT_MS = 15 * 60_000;
const ISSUER = "Nexa Chess";

export type MfaChallengePurpose = MfaChallengeResponse["mfaRequired"];

export type MfaChallengePayload = {
  purpose: MfaChallengePurpose;
  rememberMe: boolean;
  sub: string;
  type: "mfa_challenge";
};

export function parseRequiredRoles(value: string): Set<UserRole> {
  const roles = Object.values(UserRole) as string[];
  return new Set(
    value
      .split(",")
      .map((role) => role.trim().toUpperCase())
      .filter((role): role is UserRole => roles.includes(role))
  );
}

@Injectable()
export class MfaService {
  private readonly env = getApiEnv();
  private readonly key = this.env.MFA_ENCRYPTION_KEY
    ? deriveMfaKey(this.env.MFA_ENCRYPTION_KEY)
    : null;
  private readonly requiredRoles = parseRequiredRoles(this.env.MFA_REQUIRED_ROLES);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  isAvailable() {
    return this.key !== null;
  }

  isRequired(role: UserRole) {
    return this.isAvailable() && this.requiredRoles.has(role);
  }

  /** Null when the password alone completes the login. */
  async loginChallenge(user: User, rememberMe: boolean): Promise<MfaChallengeResponse | null> {
    if (!this.isAvailable()) return null;
    const enabled = await this.isEnabled(user.id);
    if (!enabled && !this.isRequired(user.role)) return null;

    const purpose: MfaChallengePurpose = enabled ? "VERIFY" : "SETUP";
    const challengeToken = await this.jwtService.signAsync(
      { purpose, rememberMe, sub: user.id, type: "mfa_challenge" } satisfies MfaChallengePayload,
      { expiresIn: CHALLENGE_TTL, secret: this.env.JWT_ACCESS_SECRET }
    );
    return { challengeToken, mfaRequired: purpose };
  }

  async verifyChallenge(
    token: string,
    purpose: MfaChallengePurpose
  ): Promise<MfaChallengePayload> {
    let payload: MfaChallengePayload;
    try {
      payload = await this.jwtService.verifyAsync<MfaChallengePayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET
      });
    } catch {
      throw new UnauthorizedException("Your sign-in expired. Please log in again.");
    }
    if (payload.type !== "mfa_challenge" || payload.purpose !== purpose || !payload.sub) {
      throw new UnauthorizedException("Invalid sign-in challenge.");
    }
    return payload;
  }

  async status(user: User): Promise<MfaStatusResponse> {
    const row = await this.prisma.userMfa.findUnique({ where: { userId: user.id } });
    return {
      available: this.isAvailable(),
      enabled: Boolean(row?.enabledAt),
      recoveryCodesRemaining: row?.enabledAt ? row.recoveryCodeHashes.length : 0,
      required: this.isRequired(user.role)
    };
  }

  /** Issues (or re-issues) a pending secret; confirmed by `enable`. */
  async beginSetup(user: User): Promise<MfaSetupResponse> {
    const key = this.requireKey();
    if (await this.isEnabled(user.id)) {
      throw new ConflictException("Two-factor sign-in is already on.");
    }

    const secret = generateTotpSecret();
    const data = {
      enabledAt: null,
      lastUsedStep: null,
      recoveryCodeHashes: [],
      secretEncrypted: encryptSecret(secret, key)
    };
    await this.prisma.userMfa.upsert({
      create: { ...data, userId: user.id },
      update: data,
      where: { userId: user.id }
    });

    return { otpauthUrl: buildOtpauthUrl(secret, user.email, ISSUER), secret };
  }

  /** Confirms the first code and returns the recovery codes (shown once). */
  async enable(userId: string, code: string): Promise<string[]> {
    const key = this.requireKey();
    const row = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!row) throw new ConflictException("Start two-factor setup first.");
    if (row.enabledAt) throw new ConflictException("Two-factor sign-in is already on.");

    const step = verifyTotp(decryptSecret(row.secretEncrypted, key), code.trim());
    if (step === null) throw new BadRequestException("That code didn't match. Try the current one.");

    const recoveryCodes = generateRecoveryCodes();
    const { count } = await this.prisma.userMfa.updateMany({
      data: {
        enabledAt: new Date(),
        lastUsedStep: step,
        recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode)
      },
      where: { enabledAt: null, userId }
    });
    if (count === 0) throw new ConflictException("Two-factor sign-in is already on.");
    return recoveryCodes;
  }

  /** A current TOTP code or an unused recovery code. Throws 401 on anything else. */
  async verifyCode(userId: string, code: string): Promise<void> {
    const key = this.requireKey();
    const row = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!row?.enabledAt) throw new BadRequestException("Two-factor sign-in is not set up.");
    this.assertNotLocked(row.lockedUntil);

    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      const step = verifyTotp(decryptSecret(row.secretEncrypted, key), trimmed);
      if (step !== null) {
        // Conditional write: a replayed (or concurrently reused) code loses.
        const { count } = await this.prisma.userMfa.updateMany({
          data: { failedAttempts: 0, lastUsedStep: step },
          where: {
            OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
            userId
          }
        });
        if (count === 1) return;
      }
      await this.recordFailure(userId);
      throw new BadRequestException("That code didn't match or was already used.");
    }

    const hash = hashRecoveryCode(trimmed);
    if (row.recoveryCodeHashes.includes(hash)) {
      const { count } = await this.prisma.userMfa.updateMany({
        data: {
          failedAttempts: 0,
          recoveryCodeHashes: row.recoveryCodeHashes.filter((value) => value !== hash)
        },
        where: { recoveryCodeHashes: { has: hash }, userId }
      });
      if (count === 1) return;
    }
    await this.recordFailure(userId);
    throw new BadRequestException("That recovery code is invalid or already used.");
  }

  private assertNotLocked(lockedUntil: Date | null) {
    if (!lockedUntil || lockedUntil.getTime() <= Date.now()) return;
    const minutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000);
    throw new HttpException(
      `Too many wrong codes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      HttpStatus.TOO_MANY_REQUESTS
    );
  }

  /** Counts a wrong code against the account; the Nth one locks it. */
  private async recordFailure(userId: string) {
    const { failedAttempts } = await this.prisma.userMfa.update({
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
      where: { userId }
    });
    if (failedAttempts < MFA_MAX_FAILED_ATTEMPTS) return;

    await this.prisma.userMfa.update({
      data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + MFA_LOCKOUT_MS) },
      where: { userId }
    });
  }

  /**
   * Turning it off requires a code. For a role that must use MFA, every session
   * is revoked so the next sign-in goes straight back through setup.
   */
  async disable(user: User, code: string): Promise<{ signedOut: boolean }> {
    await this.verifyCode(user.id, code);
    const signedOut = this.isRequired(user.role);
    await this.prisma.$transaction([
      this.prisma.userMfa.delete({ where: { userId: user.id } }),
      ...(signedOut
        ? [
            this.prisma.authSession.updateMany({
              data: { revokedAt: new Date() },
              where: { revokedAt: null, userId: user.id }
            })
          ]
        : [])
    ]);
    return { signedOut };
  }

  /** The signed-in user (access cookie) or, during a login, the SETUP challenge's user. */
  async resolveEnrollingUser(
    accessToken: string | undefined,
    challengeToken: string | undefined
  ): Promise<{ challenge: MfaChallengePayload | null; user: User }> {
    if (challengeToken) {
      const challenge = await this.verifyChallenge(challengeToken, "SETUP");
      const user = await this.prisma.user.findUnique({ where: { id: challenge.sub } });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException("This account is not active.");
      }
      return { challenge, user };
    }
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    this.assertNotStudent(user);
    return { challenge: null, user };
  }

  getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  assertNotStudent(user: User) {
    if (user.role === UserRole.STUDENT) {
      throw new ForbiddenException("Two-factor sign-in is not available for student accounts.");
    }
  }

  private async isEnabled(userId: string) {
    const row = await this.prisma.userMfa.findUnique({
      select: { enabledAt: true },
      where: { userId }
    });
    return Boolean(row?.enabledAt);
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException("Two-factor sign-in is not configured on this server.");
    }
    return this.key;
  }
}
