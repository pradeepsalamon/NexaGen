import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { TenantUsageSnapshot } from "@nexa-chess/types";
import type { Prisma } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { EntitlementService } from "../platform/entitlement.service";
import { assertPlatformOperator } from "../platform/platform-operator";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Usage counters per academy (docs/SAAS_MULTI_TENANCY.md §G "Enforcement";
 * Phase 6): a nightly snapshot of the same counts the plan limits use, for the
 * platform console. Limits are still checked against live counts inside the
 * creating transaction; this table is never the enforcement source.
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

  /** Counts one academy (call inside its TenantContext) and stores the snapshot. */
  async snapshotOne(tenantId: string): Promise<TenantUsageSnapshot> {
    const counts = (await this.entitlements.getUsage()) as Record<string, number>;
    const measuredAt = new Date();
    const data = { counts: counts as Prisma.InputJsonValue, measuredAt };
    await this.prisma.tenantUsage.upsert({ create: { ...data, tenantId }, update: data, where: { tenantId } });
    return { counts, measuredAt: measuredAt.toISOString(), tenantId };
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
}
