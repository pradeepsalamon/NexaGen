import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import {
  DEFAULT_LIVE_CLASS_SETTINGS,
  LOCKABLE_LIVE_SETTING_LABELS,
  classLiveSettingsJson,
  liveClassLockSources,
  liveClassSettingsSchema,
  liveClassSettingsOverrideSchema,
  lockedFieldsChanged,
  mergeLiveClassOverrides,
  onlyLockedFields,
  readLiveClassLockExceptions,
  readLiveClassLocks,
  resolveLiveClassSettings,
  validateLiveClassSettings,
  withoutLockedFields,
  type BatchLiveClassSettingsResponse,
  type LiveClassPolicyResponse,
  type LiveClassSettingsAuditEntry,
  type LiveClassSettingsAuditResponse,
  type LiveClassSettings,
  type LiveClassSettingsForClassResponse,
  type LiveClassSettingsOverride,
  type LockableLiveSetting,
  type UpdateBatchLiveClassSettingsRequest,
  type UpdateLiveClassPolicyRequest,
  type UpdateLiveClassSettingsRequest,
} from "@nexa-chess/types";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { authenticateUser } from "../auth/authenticate";

type AuthUser = { id: string; role: UserRole };
type Db = PrismaService | PrismaTransactionClient;

/** Names the layer that locked each refused field, e.g. "Locked by academy policy: X. Locked by batch settings: Y". */
function describeLockedChange(
  changed: readonly LockableLiveSetting[],
  layers: { systemLocks: readonly LockableLiveSetting[]; batchLocks?: readonly LockableLiveSetting[] },
): string {
  const sources = liveClassLockSources(layers);
  const label = (fields: LockableLiveSetting[]) => fields.map((f) => LOCKABLE_LIVE_SETTING_LABELS[f]).join(", ");
  const academy = changed.filter((f) => sources[f] === "ACADEMY");
  const batch = changed.filter((f) => sources[f] === "BATCH");
  const parts: string[] = [];
  if (academy.length > 0) parts.push(`Locked by academy policy: ${label(academy)}`);
  if (batch.length > 0) parts.push(`Locked by batch settings: ${label(batch)}`);
  return parts.join(". ");
}

/** Effective config for one class plus the raw contributing layers. */
export interface ResolvedClassSettings {
  system: LiveClassSettings;
  batchOverride: LiveClassSettingsOverride | null;
  classOverride: LiveClassSettingsOverride | null;
  resolved: LiveClassSettings;
  systemLocks: LockableLiveSetting[];
  batchLocks: LockableLiveSetting[];
  lockExceptions: LockableLiveSetting[];
}

/**
 * A layer's JSON column holds its settings plus its lock list (`locks`), so no
 * migration was needed. Settings parsers strip the unknown `locks` key, so code
 * that predates locks reads the same values as before.
 */
function layerJson(
  settings: LiveClassSettings | LiveClassSettingsOverride | null,
  locks: readonly LockableLiveSetting[],
): object | null {
  if (!settings && locks.length === 0) return null;
  return locks.length > 0 ? { ...(settings ?? {}), locks: [...locks] } : { ...(settings ?? {}) };
}

@Injectable()
export class LiveClassSettingsService {
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
    return (await this.getSystemLayer()).settings;
  }

  /** Layer 1 settings plus the academy-wide lock list. */
  async getSystemLayer(): Promise<{ settings: LiveClassSettings; locks: LockableLiveSetting[] }> {
    return LiveClassSettingsService.systemLayerOf(await this.getActivePolicyRow());
  }

  private static systemLayerOf(policy: { settings: unknown }) {
    return {
      settings: liveClassSettingsSchema.parse(policy.settings ?? {}),
      locks: readLiveClassLocks(policy.settings),
    };
  }

  /**
   * Every settings writer takes row locks in one order — academy policy, then
   * batch, then class — and re-reads the lock lists after taking them, so a
   * lock committed concurrently is either seen or waits for the write. The
   * policy row is created (if missing) before the transaction: a row lock can't
   * cover a row that doesn't exist yet.
   */
  private async lockPolicy(tx: PrismaTransactionClient, policyId: string, mode: "SHARE" | "UPDATE") {
    if (mode === "UPDATE") {
      await tx.$queryRaw`SELECT "id" FROM "live_class_policies" WHERE "id" = ${policyId} FOR UPDATE`;
    } else {
      await tx.$queryRaw`SELECT "id" FROM "live_class_policies" WHERE "id" = ${policyId} FOR SHARE`;
    }
    const policy = await tx.liveClassPolicy.findUnique({ where: { id: policyId } });
    if (!policy) throw new NotFoundException("Live class policy not found.");
    return policy;
  }

  async getPolicy(accessToken: string | undefined): Promise<LiveClassPolicyResponse> {
    await this.getAuthenticatedUser(accessToken);
    const policy = await this.getActivePolicyRow();
    return {
      id: policy.id,
      name: policy.name,
      settings: liveClassSettingsSchema.parse(policy.settings ?? {}),
      locks: readLiveClassLocks(policy.settings),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  async updatePolicy(
    accessToken: string | undefined,
    body: UpdateLiveClassPolicyRequest,
  ): Promise<LiveClassPolicyResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);

    const { id: policyId } = await this.getActivePolicyRow();
    // The update and its audit row commit together: an audit failure rolls the change back.
    const { updated, next, locks } = await this.prisma.$transaction(async (tx) => {
      const policy = await this.lockPolicy(tx, policyId, "UPDATE");
      const before = liveClassSettingsSchema.parse(policy.settings ?? {});
      const locksBefore = readLiveClassLocks(policy.settings);
      // Normalised here too (deduped, catalogue order), not only by the route's Zod pipe.
      const locks = body.locks ? readLiveClassLocks({ locks: body.locks }) : locksBefore;
      const next = resolveLiveClassSettings({ system: before, class: body.settings });
      this.assertValid(next);

      const updated = await tx.liveClassPolicy.update({
        where: { id: policy.id },
        data: { settings: layerJson(next, locks) as never },
      });
      await this.writeAudit(tx, "LiveClassPolicy", policy.id, user.id, before, next, "SYSTEM", {
        after: locks,
        before: locksBefore,
      });
      return { updated, next, locks };
    });

    return {
      id: updated.id,
      name: updated.name,
      settings: next,
      locks,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  // ── Audit surfacing (admin) ──

  async getAuditLog(accessToken: string | undefined): Promise<LiveClassSettingsAuditResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);

    const rows = await this.prisma.trashAuditLog.findMany({
      where: { action: "LIVE_SETTINGS_CHANGE" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    // Batch-resolve target names in two queries rather than N.
    const classIds = rows.filter((r) => r.entity === "CoachClass").map((r) => r.entityId);
    const batchIds = rows.filter((r) => r.entity === "Batch").map((r) => r.entityId);
    const [classes, batches] = await Promise.all([
      classIds.length
        ? this.prisma.coachClass.findMany({
            where: { id: { in: classIds } },
            select: { id: true, title: true, topic: true },
          })
        : Promise.resolve([]),
      batchIds.length
        ? this.prisma.batch.findMany({
            where: { id: { in: batchIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const classNames = new Map(classes.map((c) => [c.id, c.title || c.topic || "Untitled class"]));
    const batchNames = new Map(batches.map((b) => [b.id, b.name]));

    const entries: LiveClassSettingsAuditEntry[] = rows.map((row) => {
      const meta = (row.metadata ?? {}) as {
        before?: unknown;
        after?: unknown;
        scope?: unknown;
        locksBefore?: unknown;
        locksAfter?: unknown;
      };
      return {
        id: row.id,
        entity: row.entity,
        entityId: row.entityId,
        scope: typeof meta.scope === "string" ? meta.scope : "",
        entityName:
          row.entity === "CoachClass"
            ? classNames.get(row.entityId) ?? null
            : row.entity === "Batch"
              ? batchNames.get(row.entityId) ?? null
              : null,
        actorName: row.user
          ? [row.user.firstName, row.user.lastName].filter(Boolean).join(" ").trim() || null
          : null,
        createdAt: row.createdAt.toISOString(),
        before: this.parseOverride(meta.before),
        after: this.parseOverride(meta.after),
        locksBefore: Array.isArray(meta.locksBefore) ? readLiveClassLocks({ locks: meta.locksBefore }) : null,
        locksAfter: Array.isArray(meta.locksAfter) ? readLiveClassLocks({ locks: meta.locksAfter }) : null,
      };
    });

    return { entries };
  }

  // ── Layer 2: per-class config ──

  private async loadClassForSettings(classId: string, db: Db = this.prisma) {
    const cls = await db.coachClass.findUnique({
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

  /**
   * Resolve effective settings for a class — used by the `startClass` snapshot,
   * token minting and mid-class updates. Academy and batch locks are applied
   * here, so a locked field holds at LiveKit-grant level too.
   */
  async resolveForClass(classId: string): Promise<ResolvedClassSettings> {
    const cls = await this.loadClassForSettings(classId);
    const { settings: system, locks: systemLocks } = await this.getSystemLayer();
    const batchOverride = this.parseOverride(cls.batch?.liveClassSettings);
    const batchLocks = readLiveClassLocks(cls.batch?.liveClassSettings);
    const classOverride = this.parseOverride(cls.liveClassSettings);
    const lockExceptions = readLiveClassLockExceptions(cls.liveClassSettings);
    const resolved = resolveLiveClassSettings({
      system,
      batch: batchOverride,
      class: classOverride,
      systemLocks,
      batchLocks,
      classExceptions: lockExceptions,
    });
    return { system, batchOverride, classOverride, resolved, systemLocks, batchLocks, lockExceptions };
  }

  async getSettingsForClass(
    accessToken: string | undefined,
    classId: string,
  ): Promise<LiveClassSettingsForClassResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const cls = await this.loadClassForSettings(classId);
    this.assertCanViewClass(user, cls);

    const { system, batchOverride, classOverride, resolved, systemLocks, batchLocks, lockExceptions } =
      await this.resolveForClass(classId);
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
      systemLocks,
      batchLocks,
      lockExceptions,
    };
  }

  async updateSettingsForClass(
    accessToken: string | undefined,
    classId: string,
    body: UpdateLiveClassSettingsRequest,
  ): Promise<LiveClassSettingsForClassResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const loaded = await this.loadClassForSettings(classId);
    this.assertCanEditClass(user, loaded);

    // A preset, when supplied, is copied wholesale into the class override
    // (never a live reference — §23) — minus any locked field: one academy
    // preset serves batches with different locks, so those fields are dropped
    // rather than refused.
    const requested = body.presetId
      ? await this.presetOverrideById(body.presetId, user)
      : body.liveClassSettings;
    const { id: policyId } = await this.getActivePolicyRow();

    await this.prisma.$transaction(async (tx) => {
      // Lock order: policy → batch → class (see lockPolicy). The lock lists are
      // read only after the locks are held, so a concurrent lock can't slip in
      // between the check and the write.
      const policy = await this.lockPolicy(tx, policyId, "SHARE");
      if (loaded.batchId) {
        await tx.$queryRaw`SELECT "id" FROM "batches" WHERE "id" = ${loaded.batchId} FOR SHARE`;
      }
      await tx.$queryRaw`SELECT "id" FROM "classes" WHERE "id" = ${classId} FOR UPDATE`;
      const cls = await this.loadClassForSettings(classId, tx);

      const before = this.parseOverride(cls.liveClassSettings);
      const { settings: system, locks: systemLocks } = LiveClassSettingsService.systemLayerOf(policy);
      const batchOverride = this.parseOverride(cls.batch?.liveClassSettings);
      const batchLocks = readLiveClassLocks(cls.batch?.liveClassSettings);
      const locks = [...new Set([...systemLocks, ...batchLocks])];

      // V1: a class override never changes an academy- or batch-locked field —
      // not for a coach, and not for an admin editing one class (an admin changes
      // a locked value at the layer that locked it). Refused, not silently
      // ignored, so the caller knows why their change didn't stick.
      if (!body.presetId) {
        const changed = lockedFieldsChanged({
          next: requested,
          previous: before,
          locked: resolveLiveClassSettings({ system, batch: batchOverride, systemLocks }),
          locks,
        });
        if (changed.length > 0) {
          throw new ForbiddenException(
            `${describeLockedChange(changed, { systemLocks, batchLocks })}. Ask an admin to change it.`,
          );
        }
      }
      // An approved exception holds one value for one locked field, so a save
      // keeps it however the rest of the override changes. Once the field is
      // unlocked the exception means nothing, and the value is the coach's to edit.
      const lockExceptions = readLiveClassLockExceptions(cls.liveClassSettings).filter((field) =>
        locks.includes(field),
      );
      const nextOverride = mergeLiveClassOverrides(
        withoutLockedFields(requested, locks),
        onlyLockedFields(before, lockExceptions),
      );

      if (nextOverride) {
        this.assertValid(
          resolveLiveClassSettings({
            system,
            batch: batchOverride,
            class: nextOverride,
            systemLocks,
            batchLocks,
            classExceptions: lockExceptions,
          }),
        );
      }

      await tx.coachClass.update({
        where: { id: classId },
        data: { liveClassSettings: classLiveSettingsJson(nextOverride, lockExceptions) as never },
      });
      await this.writeAudit(tx, "CoachClass", classId, user.id, before, nextOverride ?? null, "CLASS");
    });

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

    const { settings: system, locks: systemLocks } = await this.getSystemLayer();
    const batchOverride = this.parseOverride(batch.liveClassSettings);
    return {
      batchId,
      system,
      batchOverride,
      resolved: resolveLiveClassSettings({ system, batch: batchOverride, systemLocks }),
      canEdit: LiveClassSettingsService.isAdmin(user.role),
      systemLocks,
      batchLocks: readLiveClassLocks(batch.liveClassSettings),
    };
  }

  async updateSettingsForBatch(
    accessToken: string | undefined,
    batchId: string,
    body: UpdateBatchLiveClassSettingsRequest,
  ): Promise<BatchLiveClassSettingsResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertAdmin(user);

    const { id: policyId } = await this.getActivePolicyRow();

    await this.prisma.$transaction(async (tx) => {
      // Lock order: policy → batch (see lockPolicy).
      const policy = await this.lockPolicy(tx, policyId, "SHARE");
      await tx.$queryRaw`SELECT "id" FROM "batches" WHERE "id" = ${batchId} FOR UPDATE`;
      const batch = await tx.batch.findFirst({
        where: { id: batchId, isDeleted: false },
        select: { id: true, liveClassSettings: true },
      });
      if (!batch) {
        throw new NotFoundException("Batch not found.");
      }

      const before = this.parseOverride(batch.liveClassSettings);
      const locksBefore = readLiveClassLocks(batch.liveClassSettings);
      const { settings: system, locks: systemLocks } = LiveClassSettingsService.systemLayerOf(policy);

      // An academy lock binds the batch layer the same way a batch lock binds the class.
      const changed = lockedFieldsChanged({
        next: body.liveClassSettings,
        previous: before,
        locked: system,
        locks: systemLocks,
      });
      if (changed.length > 0) {
        throw new ForbiddenException(
          `${describeLockedChange(changed, { systemLocks })}. Change it in the academy live-class settings.`,
        );
      }
      // While the academy locks a field, the batch can't change it — but what the
      // batch held for it before (value and lock) is kept, not erased, so it
      // takes effect again once the academy unlocks.
      const keptUnderAcademyLock = onlyLockedFields(before, systemLocks);
      const editable = withoutLockedFields(body.liveClassSettings, systemLocks);
      const nextOverride = mergeLiveClassOverrides(editable, keptUnderAcademyLock);
      const requestedLocks = body.locks ? readLiveClassLocks({ locks: body.locks }) : locksBefore;
      const locks = readLiveClassLocks({
        locks: [
          ...requestedLocks.filter((field) => !systemLocks.includes(field)),
          ...locksBefore.filter((field) => systemLocks.includes(field)),
        ],
      });
      if (nextOverride) {
        this.assertValid(resolveLiveClassSettings({ system, batch: nextOverride, systemLocks }));
      }

      await tx.batch.update({
        where: { id: batchId },
        data: { liveClassSettings: layerJson(nextOverride, locks) as never },
      });
      await this.writeAudit(tx, "Batch", batchId, user.id, before, nextOverride ?? null, "BATCH", {
        after: locks,
        before: locksBefore,
      });
    });

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

  /**
   * Written in the caller's transaction and never swallowed: a settings change
   * without its LIVE_SETTINGS_CHANGE row would be invisible in the audit view.
   */
  private async writeAudit(
    tx: PrismaTransactionClient,
    entity: string,
    entityId: string,
    userId: string,
    before: unknown,
    after: unknown,
    scope: string,
    locks?: { before: LockableLiveSetting[]; after: LockableLiveSetting[] },
  ) {
    await tx.trashAuditLog.create({
      data: {
        entity,
        entityId,
        action: "LIVE_SETTINGS_CHANGE",
        userId,
        metadata: {
          before,
          after,
          scope,
          ...(locks ? { locksAfter: locks.after, locksBefore: locks.before } : {}),
        } as never,
      },
    });
  }
}
