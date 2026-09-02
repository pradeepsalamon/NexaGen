import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import {
  DEFAULT_LIVE_CLASS_SETTINGS,
  liveClassSettingsSchema,
  liveClassSettingsOverrideSchema,
  resolveLiveClassSettings,
  validateLiveClassSettings,
  type BatchLiveClassSettingsResponse,
  type LiveClassPolicyResponse,
  type LiveClassSettings,
  type LiveClassSettingsForClassResponse,
  type LiveClassSettingsOverride,
  type UpdateBatchLiveClassSettingsRequest,
  type UpdateLiveClassPolicyRequest,
  type UpdateLiveClassSettingsRequest,
} from "@nexa-chess/types";
import { getApiEnv } from "@nexa-chess/config/api";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "../auth/types";

type AuthUser = { id: string; role: UserRole };

/** Effective config for one class plus the raw contributing layers. */
export interface ResolvedClassSettings {
  system: LiveClassSettings;
  batchOverride: LiveClassSettingsOverride | null;
  classOverride: LiveClassSettingsOverride | null;
  resolved: LiveClassSettings;
}

@Injectable()
export class LiveClassSettingsService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(LiveClassSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // ── Auth (token-string pattern; no guards) ──

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

  private assertAdmin(user: AuthUser) {
    if (!LiveClassSettingsService.isAdmin(user.role)) {
      throw new ForbiddenException("Only administrators can change this setting.");
    }
  }

  // ── Layer 1: system policy (singleton) ──

  /** Lazily-created singleton row. Internal — never reachable anonymously. */
  private async getActivePolicyRow() {
    let policy = await this.prisma.liveClassPolicy.findFirst({ where: { isActive: true } });
    if (!policy) {
      policy = await this.prisma.liveClassPolicy.create({
        data: { name: "Default Live Class Policy", isActive: true, settings: DEFAULT_LIVE_CLASS_SETTINGS },
      });
    }
    return policy;
  }

  /** The resolved Layer 1 settings, safe to call from other services. */
  async getSystemSettings(): Promise<LiveClassSettings> {
    const policy = await this.getActivePolicyRow();
    return liveClassSettingsSchema.parse(policy.settings ?? {});
  }

  async getPolicy(accessToken: string | undefined): Promise<LiveClassPolicyResponse> {
    await this.getAuthenticatedUser(accessToken);
    const policy = await this.getActivePolicyRow();
    return {
      id: policy.id,
      name: policy.name,
      settings: liveClassSettingsSchema.parse(policy.settings ?? {}),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  async updatePolicy(
    accessToken: string | undefined,
    body: UpdateLiveClassPolicyRequest,
  ): Promise<LiveClassPolicyResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);

    const policy = await this.getActivePolicyRow();
    const before = liveClassSettingsSchema.parse(policy.settings ?? {});
    const next = resolveLiveClassSettings({ system: before, class: body.settings });
    this.assertValid(next);

    const updated = await this.prisma.liveClassPolicy.update({
      where: { id: policy.id },
      data: { settings: next },
    });
    await this.writeAudit("LiveClassPolicy", policy.id, user.id, before, next, "SYSTEM");

    return {
      id: updated.id,
      name: updated.name,
      settings: next,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  // ── Layer 2: per-class config ──

  private async loadClassForSettings(classId: string) {
    const cls = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: {
        batch: { select: { id: true, liveClassSettings: true } },
        liveSession: { select: { effectiveSettings: true } },
      },
    });
    if (!cls) {
      throw new NotFoundException("Class not found.");
    }
    return cls;
  }

  private assertCanEditClass(user: AuthUser, cls: { coachId: string }) {
    if (LiveClassSettingsService.isAdmin(user.role)) return;
    if (user.role === UserRole.COACH && cls.coachId === user.id) return;
    throw new ForbiddenException("You cannot change settings for this class.");
  }

  private assertCanViewClass(user: AuthUser, cls: { coachId: string }) {
    if (LiveClassSettingsService.isAdmin(user.role)) return;
    if (user.role === UserRole.COACH && cls.coachId === user.id) return;
    throw new ForbiddenException("You do not have access to this class.");
  }

  private parseOverride(value: unknown): LiveClassSettingsOverride | null {
    if (value === null || value === undefined) return null;
    const parsed = liveClassSettingsOverrideSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  /** Resolve effective settings for a class — used by `startClass` snapshot. */
  async resolveForClass(classId: string): Promise<ResolvedClassSettings> {
    const cls = await this.loadClassForSettings(classId);
    const system = await this.getSystemSettings();
    const batchOverride = this.parseOverride(cls.batch?.liveClassSettings);
    const classOverride = this.parseOverride(cls.liveClassSettings);
    const resolved = resolveLiveClassSettings({
      system,
      batch: batchOverride,
      class: classOverride,
    });
    return { system, batchOverride, classOverride, resolved };
  }

  async getSettingsForClass(
    accessToken: string | undefined,
    classId: string,
  ): Promise<LiveClassSettingsForClassResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const cls = await this.loadClassForSettings(classId);
    this.assertCanViewClass(user, cls);

    const { system, batchOverride, classOverride, resolved } = await this.resolveForClass(classId);
    const snapshotRaw = cls.liveSession?.effectiveSettings;

    return {
      classId,
      system,
      batchOverride,
      classOverride,
      resolved,
      snapshot: snapshotRaw ? liveClassSettingsSchema.parse(snapshotRaw) : null,
      canEdit:
        LiveClassSettingsService.isAdmin(user.role) ||
        (user.role === UserRole.COACH && cls.coachId === user.id),
    };
  }

  async updateSettingsForClass(
    accessToken: string | undefined,
    classId: string,
    body: UpdateLiveClassSettingsRequest,
  ): Promise<LiveClassSettingsForClassResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const cls = await this.loadClassForSettings(classId);
    this.assertCanEditClass(user, cls);

    const before = this.parseOverride(cls.liveClassSettings);
    // A preset, when supplied, is copied wholesale into the class override
    // (never a live reference — §23).
    const nextOverride = body.presetId
      ? await this.presetOverrideById(body.presetId, user)
      : body.liveClassSettings;

    if (nextOverride) {
      const system = await this.getSystemSettings();
      const batchOverride = this.parseOverride(cls.batch?.liveClassSettings);
      this.assertValid(
        resolveLiveClassSettings({ system, batch: batchOverride, class: nextOverride }),
      );
    }

    await this.prisma.coachClass.update({
      where: { id: classId },
      data: { liveClassSettings: (nextOverride ?? null) as never },
    });
    await this.writeAudit("CoachClass", classId, user.id, before, nextOverride ?? null, "CLASS");

    return this.getSettingsForClass(accessToken, classId);
  }

  // ── Layer 3: batch defaults ──

  async getSettingsForBatch(
    accessToken: string | undefined,
    batchId: string,
  ): Promise<BatchLiveClassSettingsResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, isDeleted: false },
      select: { id: true, liveClassSettings: true, coaches: { where: { isDeleted: false }, select: { coachId: true } } },
    });
    if (!batch) {
      throw new NotFoundException("Batch not found.");
    }
    const isCoachInBatch =
      user.role === UserRole.COACH && batch.coaches.some((c) => c.coachId === user.id);
    if (!LiveClassSettingsService.isAdmin(user.role) && !isCoachInBatch) {
      throw new ForbiddenException("You do not have access to this batch.");
    }

    const system = await this.getSystemSettings();
    const batchOverride = this.parseOverride(batch.liveClassSettings);
    return {
      batchId,
      system,
      batchOverride,
      resolved: resolveLiveClassSettings({ system, batch: batchOverride }),
      canEdit: LiveClassSettingsService.isAdmin(user.role),
    };
  }

  async updateSettingsForBatch(
    accessToken: string | undefined,
    batchId: string,
    body: UpdateBatchLiveClassSettingsRequest,
  ): Promise<BatchLiveClassSettingsResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);

    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, isDeleted: false },
      select: { id: true, liveClassSettings: true },
    });
    if (!batch) {
      throw new NotFoundException("Batch not found.");
    }

    const before = this.parseOverride(batch.liveClassSettings);
    const nextOverride = body.liveClassSettings;
    if (nextOverride) {
      const system = await this.getSystemSettings();
      this.assertValid(resolveLiveClassSettings({ system, batch: nextOverride }));
    }

    await this.prisma.batch.update({
      where: { id: batchId },
      data: { liveClassSettings: (nextOverride ?? null) as never },
    });
    await this.writeAudit("Batch", batchId, user.id, before, nextOverride ?? null, "BATCH");

    return this.getSettingsForBatch(accessToken, batchId);
  }

  // ── Preset resolution (shared with the preset service) ──

  /**
   * Load a preset the caller may see and return its settings override. Visible:
   * own PERSONAL presets, or any ORG / system preset.
   */
  async presetOverrideById(presetId: string, user: AuthUser): Promise<LiveClassSettingsOverride> {
    const preset = await this.prisma.liveClassPreset.findUnique({ where: { id: presetId } });
    if (!preset) {
      throw new NotFoundException("Preset not found.");
    }
    const visible =
      preset.scope === "ORG" || preset.isSystem || preset.ownerId === user.id;
    if (!visible) {
      throw new ForbiddenException("You cannot use this preset.");
    }
    const parsed = liveClassSettingsOverrideSchema.safeParse(preset.settings);
    return parsed.success ? parsed.data : {};
  }

  // ── helpers ──

  private assertValid(settings: LiveClassSettings) {
    const issues = validateLiveClassSettings(settings);
    if (issues.length > 0) {
      throw new BadRequestException(issues);
    }
  }

  private async writeAudit(
    entity: string,
    entityId: string,
    userId: string,
    before: unknown,
    after: unknown,
    scope: string,
  ) {
    try {
      await this.prisma.trashAuditLog.create({
        data: {
          entity,
          entityId,
          action: "LIVE_SETTINGS_CHANGE",
          userId,
          metadata: { before, after, scope } as never,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to write settings audit for ${entity}:${entityId}`, error as Error);
    }
  }
}
