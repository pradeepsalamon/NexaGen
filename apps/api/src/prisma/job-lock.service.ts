import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "./prisma.service";

/** Every cron's lock name lives here, so two jobs can never share one. */
export const JOB_LOCKS = {
  analyticsStorageSnapshot: "analytics.storage-snapshot",
  attendanceHeartbeatSweep: "attendance.heartbeat-sweep",
  attendanceRoomPresenceSweep: "attendance.room-presence-sweep",
  demoScheduleTopUp: "demo-schedule.top-up",
  invoiceEmailSweep: "invoice.email-sweep",
  invoicePdfSweep: "invoice.pdf-sweep",
  liveClassStaleSweep: "live-class.stale-sweep",
  messagingClassReminders: "messaging.class-reminders",
  messagingDueSoonReminders: "messaging.due-soon-reminders",
  paymentReconciliation: "payments.reconciliation",
  paymentWebhookRecovery: "payments.webhook-recovery",
  payslipPdfSweep: "payroll.payslip-pdf-sweep",
  refundReconciliation: "payments.refund-reconciliation",
  retentionSweep: "retention.sweep",
  trashCleanup: "trash.cleanup"
} as const;

export type JobLockName = (typeof JOB_LOCKS)[keyof typeof JOB_LOCKS];

export type JobLockOutcome<T> = { acquired: true; result: T } | { acquired: false };

const DEFAULT_TTL_MS = 5 * 60_000;

/**
 * Cluster-wide "only one runner" for crons, as a lease row in `job_locks`.
 *
 * Not a session advisory lock: Prisma pools connections, so the lock and the
 * unlock can land on different sessions — the unlock no-ops and the lock leaks
 * on a pooled connection, silently skipping the job on every other one. A
 * lease holds no connection while the job runs, expires if the process dies,
 * and is renewed every ttl/3 while the job is still going.
 */
@Injectable()
export class JobLockService {
  private readonly logger = new Logger(JobLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runExclusive<T>(
    name: JobLockName,
    run: () => Promise<T>,
    options: { ttlMs?: number } = {}
  ): Promise<JobLockOutcome<T>> {
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const owner = randomUUID();
    if (!(await this.acquire(name, owner, ttlMs))) {
      return { acquired: false };
    }

    const renewal = setInterval(() => {
      void this.renew(name, owner, ttlMs);
    }, Math.max(1_000, Math.floor(ttlMs / 3)));
    renewal.unref?.();

    try {
      return { acquired: true, result: await run() };
    } finally {
      clearInterval(renewal);
      await this.release(name, owner).catch((error: unknown) =>
        this.logger.warn(`Could not release job lock ${name}: ${(error as Error).message}`)
      );
    }
  }

  // Database time throughout (naive UTC, like every other timestamp column), so
  // instances with skewed clocks still agree on whether a lease has expired.
  private async acquire(name: string, owner: string, ttlMs: number): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ owner: string }[]>`
      INSERT INTO "job_locks" ("name", "owner", "acquiredAt", "lockedUntil")
      VALUES (
        ${name},
        ${owner},
        now() AT TIME ZONE 'UTC',
        (now() AT TIME ZONE 'UTC') + make_interval(secs => ${ttlMs / 1000})
      )
      ON CONFLICT ("name") DO UPDATE SET
        "owner" = EXCLUDED."owner",
        "acquiredAt" = EXCLUDED."acquiredAt",
        "lockedUntil" = EXCLUDED."lockedUntil"
      WHERE "job_locks"."lockedUntil" <= now() AT TIME ZONE 'UTC'
      RETURNING "owner"
    `;
    return rows[0]?.owner === owner;
  }

  private async renew(name: string, owner: string, ttlMs: number): Promise<void> {
    try {
      const count = await this.prisma.$executeRaw`
        UPDATE "job_locks"
        SET "lockedUntil" = (now() AT TIME ZONE 'UTC') + make_interval(secs => ${ttlMs / 1000})
        WHERE "name" = ${name} AND "owner" = ${owner}
      `;
      if (count === 0) {
        this.logger.warn(`Job lock ${name} lapsed while its job was still running`);
      }
    } catch (error) {
      this.logger.warn(`Could not renew job lock ${name}: ${(error as Error).message}`);
    }
  }

  private async release(name: string, owner: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "job_locks"
      SET "lockedUntil" = now() AT TIME ZONE 'UTC'
      WHERE "name" = ${name} AND "owner" = ${owner}
    `;
  }
}
