import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  LOCKABLE_LIVE_SETTING_LABELS,
  classLiveSettingsJson,
  liveClassLockSources,
  liveClassSettingsOverrideSchema,
  liveSettingExceptionPayloadSchema,
  liveSettingOverride,
  liveSettingValue,
  mergeLiveClassOverrides,
  readLiveClassLockExceptions,
  readLiveClassLocks,
  resolveLiveClassSettings,
  validateLiveClassSettings,
  type LiveClassSettingsOverride,
  type LiveSettingExceptionField,
  type LiveSettingExceptionPayload
} from "@nexa-chess/types";
import { ClassStatus, UserRole, UserStatus, type ApprovalRequest } from "@prisma/client";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import type { ApprovalActor, ApprovalHandler, PreparedApproval } from "../approval-handler";

const HOUR = 3_600_000;
const URGENT_WITHIN_HOURS = 6;

type Requested = { field: LiveSettingExceptionField; fieldLabel: string; value: string };

function parseOverride(value: unknown): LiveClassSettingsOverride | null {
  const parsed = liveClassSettingsOverrideSchema.safeParse(value ?? null);
  return parsed.success ? parsed.data : null;
}

/** The class's layers, read with the same keys `LiveClassSettingsService` uses. */
async function loadLayers(tx: PrismaTransactionClient, classId: string) {
  const [cls, policy] = await Promise.all([
    tx.coachClass.findUnique({
      select: {
        batch: { select: { liveClassSettings: true } },
        batchId: true,
        coach: { select: { isDeleted: true, role: true, status: true } },
        coachId: true,
        id: true,
        liveClassSettings: true,
        startsAt: true,
        status: true
      },
      where: { id: classId }
    }),
    tx.liveClassPolicy.findFirst({ select: { settings: true }, where: { isActive: true } })
  ]);
  if (!cls) return null;
  const systemLocks = readLiveClassLocks(policy?.settings);
  const batchLocks = readLiveClassLocks(cls.batch?.liveClassSettings);
  const batchOverride = parseOverride(cls.batch?.liveClassSettings);
  const inherited = resolveLiveClassSettings({
    batch: batchOverride,
    batchLocks,
    system: policy?.settings ?? {},
    systemLocks
  });
  return {
    batchLocks,
    batchOverride,
    classOverride: parseOverride(cls.liveClassSettings),
    cls,
    exceptions: readLiveClassLockExceptions(cls.liveClassSettings),
    inherited,
    policySettings: policy?.settings ?? {},
    systemLocks
  };
}

type Layers = NonNullable<Awaited<ReturnType<typeof loadLayers>>>;

/** The class layer with the exception applied; 400 when it conflicts with another setting. */
function withException(layers: Layers, field: LiveSettingExceptionField, value: string) {
  const override = mergeLiveClassOverrides(layers.classOverride, liveSettingOverride(field, value));
  const exceptions = [...new Set([...layers.exceptions, field])];
  const issues = validateLiveClassSettings(
    resolveLiveClassSettings({
      batch: layers.batchOverride,
      batchLocks: layers.batchLocks,
      class: override,
      classExceptions: exceptions,
      system: layers.policySettings,
      systemLocks: layers.systemLocks
    })
  );
  return { exceptions, issues, override };
}

/**
 * `LIVE_SETTING_EXCEPTION`: a coach asks for a different value on a locked
 * setting, for one class, before it starts (plan §2.5). The approved value and
 * the field name are stored on the class, so the resolver lets that one value
 * through while the lock keeps binding everything else. It expires at the class
 * start: there are no exceptions during a class.
 */
@Injectable()
export class LiveSettingExceptionHandler implements ApprovalHandler<LiveSettingExceptionPayload> {
  readonly actionType = "LIVE_SETTING_EXCEPTION" as const;
  readonly payloadSchema = liveSettingExceptionPayloadSchema;

  async prepare(
    tx: PrismaTransactionClient,
    requester: ApprovalActor,
    payload: LiveSettingExceptionPayload
  ): Promise<PreparedApproval> {
    const layers = await loadLayers(tx, payload.classId);
    if (!layers || layers.cls.coachId !== requester.id) throw new NotFoundException("Class not found.");
    const { cls } = layers;
    if (cls.status !== ClassStatus.SCHEDULED || cls.startsAt.getTime() <= Date.now()) {
      throw new ConflictException("A locked setting can only be excepted before the class starts.");
    }
    const source = liveClassLockSources(layers)[payload.field];
    if (!source) throw new ConflictException("This setting isn't locked, so you can change it yourself.");
    if (layers.exceptions.includes(payload.field)) {
      throw new ConflictException("An exception for this setting is already approved on this class.");
    }
    const lockedValue = liveSettingValue(layers.inherited, payload.field);
    if (lockedValue === payload.value) throw new ConflictException("The setting already has this value.");
    const { issues } = withException(layers, payload.field, payload.value);
    if (issues.length > 0) throw new BadRequestException(issues);

    const requested: Requested = {
      field: payload.field,
      fieldLabel: LOCKABLE_LIVE_SETTING_LABELS[payload.field],
      value: payload.value
    };
    return {
      batchId: cls.batchId,
      classId: cls.id,
      currentValue: { lockedValue: lockedValue as string, source },
      dedupeKey: `LIVE_SETTING_EXCEPTION:${cls.id}:${payload.field}`,
      expiresAt: cls.startsAt,
      requestedValue: requested,
      urgent: cls.startsAt.getTime() - Date.now() < URGENT_WITHIN_HOURS * HOUR
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    if (!request.classId) throw new ConflictException("This request has no class. Reject it.");
    // Same order as every settings writer: policy → batch → class.
    await tx.$queryRaw`SELECT "id" FROM "live_class_policies" WHERE "isActive" = true FOR SHARE`;
    if (request.batchId) {
      await tx.$queryRaw`SELECT "id" FROM "batches" WHERE "id" = ${request.batchId} FOR SHARE`;
    }
    await tx.$queryRaw`SELECT "id" FROM "classes" WHERE "id" = ${request.classId} FOR UPDATE`;

    const layers = await loadLayers(tx, request.classId);
    if (!layers) throw new ConflictException("The class no longer exists. Reject this request.");
    const { cls } = layers;
    if (
      cls.coachId !== request.requesterId ||
      cls.coach.isDeleted ||
      cls.coach.role !== UserRole.COACH ||
      cls.coach.status !== UserStatus.ACTIVE
    ) {
      throw new ConflictException("The class is no longer this coach's (or the coach is inactive). Reject this request.");
    }
    if (cls.status !== ClassStatus.SCHEDULED || cls.startsAt.getTime() <= Date.now()) {
      throw new ConflictException("The class has started or was cancelled. Reject this request.");
    }
    const { field, value } = request.requestedValue as Requested;
    if (!liveClassLockSources(layers)[field]) {
      throw new ConflictException("This setting is no longer locked, so the coach can change it. Reject this request.");
    }
    const asked = (request.currentValue as { lockedValue?: unknown } | null)?.lockedValue;
    if (liveSettingValue(layers.inherited, field) !== asked) {
      throw new ConflictException("The locked value changed after this request was made. Reject it and ask again.");
    }
    const { issues } = withException(layers, field, value);
    if (issues.length > 0) {
      throw new ConflictException(`${issues.join(" ")} Reject this request.`);
    }
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest, reviewer: { id: string }) {
    const { field, value } = request.requestedValue as Requested;
    const layers = await loadLayers(tx, request.classId!);
    if (!layers) throw new ConflictException("The class changed while this was being approved.");
    const { exceptions, override } = withException(layers, field, value);
    await tx.coachClass.update({
      data: { liveClassSettings: classLiveSettingsJson(override, exceptions) as never },
      where: { id: request.classId! }
    });
    // Commits with the change, and shows in the same audit view as any settings edit.
    await tx.trashAuditLog.create({
      data: {
        action: "LIVE_SETTINGS_CHANGE",
        entity: "CoachClass",
        entityId: request.classId!,
        metadata: {
          after: override,
          approvalRequestId: request.id,
          before: layers.classOverride,
          scope: "CLASS"
        } as never,
        userId: reviewer.id
      }
    });
    return { field, value };
  }
}
