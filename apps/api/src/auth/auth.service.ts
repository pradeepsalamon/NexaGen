import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ExperienceLevel,
  User,
  UserRole,
  UserStatus
} from "@prisma/client";
import type {
  AuthResponse,
  AuthUser,
  ForgotPasswordResponse,
  LoginRequest,
  LogoutResponse,
  RegisterRequest,
  ResetPasswordRequest
} from "@nexa-gen/types";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenPair
} from "./types";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashSecret,
  parseDurationMs,
  splitStudentName,
  verifySecret
} from "./auth.utils";

type SessionContext = {
  ipAddress?: string;
  userAgent?: string;
};

type JwtDuration = `${number}${"ms" | "s" | "m" | "h" | "d"}`;
type AuthResult = AuthResponse &
  TokenPair & {
    accessTokenMaxAge: number;
    refreshTokenMaxAge: number;
  };

const dummyPasswordHash =
  "$2b$12$7Hb149Y.levymTZlxpT3M.52k1w61HGHtm49NErn1svp4nVrPi9nO";

@Injectable()
export class AuthService {
  private readonly accessSecret =
    process.env.JWT_ACCESS_SECRET ?? "change-this-access-token-secret";
  private readonly refreshSecret =
    process.env.JWT_REFRESH_SECRET ?? "change-this-refresh-token-secret";
  private readonly accessTokenTtl = (process.env.JWT_ACCESS_TTL ??
    "15m") as JwtDuration;
  private readonly refreshTokenTtl = (process.env.JWT_REFRESH_TTL ??
    "7d") as JwtDuration;
  private readonly refreshTokenShortTtl = (process.env.JWT_REFRESH_SHORT_TTL ??
    "1d") as JwtDuration;
  private readonly accessTokenMaxAge = parseDurationMs(
    this.accessTokenTtl,
    15 * 60_000
  );
  private readonly refreshTokenMaxAge = parseDurationMs(
    this.refreshTokenTtl,
    7 * 86_400_000
  );
  private readonly refreshTokenShortMaxAge = parseDurationMs(
    this.refreshTokenShortTtl,
    86_400_000
  );
  private readonly loginResponseDelayMs = parseDurationMs(
    process.env.LOGIN_RESPONSE_DELAY ?? "500ms",
    500
  );
  private readonly passwordResetResponseDelayMs = parseDurationMs(
    process.env.PASSWORD_RESET_RESPONSE_DELAY ?? "5s",
    5_000
  );
  private readonly frontendUrl =
    process.env.FRONTEND_URL ??
    process.env.CORS_ORIGIN?.split(",")[0]?.trim() ??
    "http://localhost:3000";

  constructor(
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly prisma: PrismaService
  ) {}

  getCookieMaxAges() {
    return {
      accessToken: this.accessTokenMaxAge,
      refreshToken: this.refreshTokenMaxAge
    };
  }

  async register(
    payload: RegisterRequest,
    context: SessionContext
  ): Promise<AuthResult> {
    if (payload.password !== payload.confirmPassword) {
      throw new BadRequestException("Passwords must match.");
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() }
    });

    if (existingUser) {
      throw new ConflictException("An account already exists for this email.");
    }

    const studentAge = Number(payload.studentAge);

    if (!Number.isInteger(studentAge) || studentAge < 4) {
      throw new BadRequestException("Student age must be 4 or older.");
    }

    const { firstName, lastName } = splitStudentName(payload.studentName);
    const passwordHash = await hashSecret(payload.password);

    const user = await this.prisma.user.create({
      data: {
        email: payload.email.toLowerCase(),
        password: passwordHash,
        firstName,
        lastName,
        phoneNumber: payload.contactNumber,
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        timezone: "Asia/Kolkata",
        studentProfile: {
          create: {
            experienceLevel: this.toExperienceLevel(payload.experienceLevel),
            parentName: payload.parentName,
            parentPhone: payload.contactNumber
          }
        }
      }
    });

    const tokenPair = await this.createSession(
      user,
      context,
      this.refreshTokenShortMaxAge,
      this.refreshTokenShortTtl
    );

    return {
      ...tokenPair,
      accessTokenMaxAge: this.accessTokenMaxAge,
      refreshTokenMaxAge: this.refreshTokenShortMaxAge,
      user: this.toAuthUser(user)
    };
  }

  async login(
    payload: LoginRequest,
    context: SessionContext
  ): Promise<AuthResult> {
    const startedAt = Date.now();
    const user = await this.prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() }
    });
    const passwordMatches = await verifySecret(
      payload.password,
      user?.password ?? dummyPasswordHash
    );

    if (!user || !passwordMatches) {
      await this.waitForLoginResponseDelay(startedAt);
      throw new UnauthorizedException("Invalid email or password.");
    }

    if (user.status !== UserStatus.ACTIVE) {
      await this.waitForLoginResponseDelay(startedAt);
      throw new UnauthorizedException("This account is not active.");
    }

    await this.prisma.user.update({
      data: { lastLoginAt: new Date() },
      where: { id: user.id }
    });

    const refreshTokenMaxAge = payload.rememberMe
      ? this.refreshTokenMaxAge
      : this.refreshTokenShortMaxAge;
    const refreshTokenTtl = payload.rememberMe
      ? this.refreshTokenTtl
      : this.refreshTokenShortTtl;
    const tokenPair = await this.createSession(
      user,
      context,
      refreshTokenMaxAge,
      refreshTokenTtl
    );

    await this.waitForLoginResponseDelay(startedAt);

    return {
      ...tokenPair,
      accessTokenMaxAge: this.accessTokenMaxAge,
      refreshTokenMaxAge,
      user: this.toAuthUser(user)
    };
  }

  async refresh(
    refreshToken: string | undefined,
    context: SessionContext
  ): Promise<AuthResult> {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token is missing.");
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.authSession.findFirst({
      include: { user: true },
      where: {
        expiresAt: { gt: new Date() },
        id: payload.sessionId,
        revokedAt: null,
        userId: payload.sub
      }
    });

    if (!session) {
      throw new UnauthorizedException("Session expired.");
    }

    const refreshTokenMatches = await verifySecret(
      refreshToken,
      session.refreshTokenHash
    );

    if (!refreshTokenMatches) {
      await this.prisma.authSession.update({
        data: { revokedAt: new Date() },
        where: { id: session.id }
      });
      throw new UnauthorizedException("Invalid refresh token.");
    }

    await this.prisma.authSession.update({
      data: { revokedAt: new Date() },
      where: { id: session.id }
    });

    const refreshTokenMaxAge = Math.max(
      0,
      session.expiresAt.getTime() - Date.now()
    );
    const refreshTokenTtl = `${Math.max(
      1,
      Math.floor(refreshTokenMaxAge / 1_000)
    )}s` as JwtDuration;
    const tokenPair = await this.createSession(
      session.user,
      context,
      refreshTokenMaxAge,
      refreshTokenTtl
    );

    return {
      ...tokenPair,
      accessTokenMaxAge: this.accessTokenMaxAge,
      refreshTokenMaxAge,
      user: this.toAuthUser(session.user)
    };
  }

  async logout(refreshToken: string | undefined): Promise<LogoutResponse> {
    if (!refreshToken) {
      return { ok: true as const };
    }

    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      await this.prisma.authSession.updateMany({
        data: { revokedAt: new Date() },
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          revokedAt: null
        }
      });
    } catch {
      return { ok: true as const };
    }

    return { ok: true as const };
  }

  async me(accessToken: string | undefined): Promise<AuthResponse> {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }

    const payload = await this.verifyAccessToken(accessToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }

    return { user: this.toAuthUser(user) };
  }

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const startedAt = Date.now();
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      await this.waitForPasswordResetResponseDelay(startedAt);
      return { ok: true };
    }

    const resetToken = createOpaqueToken();

    await this.prisma.passwordResetToken.create({
      data: {
        expiresAt: new Date(Date.now() + 30 * 60_000),
        tokenHash: hashOpaqueToken(resetToken),
        userId: user.id
      }
    });

    const resetLink = new URL("/reset-password", this.frontendUrl);
    resetLink.searchParams.set("token", resetToken);

    await this.mailService.sendPasswordResetLink(
      user.email,
      resetLink.toString()
    );

    await this.waitForPasswordResetResponseDelay(startedAt);

    return { ok: true };
  }

  async resetPassword(payload: ResetPasswordRequest) {
    if (payload.password !== payload.confirmPassword) {
      throw new BadRequestException("Passwords must match.");
    }

    const token = await this.prisma.passwordResetToken.findFirst({
      include: { user: true },
      where: {
        expiresAt: { gt: new Date() },
        tokenHash: hashOpaqueToken(payload.token),
        usedAt: null
      }
    });

    if (!token) {
      throw new BadRequestException("Reset token is invalid or expired.");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        data: { password: await hashSecret(payload.password) },
        where: { id: token.userId }
      }),
      this.prisma.passwordResetToken.update({
        data: { usedAt: new Date() },
        where: { id: token.id }
      }),
      this.prisma.authSession.updateMany({
        data: { revokedAt: new Date() },
        where: { userId: token.userId, revokedAt: null }
      })
    ]);

    return { message: "Password reset successfully." };
  }

  private async createSession(
    user: User,
    context: SessionContext,
    refreshTokenMaxAge: number,
    refreshTokenTtl: JwtDuration
  ): Promise<TokenPair> {
    const session = await this.prisma.authSession.create({
      data: {
        expiresAt: new Date(Date.now() + refreshTokenMaxAge),
        refreshTokenHash: "",
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        userId: user.id
      }
    });

    const accessToken = await this.jwtService.signAsync(
      {
        email: user.email,
        role: user.role,
        sessionId: session.id,
        sub: user.id,
        type: "access"
      } satisfies AccessTokenPayload,
      {
        expiresIn: this.accessTokenTtl,
        secret: this.accessSecret
      }
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        sessionId: session.id,
        sub: user.id,
        type: "refresh"
      } satisfies RefreshTokenPayload,
      {
        expiresIn: refreshTokenTtl,
        secret: this.refreshSecret
      }
    );

    await this.prisma.authSession.update({
      data: { refreshTokenHash: await hashSecret(refreshToken) },
      where: { id: session.id }
    });

    return { accessToken, refreshToken };
  }

  private async verifyAccessToken(token: string) {
    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
      token,
      { secret: this.accessSecret }
    );

    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type.");
    }

    return payload;
  }

  private async verifyRefreshToken(token: string) {
    const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
      token,
      { secret: this.refreshSecret }
    );

    if (payload.type !== "refresh") {
      throw new UnauthorizedException("Invalid token type.");
    }

    return payload;
  }

  private toAuthUser(user: User): AuthUser {
    return {
      email: user.email,
      firstName: user.firstName,
      id: user.id,
      isEmailVerified: user.isEmailVerified,
      lastName: user.lastName,
      role: user.role,
      status: user.status
    };
  }

  private toExperienceLevel(level: RegisterRequest["experienceLevel"]) {
    const levels: Record<RegisterRequest["experienceLevel"], ExperienceLevel> =
      {
        advanced: ExperienceLevel.ADVANCED,
        beginner: ExperienceLevel.BEGINNER,
        intermediate: ExperienceLevel.INTERMEDIATE
      };

    return levels[level];
  }

  private async waitForPasswordResetResponseDelay(startedAt: number) {
    const remainingMs =
      this.passwordResetResponseDelayMs - (Date.now() - startedAt);

    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingMs));
    }
  }

  private async waitForLoginResponseDelay(startedAt: number) {
    const remainingMs = this.loginResponseDelayMs - (Date.now() - startedAt);

    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingMs));
    }
  }
}
