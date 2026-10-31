import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { RetentionCategory } from "@nexa-chess/types";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { RetentionPolicyService } from "./retention-policy.service";
import {
  RETENTION_BATCH_SIZE,
  RETENTION_RULES,
  RETENTION_SWEEP_HOUR_UTC,
  deleteBatchSql,
  retentionCutoff,
  type RetentionRule
} from "./retention.rules";

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobLocks: JobLockService,
    private readonly policies: RetentionPolicyService
  ) {}

  @Cron(`0 ${RETENTION_SWEEP_HOUR_UTC} * * *`, { timeZone: "UTC" })
  async sweep(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.retentionSweep, () => this.pruneAll());
  }

  /** Fixed rules first, then every admin-set window. Keyed by table. */
  async pruneAll(now: Date = new Date()): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {};
    const run = async (rule: RetentionRule, category?: RetentionCategory) => {
      try {
        deleted[rule.table] = await this.prune(rule, now);
        if (category) await this.policies.recordSweep(category, deleted[rule.table], now);
      } catch (error) {
        // One table failing must not stop the rest.
        this.logger.error(`Retention sweep failed for ${rule.table}`, error instanceof Error ? error.stack : error);
      }
    };

    for (const rule of RETENTION_RULES) await run(rule);

    let configured: Awaited<ReturnType<RetentionPolicyService["activeRules"]>> = [];
    try {
      configured = await this.policies.activeRules();
    } catch (error) {
      this.logger.error("Could not read retention policies", error instanceof Error ? error.stack : error);
    }
    for (const { category, rule } of configured) await run(rule, category);

    const summary = Object.entries(deleted)
      .filter(([, count]) => count > 0)
      .map(([table, count]) => `${table}=${count}`);
    if (summary.length) this.logger.log(`Pruned ${summary.join(", ")}`);
    return deleted;
  }

  /** Small batches so the first run against a large backlog never holds long locks. */
  private async prune(rule: RetentionRule, now: Date): Promise<number> {
    const cutoff = retentionCutoff(rule.days, now);
    const sql = deleteBatchSql(rule);
    let total = 0;
    for (;;) {
      const count = await this.prisma.$executeRawUnsafe(sql, cutoff);
      total += count;
      if (count < RETENTION_BATCH_SIZE) return total;
    }
  }
}
