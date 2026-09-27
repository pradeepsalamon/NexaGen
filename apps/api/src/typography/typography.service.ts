import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import {
  mergeTypographyOverrides,
  resolveTypography,
  typographyOverrideSchema,
  type TypographyAdminResponse,
  type TypographyOverride,
  type TypographyResponse,
  type UpdateTypographyAdminRequest,
  type UpdateTypographyRequest,
} from "@nexa-chess/types";
import { getApiEnv } from "@nexa-chess/config/api";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "../auth/types";

type AuthUser = { id: string; role: UserRole };

/** Fonts + text size: system default → admin global default → the user's own preference. */
@Injectable()
export class TypographyService {
  private readonly env = getApiEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private async getAuthenticatedUser(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
      if (payload.type !== "access") {
        throw new UnauthorizedException("Invalid token type.");
      }
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException("Invalid session.");
      }
      return user;
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }
  }

  private assertAdmin(user: AuthUser) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only administrators can change the platform fonts.");
    }
  }

  // Singleton, created lazily on first read.
  private async getSettingsRow() {
    const row = await this.prisma.typographySettings.findFirst({ orderBy: { createdAt: "asc" } });
    return row ?? this.prisma.typographySettings.create({ data: { settings: {} } });
  }

  private parseOverride(value: unknown): TypographyOverride | null {
    if (value === null || value === undefined) return null;
    const parsed = typographyOverrideSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  private toAdminResponse(row: {
    id: string;
    settings: unknown;
    locked: boolean;
    updatedAt: Date;
  }): TypographyAdminResponse {
    const settings = this.parseOverride(row.settings) ?? {};
    return {
      id: row.id,
      settings,
      resolved: resolveTypography({ admin: settings }).config,
      locked: row.locked,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getResolved(accessToken: string | undefined): Promise<TypographyResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const [settingsRow, preferenceRow] = await Promise.all([
      this.getSettingsRow(),
      this.prisma.userTypographyPreference.findUnique({ where: { userId: user.id } }),
    ]);
    return resolveTypography({
      admin: settingsRow.settings,
      user: preferenceRow?.settings,
      locked: settingsRow.locked,
    });
  }

  /** Merges onto the stored override, so a single-field save never wipes another field. */
  async updateMyPreference(
    accessToken: string | undefined,
    body: UpdateTypographyRequest,
  ): Promise<TypographyResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const settingsRow = await this.getSettingsRow();
    if (settingsRow.locked) {
      throw new ForbiddenException(
        "Your administrator has locked font settings, so a personal preference can't be saved.",
      );
    }
    const existing = await this.prisma.userTypographyPreference.findUnique({
      where: { userId: user.id },
    });
    const nextOverride = mergeTypographyOverrides(
      this.parseOverride(existing?.settings),
      body.settings,
    );
    await this.prisma.userTypographyPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, settings: nextOverride },
      update: { settings: nextOverride },
    });
    return resolveTypography({ admin: settingsRow.settings, user: nextOverride });
  }

  async resetMyPreference(accessToken: string | undefined): Promise<TypographyResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    await this.prisma.userTypographyPreference.deleteMany({ where: { userId: user.id } });
    const settingsRow = await this.getSettingsRow();
    return resolveTypography({ admin: settingsRow.settings, locked: settingsRow.locked });
  }

  async getGlobalSettings(accessToken: string | undefined): Promise<TypographyAdminResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);
    return this.toAdminResponse(await this.getSettingsRow());
  }

  async updateGlobalSettings(
    accessToken: string | undefined,
    body: UpdateTypographyAdminRequest,
  ): Promise<TypographyAdminResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);
    const row = await this.getSettingsRow();
    const updated = await this.prisma.typographySettings.update({
      where: { id: row.id },
      data: {
        settings: mergeTypographyOverrides(this.parseOverride(row.settings), body.settings),
        ...(body.locked !== undefined ? { locked: body.locked } : {}),
      },
    });
    return this.toAdminResponse(updated);
  }

  async resetGlobalSettings(accessToken: string | undefined): Promise<TypographyAdminResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);
    const row = await this.getSettingsRow();
    const updated = await this.prisma.typographySettings.update({
      where: { id: row.id },
      data: { settings: {}, locked: false },
    });
    return this.toAdminResponse(updated);
  }
}
