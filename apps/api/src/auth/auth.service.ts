import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  CoachProfile,
  CoachTitle,
  ExperienceLevel,
  ReferralSource,
  StudentProfile,
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
  RegisterCoachRequest,
  RegisterCoachResponse,
  ResetPasswordRequest,
  UpdateProfileRequest
} from "@nexa-chess/types";
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
type UserWithProfiles = User & {
  coachProfile?: CoachProfile | null;
  studentProfile?: StudentProfile | null;
};

const dummyPasswordHash =
  "$2b$12$7Hb149Y.levymTZlxpT3M.52k1w61HGHtm49NErn1svp4nVrPi9nO";

@Injectable()
export class AuthService {
  private readonly env = getApiEnv();
  private readonly accessSecret = this.env.JWT_ACCESS_SECRET;
  private readonly refreshSecret = this.env.JWT_REFRESH_SECRET;
  private readonly accessTokenTtl = this.env.JWT_ACCESS_TTL as JwtDuration;
  private readonly refreshTokenTtl = this.env.JWT_REFRESH_TTL as JwtDuration;
  private readonly refreshTokenShortTtl =
    this.env.JWT_REFRESH_SHORT_TTL as JwtDuration;
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
    this.env.LOGIN_RESPONSE_DELAY,
    500
  );
  private readonly passwordResetResponseDelayMs = parseDurationMs(
    this.env.PASSWORD_RESET_RESPONSE_DELAY,
    5_000
  );
  private readonly frontendUrl = getFrontendUrl(this.env);
  /**
   * Grace window after a refresh token is rotated during which the *previous*
   * token is still honoured. Without it, two tabs (or a retried request)
   * refreshing at the same instant race: the first rotates and revokes the
   * session, the second presents the now-revoked token and gets logged out —
   * and because the response also clears cookies, both tabs drop. Re-issuing a
   * fresh session for a token revoked <30s ago keeps concurrent tabs alive
   * while still catching genuine token reuse outside the window.
   */
  private readonly refreshRotationGraceMs = 30_000;

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

    // `withDeleted` bypasses the soft-delete filter. The unique constraint on
    // users.email covers deleted rows too, so a filtered read would miss the
    // conflict and the insert would fail with P2002 -> unhandled 500.
    const existingUser = await this.prisma.withDeleted.user.findUnique({
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
      include: { coachProfile: true, studentProfile: true },
      data: {
        email: payload.email.toLowerCase(),
        password: passwordHash,
        firstName,
        lastName,
        phoneNumber: payload.contactNumber,
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        timezone: "Asia/Kolkata",
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        studentProfile: {
          create: {
            referralSource: this.toReferralSource(payload.referralSource),
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

  
  /**
   * Coach self-registration is an *application*, not a sign-up: the account is
   * created PENDING and no session is issued. An admin must approve it from the
   * Pending Coaches screen before the coach can log in (AUDIT H9).
   */
  async registerCoach(
    payload: RegisterCoachRequest,
    _context: SessionContext
  ): Promise<RegisterCoachResponse> {
    if (payload.password !== payload.confirmPassword) {
      throw new BadRequestException("Passwords must match.");
    }

    // See register(): must include soft-deleted rows, the unique index does.
    const existingUser = await this.prisma.withDeleted.user.findUnique({
      where: { email: payload.email.toLowerCase() }
    });

    if (existingUser) {
      throw new ConflictException("An account already exists for this email.");
    }

    const { firstName, lastName } = splitStudentName(payload.coachName);
    const passwordHash = await hashSecret(payload.password);

    const user = await this.prisma.user.create({
      include: { coachProfile: true, studentProfile: true },
      data: {
        email: payload.email.toLowerCase(),
        password: passwordHash,
        firstName,
        lastName,
        phoneNumber: payload.contactNumber,
        role: UserRole.COACH,
        status: UserStatus.PENDING,
        timezone: "Asia/Kolkata",
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        coachProfile: {
          create: {
            approvalStatus: UserStatus.PENDING,
            title: this.toCoachTitle(payload.title),
            fideId: this.toNullableString(payload.fideId),
            fideRating: payload.fideRating ?? null,
            yearsOfExperience: payload.yearsOfExperience ?? null
          }
        }
      }
    });

    /* Temporarily disabled email verification
    const verificationToken = createOpaqueToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000), // 24 hours
        tokenHash: hashOpaqueToken(verificationToken),
        userId: user.id
      }
    });
    const verifyLink = new URL("/verify-email", this.frontendUrl);
    verifyLink.searchParams.set("token", verificationToken);
    await this.mailService.sendEmailVerificationLink(user.email, verifyLink.toString()); 
    */

    return {
      email: user.email,
      status: "PENDING_APPROVAL"
    };
  }

  async login(
    payload: LoginRequest,
    context: SessionContext
  ): Promise<AuthResult> {
    const startedAt = Date.now();
    const user = await this.prisma.user.findUnique({
      include: { coachProfile: true, studentProfile: true },
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

    // A coach is only usable once an admin has approved the application; check
    // both the account status and the profile's approval flag so an account
    // flipped ACTIVE by another path still cannot teach (AUDIT H9).
    const isUnapprovedCoach =
      user.role === UserRole.COACH &&
      user.coachProfile?.approvalStatus !== UserStatus.ACTIVE;

    if (isUnapprovedCoach) {
      await this.waitForLoginResponseDelay(startedAt);
      throw new UnauthorizedException(
        "Your coach application is awaiting admin approval."
      );
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
    const sessionInclude = {
      user: { include: { coachProfile: true, studentProfile: true } }
    } as const;

    let session = await this.prisma.authSession.findFirst({
      include: sessionInclude,
      where: {
        expiresAt: { gt: new Date() },
        id: payload.sessionId,
        revokedAt: null,
        userId: payload.sub,
        user: { isDeleted: false }
      }
    });

    // No live session for this token. If it was rotated moments ago (a
    // concurrent refresh from another tab), honour it within the grace window
    // instead of logging every tab out. The session is already revoked, so
    // don't revoke it again below.
    let alreadyRevoked = false;
    if (!session) {
      session = await this.prisma.authSession.findFirst({
        include: sessionInclude,
        where: {
          expiresAt: { gt: new Date() },
          id: payload.sessionId,
          revokedAt: {
            gt: new Date(Date.now() - this.refreshRotationGraceMs)
          },
          userId: payload.sub,
          user: { isDeleted: false }
        }
      });
      if (session) {
        alreadyRevoked = true;
      }
    }

    if (!session) {
      throw new UnauthorizedException("Session expired.");
    }

    const refreshTokenMatches = await verifySecret(
      refreshToken,
      session.refreshTokenHash
    );

    if (!refreshTokenMatches) {
      if (!alreadyRevoked) {
        await this.prisma.authSession.update({
          data: { revokedAt: new Date() },
          where: { id: session.id }
        });
      }
      throw new UnauthorizedException("Invalid refresh token.");
    }

    if (!alreadyRevoked) {
      await this.prisma.authSession.update({
        data: { revokedAt: new Date() },
        where: { id: session.id }
      });
    }

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
      include: { coachProfile: true, studentProfile: true },
      where: { id: payload.sub }
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }

    return { user: this.toAuthUser(user) };
  }

  async updateProfile(
    accessToken: string | undefined,
    payload: UpdateProfileRequest
  ): Promise<AuthResponse> {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }

    const tokenPayload = await this.verifyAccessToken(accessToken);
    const user = await this.prisma.user.findUnique({
      include: { coachProfile: true, studentProfile: true },
      where: { id: tokenPayload.sub }
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }

    const email = payload.email.toLowerCase().trim();
    const username = this.toNullableString(payload.username);

    await this.assertUniqueProfileIdentity(user.id, email, username);

    const updatedUser = await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        data: {
          avatarUrl: this.toNullableString(payload.avatarUrl),
          email,
          firstName: payload.firstName.trim(),
          lastName: this.toNullableString(payload.lastName),
          phoneNumber: this.toNullableString(payload.phoneNumber),
          timezone: payload.timezone?.trim() || user.timezone,
          username
        },
        where: { id: user.id }
      });

      if (user.studentProfile && payload.studentProfile) {
        await transaction.studentProfile.update({
          data: {
            chessRating: payload.studentProfile.chessRating ?? null,
            dateOfBirth: this.toNullableDate(payload.studentProfile.dateOfBirth),
            experienceLevel: payload.studentProfile.experienceLevel
              ? this.toPrismaExperienceLevel(payload.studentProfile.experienceLevel)
              : user.studentProfile.experienceLevel,
            referralSource: payload.studentProfile.referralSource
              ? this.toPrismaReferralSource(payload.studentProfile.referralSource)
              : user.studentProfile.referralSource,
            fideId: this.toNullableString(payload.studentProfile.fideId),
            parentEmail: this.toNullableString(payload.studentProfile.parentEmail),
            parentName:
              payload.studentProfile.parentName?.trim() ||
              user.studentProfile.parentName,
            parentPhone: this.toNullableString(payload.studentProfile.parentPhone),
            parentRelationship: this.toNullableString(
              payload.studentProfile.parentRelationship
            )
          },
          where: { userId: user.id }
        });
      }

      if (user.coachProfile && payload.coachProfile) {
        await transaction.coachProfile.update({
          data: {
            bio: this.toNullableString(payload.coachProfile.bio),
            fideId: this.toNullableString(payload.coachProfile.fideId),
            fideRating: payload.coachProfile.fideRating ?? null,
            hourlyRate: this.toNullableString(payload.coachProfile.hourlyRate),
            qualification: this.toNullableString(
              payload.coachProfile.qualification
            ),
            specialization: this.toNullableString(
              payload.coachProfile.specialization
            ),
            title: payload.coachProfile.title
              ? this.toCoachTitle(payload.coachProfile.title)
              : user.coachProfile.title,
            yearsOfExperience: payload.coachProfile.yearsOfExperience ?? null
          },
          where: { userId: user.id }
        });
      }

      return transaction.user.findUniqueOrThrow({
        include: { coachProfile: true, studentProfile: true },
        where: { id: user.id }
      });
    });

    return { user: this.toAuthUser(updatedUser) };
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

  
  async verifyEmail(token: string) {
    const verification = await this.prisma.emailVerificationToken.findFirst({
      include: { user: true },
      where: {
        expiresAt: { gt: new Date() },
        tokenHash: hashOpaqueToken(token),
        usedAt: null,
        user: { isDeleted: false }
      }
    });

    if (!verification) {
      throw new BadRequestException("Verification token is invalid or expired.");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        data: { isEmailVerified: true, emailVerifiedAt: new Date() },
        where: { id: verification.userId }
      }),
      this.prisma.emailVerificationToken.update({
        data: { usedAt: new Date() },
        where: { id: verification.id }
      })
    ]);

    return { message: "Email verified successfully." };
  }

  async resendVerificationEmail(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }

    const payload = await this.verifyAccessToken(accessToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    });

    // We allow resending even if status is PENDING
    if (!user || user.isEmailVerified) {
      throw new BadRequestException("Invalid request or email is already verified.");
    }

    /* Temporarily disabled email verification
    const verificationToken = createOpaqueToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000), // 24 hours
        tokenHash: hashOpaqueToken(verificationToken),
        userId: user.id
      }
    });
    const verifyLink = new URL("/verify-email", this.frontendUrl);
    verifyLink.searchParams.set("token", verificationToken);
    await this.mailService.sendEmailVerificationLink(user.email, verifyLink.toString()); 
    */

    return { message: "Verification email sent." };
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
        usedAt: null,
        user: { isDeleted: false }
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

  private toAuthUser(user: UserWithProfiles): AuthUser {
    return {
      avatarUrl: user.avatarUrl,
      coachProfile: user.coachProfile && !user.coachProfile.isDeleted
        ? {
            bio: user.coachProfile.bio,
            fideId: user.coachProfile.fideId,
            fideRating: user.coachProfile.fideRating,
            hourlyRate: user.coachProfile.hourlyRate?.toString() ?? null,
            qualification: user.coachProfile.qualification,
            specialization: user.coachProfile.specialization,
            title: user.coachProfile.title,
            yearsOfExperience: user.coachProfile.yearsOfExperience
          }
        : null,
      email: user.email,
      firstName: user.firstName,
      id: user.id,
      isEmailVerified: user.isEmailVerified,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      studentProfile: user.studentProfile && !user.studentProfile.isDeleted
        ? {
            chessRating: user.studentProfile.chessRating,
            dateOfBirth: user.studentProfile.dateOfBirth?.toISOString() ?? null,
            experienceLevel: user.studentProfile.experienceLevel,
            referralSource: user.studentProfile.referralSource,
            fideId: user.studentProfile.fideId,
            parentEmail: user.studentProfile.parentEmail,
            parentName: user.studentProfile.parentName,
            parentPhone: user.studentProfile.parentPhone,
            parentRelationship: user.studentProfile.parentRelationship
          }
        : null,
      timezone: user.timezone,
      username: user.username
    };
  }

  private async assertUniqueProfileIdentity(
    userId: string,
    email: string,
    username: string | null
  ) {
    // Must include soft-deleted rows — the unique indexes on email/username
    // span them, so a filtered read would let the update fail with P2002.
    const [existingEmailUser, existingUsernameUser] = await Promise.all([
      this.prisma.withDeleted.user.findUnique({ where: { email } }),
      username
        ? this.prisma.withDeleted.user.findUnique({ where: { username } })
        : null
    ]);

    if (existingEmailUser && existingEmailUser.id !== userId) {
      throw new ConflictException("An account already exists for this email.");
    }

    if (existingUsernameUser && existingUsernameUser.id !== userId) {
      throw new ConflictException("This username is already taken.");
    }
  }

  private toNullableString(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private toNullableDate(value: string | undefined) {
    const trimmed = value?.trim();

    if (!trimmed) {
      return null;
    }

    const date = new Date(trimmed);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Date of birth is invalid.");
    }

    return date;
  }

  private toCoachTitle(title: UpdateProfileRequest["coachProfile"] extends infer T
    ? T extends { title?: infer U }
      ? U
      : never
    : never) {
    const titles: Record<string, CoachTitle> = {
      CM: CoachTitle.CM,
      FM: CoachTitle.FM,
      GM: CoachTitle.GM,
      IM: CoachTitle.IM,
      NONE: CoachTitle.NONE
    };

    return titles[title as string] ?? CoachTitle.NONE;
  }

  private toPrismaReferralSource(
    source: UpdateProfileRequest["studentProfile"] extends infer T
      ? T extends { referralSource?: infer U }
        ? NonNullable<U>
        : never
      : never
  ) {
    const sources: Record<string, ReferralSource> = {
      ADS: ReferralSource.ADS,
      FRIEND: ReferralSource.FRIEND,
      SCHOOL: ReferralSource.SCHOOL,
      OTHER: ReferralSource.OTHER
    };

    return sources[source as string] ?? ReferralSource.OTHER;
  }

  private toPrismaExperienceLevel(
    level: UpdateProfileRequest["studentProfile"] extends infer T
      ? T extends { experienceLevel?: infer U }
        ? NonNullable<U>
        : never
      : never
  ) {
    const levels: Record<string, ExperienceLevel> = {
      BEGINNER: ExperienceLevel.BEGINNER,
      INTERMEDIATE: ExperienceLevel.INTERMEDIATE,
      ADVANCED: ExperienceLevel.ADVANCED
    };

    return levels[level as string] ?? ExperienceLevel.BEGINNER;
  }

  private toReferralSource(source: RegisterRequest["referralSource"]) {
    const sources: Record<RegisterRequest["referralSource"], ReferralSource> =
      {
        ads: ReferralSource.ADS,
        friend: ReferralSource.FRIEND,
        school: ReferralSource.SCHOOL,
        other: ReferralSource.OTHER
      };

    return sources[source];
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
