import type { Logger } from "@nestjs/common";
import {
  DEFAULT_LIVE_CLASS_SETTINGS,
  liveClassSettingsSchema,
  type LiveClassSettings,
  type LockableLiveSetting
} from "@nexa-chess/types";
import type { Prisma } from "@prisma/client";
import type { LiveClassSettingsService } from "./live-class-settings.service";

type SettingsResolver = Pick<LiveClassSettingsService, "resolveForClass">;

/**
 * The settings a running class enforces (review L4, fail closed): its frozen
 * snapshot; when that is missing or unreadable, the settings resolved now
 * (admin locks applied); when even that fails, the safe defaults. Never the
 * wide-open grants a class without settings used to get.
 */
export async function effectiveClassSettings(
  session: { classId: string; effectiveSettings: Prisma.JsonValue | null },
  settings: SettingsResolver,
  logger: Pick<Logger, "warn">
): Promise<LiveClassSettings> {
  if (session.effectiveSettings) {
    const parsed = liveClassSettingsSchema.safeParse(session.effectiveSettings);
    if (parsed.success) return parsed.data;
    logger.warn(`Unreadable settings snapshot for class ${session.classId}; resolving them again`);
  }
  try {
    const { resolved } = await settings.resolveForClass(session.classId);
    return liveClassSettingsSchema.parse(resolved);
  } catch (error) {
    logger.warn(`Couldn't resolve settings for class ${session.classId}; using the defaults: ${(error as Error).message}`);
    return DEFAULT_LIVE_CLASS_SETTINGS;
  }
}

/**
 * Whether an admin locked `field` for this class (academy or batch lock, not
 * excepted for the class). A per-student exception a coach grants, such as
 * one student's screen share, must not get round a lock (review L2). When the
 * locks can't be read, the answer is "locked".
 */
export async function liveSettingLocked(
  classId: string,
  field: LockableLiveSetting,
  settings: SettingsResolver
): Promise<boolean> {
  try {
    const { batchLocks, lockExceptions, systemLocks } = await settings.resolveForClass(classId);
    return [...(systemLocks ?? []), ...(batchLocks ?? [])]
      .filter((locked) => !(lockExceptions ?? []).includes(locked as never))
      .includes(field);
  } catch {
    return true;
  }
}
