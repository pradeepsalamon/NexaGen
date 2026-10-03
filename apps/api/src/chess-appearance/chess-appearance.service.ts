import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import {
  BOARD_THEME_CATALOG,
  chessAppearanceOverrideSchema,
  mergeChessAppearanceOverrides,
  PIECE_SET_CATALOG,
  resolveChessAppearance,
  SOUND_THEME_CATALOG,
  type ChessAppearanceAdminResponse,
  type ChessAppearanceCatalogResponse,
  type ChessAppearanceOverride,
  type ChessAppearanceResponse,
  type UpdateChessAppearanceAdminRequest,
  type UpdateChessAppearanceRequest,
} from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { authenticateUser } from "../auth/authenticate";

type AuthUser = { id: string; role: UserRole };

@Injectable()
export class ChessAppearanceService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // ── Auth (token-string pattern; no guards) ──

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private static isAdmin(role: UserRole) {
    return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  }

  private assertAdmin(user: AuthUser) {
    if (!ChessAppearanceService.isAdmin(user.role)) {
      throw new ForbiddenException("Only administrators can change the global board appearance.");
    }
  }

  // ── Admin global default (singleton, lazily created like LiveClassPolicy) ──

  private async getActiveSettingsRow() {
    let row = await this.prisma.chessAppearanceSettings.findFirst({ where: { isActive: true } });
    if (!row) {
      row = await this.prisma.chessAppearanceSettings.create({
        data: { name: "Default Chess Appearance Settings", isActive: true, settings: {} },
      });
    }
    return row;
  }

  private parseOverride(value: unknown): ChessAppearanceOverride | null {
    if (value === null || value === undefined) return null;
    const parsed = chessAppearanceOverrideSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  private toAdminResponse(row: {
    id: string;
    settings: unknown;
    disabledBoardThemeIds: string[];
    disabledPieceSetIds: string[];
    disabledSoundThemeIds: string[];
    locked: boolean;
    updatedAt: Date;
  }): ChessAppearanceAdminResponse {
    const settings = this.parseOverride(row.settings) ?? {};
    return {
      id: row.id,
      settings,
      resolved: resolveChessAppearance({ admin: settings }).config,
      disabledBoardThemeIds: row.disabledBoardThemeIds,
      disabledPieceSetIds: row.disabledPieceSetIds,
      disabledSoundThemeIds: row.disabledSoundThemeIds,
      locked: row.locked,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ── Resolved config (any authenticated role) ──

  async getResolvedAppearance(accessToken: string | undefined): Promise<ChessAppearanceResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const [settingsRow, preferenceRow] = await Promise.all([
      this.getActiveSettingsRow(),
      this.prisma.userChessAppearancePreference.findUnique({ where: { userId: user.id } }),
    ]);
    return resolveChessAppearance({
      admin: settingsRow.settings,
      user: preferenceRow?.settings,
      locked: settingsRow.locked,
    });
  }

  async getCatalog(accessToken: string | undefined): Promise<ChessAppearanceCatalogResponse> {
    await this.getAuthenticatedUser(accessToken);
    const settingsRow = await this.getActiveSettingsRow();
    const disabledBoardThemeIds = new Set(settingsRow.disabledBoardThemeIds);
    const disabledPieceSetIds = new Set(settingsRow.disabledPieceSetIds);
    const disabledSoundThemeIds = new Set(settingsRow.disabledSoundThemeIds);
    return {
      boardThemes: BOARD_THEME_CATALOG.filter((theme) => !disabledBoardThemeIds.has(theme.id)),
      pieceSets: PIECE_SET_CATALOG.filter((set) => !disabledPieceSetIds.has(set.id)),
      soundThemes: SOUND_THEME_CATALOG.filter((set) => !disabledSoundThemeIds.has(set.id)),
    };
  }

  // ── User's own preference ──

  /**
   * Merges `body.settings` onto the caller's existing stored override,
   * rather than replacing it wholesale — a single-field patch (e.g. a
   * keyboard-shortcut coordinate toggle) must not wipe out an unrelated
   * field the user set earlier. A settings-page save that submits every
   * field produces the same result either way.
   */
  async updateMyPreference(
    accessToken: string | undefined,
    body: UpdateChessAppearanceRequest,
  ): Promise<ChessAppearanceResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const settingsRow = await this.getActiveSettingsRow();
    if (settingsRow.locked) {
      throw new ForbiddenException(
        "Your administrator has locked board settings — you can't set a personal preference.",
      );
    }
    const existing = await this.prisma.userChessAppearancePreference.findUnique({
      where: { userId: user.id },
    });
    const nextOverride = mergeChessAppearanceOverrides(
      this.parseOverride(existing?.settings),
      body.settings,
    );
    await this.prisma.userChessAppearancePreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, settings: nextOverride },
      update: { settings: nextOverride },
    });
    return resolveChessAppearance({
      admin: settingsRow.settings,
      user: nextOverride,
      locked: settingsRow.locked,
    });
  }

  async resetMyPreference(accessToken: string | undefined): Promise<ChessAppearanceResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    await this.prisma.userChessAppearancePreference.deleteMany({ where: { userId: user.id } });
    const settingsRow = await this.getActiveSettingsRow();
    return resolveChessAppearance({ admin: settingsRow.settings, locked: settingsRow.locked });
  }

  // ── Admin global default ──

  async getGlobalSettings(accessToken: string | undefined): Promise<ChessAppearanceAdminResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);
    const row = await this.getActiveSettingsRow();
    return this.toAdminResponse(row);
  }

  async updateGlobalSettings(
    accessToken: string | undefined,
    body: UpdateChessAppearanceAdminRequest,
  ): Promise<ChessAppearanceAdminResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);
    const row = await this.getActiveSettingsRow();
    const nextOverride = mergeChessAppearanceOverrides(
      this.parseOverride(row.settings),
      body.settings,
    );
    const updated = await this.prisma.chessAppearanceSettings.update({
      where: { id: row.id },
      data: {
        settings: nextOverride,
        ...(body.disabledBoardThemeIds ? { disabledBoardThemeIds: body.disabledBoardThemeIds } : {}),
        ...(body.disabledPieceSetIds ? { disabledPieceSetIds: body.disabledPieceSetIds } : {}),
        ...(body.disabledSoundThemeIds ? { disabledSoundThemeIds: body.disabledSoundThemeIds } : {}),
        ...(body.locked !== undefined ? { locked: body.locked } : {}),
      },
    });
    return this.toAdminResponse(updated);
  }

  async resetGlobalSettings(accessToken: string | undefined): Promise<ChessAppearanceAdminResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);
    const row = await this.getActiveSettingsRow();
    const updated = await this.prisma.chessAppearanceSettings.update({
      where: { id: row.id },
      data: {
        settings: {},
        disabledBoardThemeIds: [],
        disabledPieceSetIds: [],
        disabledSoundThemeIds: [],
        locked: false,
      },
    });
    return this.toAdminResponse(updated);
  }
}
