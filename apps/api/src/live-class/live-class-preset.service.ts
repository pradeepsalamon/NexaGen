import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import {
  liveClassSettingsOverrideSchema,
  type CreateLiveClassPresetRequest,
  type LiveClassPreset,
  type LiveClassPresetsResponse,
  type UpdateLiveClassPresetRequest,
} from "@nexa-chess/types";
import { getApiEnv } from "@nexa-chess/config/api";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "../auth/types";

type AuthUser = { id: string; role: UserRole };

/** The client handed to a `prisma.$transaction(async (tx) => …)` callback. */
type PrismaTx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

type PresetRow = Prisma.LiveClassPresetGetPayload<{
  include: { owner: { select: { firstName: true; lastName: true } } };
}>;

@Injectable()
export class LiveClassPresetService {
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

  private static isAdmin(role: UserRole) {
    return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  }

  private static canManage(user: AuthUser, preset: { ownerId: string | null; scope: string }) {
    if (preset.scope === "ORG") return LiveClassPresetService.isAdmin(user.role);
    return preset.ownerId === user.id;
  }

  private static toResponse(user: AuthUser, row: PresetRow): LiveClassPreset {
    const parsed = liveClassSettingsOverrideSchema.safeParse(row.settings);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      scope: row.scope,
      isSystem: row.isSystem,
      isDefault: row.isDefault,
      settings: parsed.success ? parsed.data : {},
      ownerId: row.ownerId,
      ownerName: row.owner
        ? [row.owner.firstName, row.owner.lastName].filter(Boolean).join(" ").trim() || null
        : null,
      // Whether the caller may edit / set-default. System presets add a
      // separate "not deletable" rule the UI enforces via `isSystem`.
      canManage: LiveClassPresetService.canManage(user, row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(accessToken: string | undefined): Promise<LiveClassPresetsResponse> {
    const user = await this.getAuthenticatedUser(accessToken);

    const where: Prisma.LiveClassPresetWhereInput = LiveClassPresetService.isAdmin(user.role)
      ? {}
      : { OR: [{ scope: "ORG" }, { ownerId: user.id }] };

    const rows = await this.prisma.liveClassPreset.findMany({
      where,
      include: { owner: { select: { firstName: true, lastName: true } } },
      orderBy: [{ isSystem: "desc" }, { scope: "asc" }, { name: "asc" }],
    });

    return { presets: rows.map((row) => LiveClassPresetService.toResponse(user, row)) };
  }

  async create(
    accessToken: string | undefined,
    body: CreateLiveClassPresetRequest,
  ): Promise<LiveClassPreset> {
    const user = await this.getAuthenticatedUser(accessToken);

    if (body.scope === "ORG" && !LiveClassPresetService.isAdmin(user.role)) {
      throw new ForbiddenException("Only administrators can create organisation presets.");
    }
    if (user.role === UserRole.STUDENT) {
      throw new ForbiddenException("Students cannot create presets.");
    }

    const ownerId = body.scope === "ORG" ? null : user.id;

    const row = await this.prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await LiveClassPresetService.clearDefault(tx, body.scope, ownerId);
      }
      return tx.liveClassPreset.create({
        data: {
          ownerId,
          name: body.name.trim(),
          description: body.description?.trim() || null,
          scope: body.scope,
          isSystem: false,
          isDefault: !!body.isDefault,
          settings: body.settings as never,
        },
        include: { owner: { select: { firstName: true, lastName: true } } },
      });
    });

    return LiveClassPresetService.toResponse(user, row);
  }

  async update(
    accessToken: string | undefined,
    id: string,
    body: UpdateLiveClassPresetRequest,
  ): Promise<LiveClassPreset> {
    const user = await this.getAuthenticatedUser(accessToken);
    const existing = await this.prisma.liveClassPreset.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Preset not found.");
    }
    if (!LiveClassPresetService.canManage(user, existing)) {
      throw new ForbiddenException("You cannot edit this preset.");
    }
    if (existing.isSystem && !LiveClassPresetService.isAdmin(user.role)) {
      throw new ForbiddenException("System presets cannot be edited.");
    }
    if (body.scope && body.scope !== existing.scope) {
      throw new BadRequestException("A preset's scope cannot be changed.");
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await LiveClassPresetService.clearDefault(tx, existing.scope, existing.ownerId, id);
      }
      return tx.liveClassPreset.update({
        where: { id },
        data: {
          name: body.name?.trim(),
          description: body.description === undefined ? undefined : body.description?.trim() || null,
          isDefault: body.isDefault,
          settings: body.settings === undefined ? undefined : (body.settings as never),
        },
        include: { owner: { select: { firstName: true, lastName: true } } },
      });
    });

    return LiveClassPresetService.toResponse(user, row);
  }

  async remove(accessToken: string | undefined, id: string): Promise<{ success: true }> {
    const user = await this.getAuthenticatedUser(accessToken);
    const existing = await this.prisma.liveClassPreset.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Preset not found.");
    }
    if (existing.isSystem) {
      throw new ForbiddenException("System presets cannot be deleted.");
    }
    if (!LiveClassPresetService.canManage(user, existing)) {
      throw new ForbiddenException("You cannot delete this preset.");
    }
    await this.prisma.liveClassPreset.delete({ where: { id } });
    return { success: true };
  }

  async duplicate(accessToken: string | undefined, id: string): Promise<LiveClassPreset> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role === UserRole.STUDENT) {
      throw new ForbiddenException("Students cannot create presets.");
    }
    const source = await this.prisma.liveClassPreset.findUnique({ where: { id } });
    if (!source) {
      throw new NotFoundException("Preset not found.");
    }
    const visible = source.scope === "ORG" || source.isSystem || source.ownerId === user.id;
    if (!visible) {
      throw new ForbiddenException("You cannot use this preset.");
    }

    const row = await this.prisma.liveClassPreset.create({
      data: {
        ownerId: user.id,
        name: `${source.name} (copy)`.slice(0, 80),
        description: source.description,
        scope: "PERSONAL",
        isSystem: false,
        isDefault: false,
        settings: source.settings as never,
      },
      include: { owner: { select: { firstName: true, lastName: true } } },
    });
    return LiveClassPresetService.toResponse(user, row);
  }

  async setDefault(accessToken: string | undefined, id: string): Promise<LiveClassPreset> {
    const user = await this.getAuthenticatedUser(accessToken);
    const existing = await this.prisma.liveClassPreset.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Preset not found.");
    }
    if (!LiveClassPresetService.canManage(user, existing)) {
      throw new ForbiddenException("You cannot set this preset as default.");
    }

    const row = await this.prisma.$transaction(async (tx) => {
      await LiveClassPresetService.clearDefault(tx, existing.scope, existing.ownerId, id);
      return tx.liveClassPreset.update({
        where: { id },
        data: { isDefault: true },
        include: { owner: { select: { firstName: true, lastName: true } } },
      });
    });
    return LiveClassPresetService.toResponse(user, row);
  }

  /** At most one default per (scope, owner). */
  private static async clearDefault(
    tx: PrismaTx,
    scope: string,
    ownerId: string | null,
    exceptId?: string,
  ) {
    await tx.liveClassPreset.updateMany({
      where: {
        scope: scope as never,
        ownerId,
        isDefault: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }
}
