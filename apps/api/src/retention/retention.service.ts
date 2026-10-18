import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  RETENTION_BATCH_SIZE,
  RETENTION_RULES,
  type RetentionRule
} from "./retention.rules";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobLocks: JobLockService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweep(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.retentionSweep, () => this.pruneAll());
  }

  async pruneAll(now: Date = new Date()): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {};
    for (const rule of RETENTION_RULES) {
      try {
        deleted[rule.table] = await this.prune(rule, now);
      } catch (error) {
        // One table failing must not stop the rest.
        this.logger.error(`Retention sweep failed for ${rule.table}`, error instanceof Error ? error.stack : error);
      }
    }
    const summary = Object.entries(deleted)
      .filter(([, count]) => count > 0)
      .map(([table, count]) => `${table}=${count}`);
    if (summary.length) this.logger.log(`Pruned ${summary.join(", ")}`);
    return deleted;
  }

  /** Small batches so the first run against a large backlog never holds long locks. */
  private async prune(rule: RetentionRule, now: Date): Promise<number> {
    // Naive-UTC column: bind ISO text as ::timestamp, never a Date (CLAUDE.md §3.4).
    const cutoff = new Date(now.getTime() - rule.days * DAY_MS).toISOString();
    const extra = rule.where ? ` AND ${rule.where}` : "";
    const sql =
      `DELETE FROM "${rule.table}" WHERE "id" IN (` +
      `SELECT t."id" FROM "${rule.table}" t WHERE t."${rule.column}" < $1::timestamp${extra} ` +
      `LIMIT ${RETENTION_BATCH_SIZE})`;

    let total = 0;
    for (;;) {
      const count = await this.prisma.$executeRawUnsafe(sql, cutoff);
      total += count;
      if (count < RETENTION_BATCH_SIZE) return total;
    }
  }
}
