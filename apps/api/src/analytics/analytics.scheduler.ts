import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { RecordingStorageService } from "../live-class/recording-storage.service";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_TIME_ZONE, zonedDayBounds } from "../common/time";
import { requireTenantId } from "../tenancy/tenant-sql";

/**
 * Daily rollup of recording-storage usage into `storage_snapshots` — one row per
 * business-timezone calendar day. Powers the storage growth chart + forecast,
 * neither of which can be reconstructed after the fact.
 */
@Injectable()
export class AnalyticsScheduler {
  private readonly logger = new Logger(AnalyticsScheduler.name);

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly prisma: PrismaService,
    private readonly storage: RecordingStorageService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async captureStorageSnapshot(): Promise<void> {
    try {
      await this.jobLocks.runForEachTenant(JOB_LOCKS.analyticsStorageSnapshot, () =>
        this.snapshot()
      );
    } catch (error) {
      this.logger.error("Storage snapshot cron failed", error as Error);
    }
  }

  /** Exposed for tests + a manual backfill trigger. */
  async snapshot(now: Date = new Date()): Promise<void> {
    const tenantId = requireTenantId("storageSnapshot");
    const usage = await this.storage.getStorageUsage();
    const recordingCount = await this.prisma.liveSession.count({
      where: { recordingUrl: { not: null } }
    });
    const recordingBytes = BigInt(Math.round(await this.academyRecordingBytes(tenantId, usage.usedBytes)));

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
      where: { tenantId_capturedDate: { capturedDate, tenantId } },
      create: {
        capturedDate,
        recordingBytes,
        recordingCount,
        limitBytes: BigInt(Math.round(usage.limitBytes))
      },
      update: {
        capturedAt: now,
        recordingBytes,
        recordingCount,
        limitBytes: BigInt(Math.round(usage.limitBytes))
      }
    });
  }

  /**
   * The academy's share of the recordings folder. The folder is shared by every
   * academy (one flat directory, academy-distinct by file name), so only Nexa,
   * which runs the server, keeps the whole folder's size (orphans and other
   * files included, as before); another academy gets the sum of its own
   * recordings' sizes.
   */
  private async academyRecordingBytes(tenantId: string, folderBytes: number): Promise<number> {
    if (tenantId === DEFAULT_TENANT_ID) return folderBytes;
    const own = await this.prisma.liveSession.aggregate({
      _sum: { recordingBytes: true },
      where: { recordingBytes: { not: null }, recordingUrl: { not: null } }
    });
    return Number(own._sum.recordingBytes ?? 0);
  }
}
