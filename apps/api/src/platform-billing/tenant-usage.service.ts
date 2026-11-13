import { BadRequestException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  TENANT_USAGE_HISTORY_DEFAULT_DAYS,
  TENANT_USAGE_HISTORY_MAX_DAYS,
  type TenantUsageDayItem,
  type TenantUsageHistoryResponse,
  type TenantUsageMetricKey,
  type TenantUsageSnapshot
} from "@nexa-chess/types";
import {
  AttendanceEventType,
  DirectEmailStatus,
  GameAnalysisStatus,
  MessageChannel,
  MessageDeliveryStatus,
  type Prisma
} from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { EntitlementService } from "../platform/entitlement.service";
import { assertPlatformOperator } from "../platform/platform-operator";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days before yesterday the nightly run fills in when their row is missing (activity only). */
export const USAGE_BACKFILL_DAYS = 30;

type StorageCounts = Pick<Record<TenantUsageMetricKey, number>, "documentBytes" | "recordingBytes" | "storageBytes" | "uploadBytes">;
type ActivityCounts = Pick<
  Record<TenantUsageMetricKey, number>,
  "analysesCompleted" | "emailsSent" | "participantMinutes" | "whatsappSent"
>;

/** Midnight UTC of the day `date` falls in. */
export function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const ymd = (day: Date) => day.toISOString().slice(0, 10);

/**
 * Usage per academy (docs/SAAS_PLANS.md § "Usage history"): every night, the
 * plan-limit counts plus storage, live-class minutes, messages and engine
 * analyses, one row per academy per UTC day (`TenantUsageDay`), and the latest
 * in `TenantUsage`. For the platform console only. Limits are still checked
 * against live counts inside the creating transaction; nothing here is an
 * enforcement or billing source.
 */
@Injectable()
export class TenantUsageService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jobLocks: JobLockService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async snapshotCron(): Promise<void> {
    await this.jobLocks.runForEachTenant(JOB_LOCKS.tenantUsageSnapshot, (_signal, tenantId) => this.snapshotOne(tenantId));
  }

  /**
   * Measures one academy (call inside its TenantContext) for the UTC day that
   * ended before `now`, and stores it. A rerun replaces that day's row. Earlier
   * days with no row (the first run, a night the job missed) get their
   * activity counts, which existing rows still tell; the totals of a past day
   * can't be known, so those keys are left out.
   */
  async snapshotOne(tenantId: string, now: Date = new Date()): Promise<TenantUsageSnapshot> {
    const day = new Date(utcDayStart(now).getTime() - DAY_MS);
    const [limitCounts, storage, activity] = await Promise.all([
      this.entitlements.getUsage(),
      this.measureStorage(),
      this.measureActivity(day)
    ]);
    const counts: Record<string, number> = { ...limitCounts, ...storage, ...activity };
    await this.saveDay(tenantId, day, counts, now);
    await this.backfillActivity(tenantId, day, now);

    const data = { counts: counts as Prisma.InputJsonValue, measuredAt: now };
    await this.prisma.tenantUsage.upsert({ create: { ...data, tenantId }, update: data, where: { tenantId } });
    return { counts, measuredAt: now.toISOString(), tenantId };
  }

  async list(accessToken: string | undefined): Promise<{ usage: TenantUsageSnapshot[] }> {
    assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const rows = await this.prisma.tenantUsage.findMany({ orderBy: { tenantId: "asc" } });
    return {
      usage: rows.map((row) => ({
        counts: (row.counts ?? {}) as Record<string, number>,
        measuredAt: row.measuredAt.toISOString(),
        tenantId: row.tenantId
      }))
    };
  }

  /** Daily rows, oldest first, for one academy or all of them. */
  async history(
    accessToken: string | undefined,
    query: { days?: string; tenantId?: string }
  ): Promise<TenantUsageHistoryResponse> {
    assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const days = query.days === undefined ? TENANT_USAGE_HISTORY_DEFAULT_DAYS : Number(query.days);
    if (!Number.isInteger(days) || days < 1 || days > TENANT_USAGE_HISTORY_MAX_DAYS) {
      throw new BadRequestException(`days must be a whole number from 1 to ${TENANT_USAGE_HISTORY_MAX_DAYS}.`);
    }
    const from = new Date(utcDayStart(new Date()).getTime() - days * DAY_MS);
    const rows = await this.prisma.tenantUsageDay.findMany({
      orderBy: [{ day: "asc" }, { tenantId: "asc" }],
      where: { day: { gte: from }, ...(query.tenantId ? { tenantId: query.tenantId } : {}) }
    });
    return { days: rows.map(toDayItem) };
  }

  private async saveDay(tenantId: string, day: Date, counts: Record<string, number>, measuredAt: Date) {
    const data = { counts: counts as Prisma.InputJsonValue, measuredAt };
    await this.prisma.tenantUsageDay.upsert({
      create: { ...data, day, tenantId },
      update: data,
      where: { tenantId_day: { day, tenantId } }
    });
  }

  private async backfillActivity(tenantId: string, lastDay: Date, now: Date) {
    const tenant = await this.prisma.tenant.findUnique({ select: { createdAt: true }, where: { id: tenantId } });
    const earliest = Math.max(
      lastDay.getTime() - USAGE_BACKFILL_DAYS * DAY_MS,
      utcDayStart(tenant?.createdAt ?? lastDay).getTime()
    );
    const existing = await this.prisma.tenantUsageDay.findMany({
      select: { day: true },
      where: { day: { gte: new Date(earliest), lt: lastDay }, tenantId }
    });
    const have = new Set(existing.map((row) => row.day.getTime()));
    for (let time = earliest; time < lastDay.getTime(); time += DAY_MS) {
      if (have.has(time)) continue;
      const day = new Date(time);
      await this.saveDay(tenantId, day, await this.measureActivity(day), now);
    }
  }

  /** Bytes the academy holds right now. Every query is scoped to the current academy by the Prisma extension. */
  private async measureStorage(): Promise<StorageCounts> {
    const [recordings, invoices, creditNotes, payslips, attachments, uploads] = await Promise.all([
      this.prisma.liveSession.aggregate({ _sum: { recordingBytes: true }, where: { recordingUrl: { not: null } } }),
      this.prisma.invoice.aggregate({ _sum: { pdfBytes: true } }),
      this.prisma.creditNote.aggregate({ _sum: { pdfBytes: true } }),
      this.prisma.payslip.aggregate({ _sum: { pdfBytes: true } }),
      this.prisma.manualPaymentRecord.aggregate({ _sum: { attachmentSizeBytes: true } }),
      this.prisma.uploadedFile.aggregate({ _sum: { bytes: true } })
    ]);
    const recordingBytes = Number(recordings._sum.recordingBytes ?? 0);
    const documentBytes =
      (invoices._sum.pdfBytes ?? 0) +
      (creditNotes._sum.pdfBytes ?? 0) +
      (payslips._sum.pdfBytes ?? 0) +
      (attachments._sum.attachmentSizeBytes ?? 0);
    const uploadBytes = uploads._sum.bytes ?? 0;
    return { documentBytes, recordingBytes, storageBytes: recordingBytes + documentBytes + uploadBytes, uploadBytes };
  }

  /** What happened in the academy during one UTC day. */
  private async measureActivity(day: Date): Promise<ActivityCounts> {
    const during = { gte: day, lt: new Date(day.getTime() + DAY_MS) };
    const sent = { sentAt: during, status: MessageDeliveryStatus.SENT };
    const [students, coaches, ruleEmails, staffEmails, whatsappSent, analysesCompleted] = await Promise.all([
      this.prisma.attendanceLog.aggregate({ _sum: { sessionDuration: true }, where: { sessionEnd: during } }),
      // A coach's board time runs inside their class session: counting it would count those minutes twice.
      this.prisma.coachAttendanceLog.aggregate({
        _sum: { sessionDuration: true },
        where: { eventType: { notIn: [AttendanceEventType.BOARD_JOIN, AttendanceEventType.BOARD_LEAVE] }, sessionEnd: during }
      }),
      this.prisma.messageDelivery.count({ where: { ...sent, channel: MessageChannel.EMAIL } }),
      this.prisma.directEmail.count({ where: { sentAt: during, status: DirectEmailStatus.SENT } }),
      this.prisma.messageDelivery.count({ where: { ...sent, channel: MessageChannel.WHATSAPP } }),
      this.prisma.gameAnalysis.count({
        where: { completedAt: during, status: { in: [GameAnalysisStatus.COMPLETED, GameAnalysisStatus.PARTIAL] } }
      })
    ]);
    const seconds = (students._sum.sessionDuration ?? 0) + (coaches._sum.sessionDuration ?? 0);
    return {
      analysesCompleted,
      emailsSent: ruleEmails + staffEmails,
      participantMinutes: Math.round(seconds / 60),
      whatsappSent
    };
  }
}

function toDayItem(row: { counts: unknown; day: Date; measuredAt: Date; tenantId: string }): TenantUsageDayItem {
  return {
    counts: (row.counts ?? {}) as Record<string, number>,
    day: ymd(row.day),
    measuredAt: row.measuredAt.toISOString(),
    tenantId: row.tenantId
  };
}
