import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { RecordingStorageService } from "../live-class/recording-storage.service";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_TIME_ZONE, zonedDayBounds } from "../common/time";

/**
 * Daily rollup of recording-storage usage into `storage_snapshots` — one row per
 * business-timezone calendar day. Powers the storage growth chart + forecast,
 * neither of which can be reconstructed after the fact.
 */
@Injectable()
export class AnalyticsScheduler {
  private static readonly SNAPSHOT_LOCK_ID = 73_002_050;
  private readonly logger = new Logger(AnalyticsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: RecordingStorageService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async captureStorageSnapshot(): Promise<void> {
    try {
      const [lock] = await this.prisma.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_lock(${AnalyticsScheduler.SNAPSHOT_LOCK_ID}) AS locked
      `;
      if (!lock?.locked) return;

      try {
        await this.snapshot();
      } finally {
        await this.prisma.$queryRaw`
          SELECT pg_advisory_unlock(${AnalyticsScheduler.SNAPSHOT_LOCK_ID})
        `;
      }
    } catch (error) {
      this.logger.error("Storage snapshot cron failed", error as Error);
    }
  }

  /** Exposed for tests + a manual backfill trigger. */
  async snapshot(now: Date = new Date()): Promise<void> {
    const usage = await this.storage.getStorageUsage();
    const recordingCount = await this.prisma.liveSession.count({
      where: { recordingUrl: { not: null } }
    });

    // Truncate to the business-timezone calendar day (matches the analytics
    // queries) so `capturedDate` is stable regardless of when the cron fires.
    const { start } = zonedDayBounds(DEFAULT_TIME_ZONE, now);
    const capturedDate = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate()
      )
    );

    await this.prisma.storageSnapshot.upsert({
      where: { capturedDate },
      create: {
        capturedDate,
        recordingBytes: BigInt(Math.round(usage.usedBytes)),
        recordingCount,
        limitBytes: BigInt(Math.round(usage.limitBytes))
      },
      update: {
        capturedAt: now,
        recordingBytes: BigInt(Math.round(usage.usedBytes)),
        recordingCount,
        limitBytes: BigInt(Math.round(usage.limitBytes))
      }
    });
  }
}
