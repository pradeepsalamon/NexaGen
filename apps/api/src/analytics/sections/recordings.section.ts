import { Injectable } from "@nestjs/common";
import type {
  RecordingAnalyticsResponse,
  StorageAnalyticsResponse
} from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { getApiEnv } from "@nexa-chess/config/api";
import { RecordingStorageService } from "../../live-class/recording-storage.service";
import { PrismaService } from "../../prisma/prisma.service";
import { zonedMonthBounds } from "../../common/time";
import {
  densifySeries,
  forecastStorage,
  roundTo,
  toCategoryCounts
} from "../analytics-math";
import {
  BYTES_PER_GB,
  buildMeta,
  type AnalyticsContext
} from "../analytics-support";

@Injectable()
export class RecordingsAnalyticsSection {
  private readonly env = getApiEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: RecordingStorageService
  ) {}

  /** Filesystem storage usage, or null when the recordings dir can't be read. */
  async storageUsageOrNull(): Promise<{
    usedBytes: number;
    limitBytes: number;
    usagePercent: number;
  } | null> {
    try {
      return await this.storage.getStorageUsage();
    } catch {
      return null;
    }
  }

  // ── /analytics/recordings ──

  async recordings(ctx: AnalyticsContext): Promise<RecordingAnalyticsResponse> {
    const { range } = ctx;
    const now = new Date();
    const month = zonedMonthBounds(range.timezone, now);

    const recordedWhere: Prisma.LiveSessionWhereInput = {
      recordingUrl: { not: null }
    };

    const [
      totalRecordings,
      recordingsThisMonth,
      durationAgg,
      sizeAgg,
      failed,
      missing,
      rows,
      largest
    ] = await Promise.all([
      this.prisma.liveSession.count({ where: recordedWhere }),
      this.prisma.liveSession.count({
        where: {
          ...recordedWhere,
          recordingCompletedAt: { gte: month.start, lt: month.end }
        }
      }),
      this.prisma.liveSession.aggregate({
        where: recordedWhere,
        _sum: { recordingDurationSeconds: true },
        _avg: { recordingDurationSeconds: true }
      }),
      this.prisma.liveSession.aggregate({
        where: { ...recordedWhere, recordingBytes: { not: null } },
        _sum: { recordingBytes: true }
      }),
      this.prisma.liveSession.count({
        where: { recordingStatus: "FAILED" }
      }),
      this.prisma.liveSession.count({
        where: {
          status: "ENDED",
          recordingUrl: null,
          recordingStatus: { notIn: ["PURGED_STORAGE_LIMIT"] }
        }
      }),
      this.prisma.liveSession.findMany({
        where: {
          ...recordedWhere,
          recordingCompletedAt: { gte: range.start, lt: range.end }
        },
        select: {
          classId: true,
          recordingBytes: true,
          recordingDurationSeconds: true,
          recordingCompletedAt: true,
          recordingStatus: true,
          class: {
            select: {
              topic: true,
              title: true,
              isDemo: true,
              coach: { select: { firstName: true, lastName: true } },
              batch: { select: { name: true } }
            }
          }
        }
      }),
      this.prisma.liveSession.findMany({
        where: { ...recordedWhere, recordingBytes: { not: null } },
        orderBy: { recordingBytes: "desc" },
        take: 10,
        select: {
          classId: true,
          recordingBytes: true,
          recordingDurationSeconds: true,
          recordingCompletedAt: true,
          recordingStatus: true,
          createdAt: true,
          class: {
            select: {
              topic: true,
              title: true,
              coach: { select: { firstName: true, lastName: true } },
              batch: { select: { name: true } }
            }
          }
        }
      })
    ]);

    const byTypeCounts = { demo: 0, batch: 0 };
    const byCoach = new Map<string, number>();
    for (const r of rows) {
      if (r.class?.isDemo) byTypeCounts.demo += 1;
      else byTypeCounts.batch += 1;
      const coach = `${r.class?.coach.firstName ?? ""} ${
        r.class?.coach.lastName ?? ""
      }`.trim();
      byCoach.set(coach, (byCoach.get(coach) ?? 0) + 1);
    }

    const byMonthRows = await this.prisma.$queryRaw<
      { bucket: string; count: bigint }[]
    >(Prisma.sql`
      SELECT to_char(date_trunc('month', ("recordingCompletedAt" AT TIME ZONE ${range.timezone})), 'YYYY-MM-DD') AS bucket,
             count(*)::bigint AS count
      FROM "live_sessions"
      WHERE "recordingUrl" IS NOT NULL AND "recordingCompletedAt" IS NOT NULL
        AND "recordingCompletedAt" >= (now() - interval '12 months')
      GROUP BY 1 ORDER BY 1
    `);
    const byMonthMap = new Map(
      byMonthRows.map((r) => [r.bucket, Number(r.count)])
    );

    const totalSizeBytes = sizeAgg._sum.recordingBytes
      ? Number(sizeAgg._sum.recordingBytes)
      : null;

    return {
      meta: buildMeta(range, false),
      kpis: {
        totalRecordings,
        recordingsThisMonth,
        totalDurationHours: roundTo(
          (durationAgg._sum.recordingDurationSeconds ?? 0) / 3600,
          1
        ),
        avgDurationMinutes: durationAgg._avg.recordingDurationSeconds
          ? roundTo(durationAgg._avg.recordingDurationSeconds / 60, 1)
          : null,
        totalSizeGb:
          totalSizeBytes === null ? null : roundTo(totalSizeBytes / BYTES_PER_GB, 2),
        missingRecordings: missing,
        failedRecordings: failed
      },
      byType: toCategoryCounts([
        { key: "demo", label: "Demo classes", count: byTypeCounts.demo },
        { key: "batch", label: "Batch classes", count: byTypeCounts.batch }
      ]),
      byCoach: toCategoryCounts(
        [...byCoach.entries()]
          .map(([label, count]) => ({ key: label, label, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15)
      ),
      byMonth: {
        granularity: "month",
        points: densifySeries(
          byMonthMap,
          new Date(Date.now() - 365 * 86_400_000),
          new Date(),
          "month"
        )
      },
      largest: largest.map((r) => ({
        classId: r.classId,
        topic: r.class?.topic ?? r.class?.title ?? "Class",
        coachName: `${r.class?.coach.firstName ?? ""} ${
          r.class?.coach.lastName ?? ""
        }`.trim(),
        batchName: r.class?.batch?.name ?? null,
        sizeBytes: r.recordingBytes ? Number(r.recordingBytes) : null,
        durationSeconds: r.recordingDurationSeconds,
        createdAt: (r.recordingCompletedAt ?? r.createdAt).toISOString(),
        status: r.recordingStatus ?? "COMPLETED"
      }))
    };
  }

  // ── /analytics/storage ──

  async storageAnalytics(ctx: AnalyticsContext): Promise<StorageAnalyticsResponse> {
    const { range } = ctx;
    const warnPct = this.env.ANALYTICS_STORAGE_WARN_PERCENT;
    const critPct = this.env.ANALYTICS_STORAGE_CRITICAL_PERCENT;

    let usage: { usedBytes: number; limitBytes: number; usagePercent: number } | null =
      null;
    try {
      usage = await this.storage.getStorageUsage();
    } catch {
      usage = null;
    }

    const [recordingSizeAgg, recordingCount, snapshots] = await Promise.all([
      this.prisma.liveSession.aggregate({
        where: { recordingUrl: { not: null }, recordingBytes: { not: null } },
        _sum: { recordingBytes: true }
      }),
      this.prisma.liveSession.count({ where: { recordingUrl: { not: null } } }),
      this.prisma.storageSnapshot.findMany({
        orderBy: { capturedDate: "asc" },
        take: 365
      })
    ]);

    const recordingBytes = recordingSizeAgg._sum.recordingBytes
      ? Number(recordingSizeAgg._sum.recordingBytes)
      : null;

    if (!usage) {
      return {
        meta: buildMeta(range, false),
        available: false,
        usedBytes: null,
        limitBytes: null,
        remainingBytes: null,
        usagePercent: null,
        recordingBytes,
        otherBytes: null,
        recordingCount,
        state: "unknown",
        warningThresholdPercent: warnPct,
        criticalThresholdPercent: critPct,
        growth: { granularity: "day", points: [] },
        forecast: null,
        largestFiles: []
      };
    }

    const usagePercent = roundTo(usage.usagePercent, 1);
    const state: StorageAnalyticsResponse["state"] =
      usagePercent >= critPct
        ? "critical"
        : usagePercent >= warnPct
          ? "warning"
          : "normal";

    const growthPoints = densifySeries(
      new Map(
        snapshots.map((s) => [
          s.capturedDate.toISOString().slice(0, 10),
          Number(s.recordingBytes)
        ])
      ),
      snapshots.length > 0 ? snapshots[0].capturedDate : new Date(),
      new Date(),
      "day"
    ).map((p, i, arr) => ({
      // carry-forward last known value across gap days
      date: p.date,
      value: p.value || (i > 0 ? arr[i - 1].value : 0)
    }));

    const forecast = forecastStorage(
      snapshots.map((s) => ({
        at: s.capturedDate,
        bytes: Number(s.recordingBytes)
      })),
      usage.limitBytes,
      warnPct,
      critPct
    );

    const largest = await this.prisma.liveSession.findMany({
      where: { recordingUrl: { not: null }, recordingBytes: { not: null } },
      orderBy: { recordingBytes: "desc" },
      take: 10,
      select: {
        classId: true,
        recordingBytes: true,
        recordingCompletedAt: true,
        createdAt: true,
        class: { select: { topic: true, title: true } }
      }
    });

    return {
      meta: buildMeta(range, false),
      available: true,
      usedBytes: usage.usedBytes,
      limitBytes: usage.limitBytes,
      remainingBytes: Math.max(0, usage.limitBytes - usage.usedBytes),
      usagePercent,
      recordingBytes,
      otherBytes:
        recordingBytes === null
          ? null
          : Math.max(0, usage.usedBytes - recordingBytes),
      recordingCount,
      state,
      warningThresholdPercent: warnPct,
      criticalThresholdPercent: critPct,
      growth: { granularity: "day", points: growthPoints },
      forecast,
      largestFiles: largest.map((r) => ({
        classId: r.classId,
        topic: r.class?.topic ?? r.class?.title ?? "Class",
        sizeBytes: Number(r.recordingBytes),
        createdAt: (r.recordingCompletedAt ?? r.createdAt).toISOString()
      }))
    };
  }
}
