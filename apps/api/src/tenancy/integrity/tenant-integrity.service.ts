import { ConflictException, Injectable, Logger, Optional } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Cron } from "@nestjs/schedule";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  DEFAULT_TENANT_ID,
  type TenantIntegrityLinkError,
  type TenantIntegrityRunSummary,
  type TenantIntegrityRunsResponse,
  type TenantIntegrityRunTrigger,
  type TenantIntegrityViolation,
  type TenantIntegrityViolationSample
} from "@nexa-chess/types";
import { Prisma, TenantIntegrityRunStatus, UserRole, UserStatus, type TenantIntegrityRun } from "@prisma/client";
import { authenticateUser } from "../../auth/authenticate";
import { MailService } from "../../mail/mail.service";
import { assertPlatformOperator } from "../../platform/platform-operator";
import { JOB_LOCKS, JobLockService } from "../../prisma/job-lock.service";
import { PrismaService } from "../../prisma/prisma.service";
import { asPlatform, runInTenant } from "../tenant-context";
import { countSql, DISCOVER_LINKS_SQL, sampleSql, summarizeFindings, type TenantLink } from "./tenant-integrity.rules";

/** 03:40 UTC: after the 02:00 usage snapshot, before the 04:00 retention sweep. */
export const TENANT_INTEGRITY_CRON = "0 40 3 * * *";
/** One relationship's query may not run longer than this; it is then reported, not fatal. */
const LINK_TIMEOUT_MS = 60_000;
const RUNS_SHOWN = 30;

export type TenantIntegrityResult = {
  linksChecked: number;
  violations: TenantIntegrityViolation[];
  errors: TenantIntegrityLinkError[];
};

/**
 * Nightly tenant integrity monitoring (rules and limits in
 * `tenant-integrity.rules.ts`). Read-only across every academy by design, so it
 * runs as platform, reports to platform operators and never changes data.
 */
@Injectable()
export class TenantIntegrityService {
  private readonly logger = new Logger(TenantIntegrityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobLocks: JobLockService,
    private readonly jwtService: JwtService,
    @Optional() private readonly mail?: MailService
  ) {}

  @Cron(TENANT_INTEGRITY_CRON, { timeZone: "UTC" })
  async nightly(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.tenantIntegrity, () => this.run("cron"), { ttlMs: 30 * 60_000 });
  }

  // ── Platform console ──

  async list(accessToken: string | undefined): Promise<TenantIntegrityRunsResponse> {
    assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const rows = await this.prisma.tenantIntegrityRun.findMany({ orderBy: { startedAt: "desc" }, take: RUNS_SHOWN });
    return { runs: rows.map(toSummary) };
  }

  /** "Run now" from the console: same check and alert as the nightly run, under the same lock. */
  async runNow(accessToken: string | undefined): Promise<TenantIntegrityRunSummary> {
    assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const outcome = await this.jobLocks.runExclusive(JOB_LOCKS.tenantIntegrity, () => this.run("manual"), {
      ttlMs: 30 * 60_000
    });
    if (!outcome.acquired) throw new ConflictException("The integrity check is already running. Try again in a few minutes.");
    return outcome.result;
  }

  // ── The check ──

  /** Checks every link, stores the run and alerts operators when something was found. */
  async run(trigger: TenantIntegrityRunTrigger): Promise<TenantIntegrityRunSummary> {
    const startedAt = new Date();
    let result: TenantIntegrityResult;
    try {
      result = await this.check();
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Tenant integrity check failed: ${message}`);
      const row = await this.store(trigger, startedAt, TenantIntegrityRunStatus.FAILED, {
        errors: [{ column: "*", message, table: "*" }],
        linksChecked: 0,
        violations: []
      });
      await this.alert(toSummary(row));
      return toSummary(row);
    }

    const status = result.errors.length
      ? TenantIntegrityRunStatus.FAILED
      : result.violations.length
        ? TenantIntegrityRunStatus.VIOLATIONS
        : TenantIntegrityRunStatus.OK;
    const row = await this.store(trigger, startedAt, status, result);
    const summary = toSummary(row);
    if (status === TenantIntegrityRunStatus.OK) {
      this.logger.log(`Tenant integrity check: ${result.linksChecked} relationships, nothing found`);
    } else {
      this.logger.error(
        `Tenant integrity check: ${summary.violationCount} cross-academy rows in ${result.violations.length} relationships, ${result.errors.length} not checked`
      );
      await this.alert(summary);
    }
    return summary;
  }

  /** The read-only part: discover the links, then count and sample each one. */
  async check(): Promise<TenantIntegrityResult> {
    const links = await this.discoverLinks();
    const violations: TenantIntegrityViolation[] = [];
    const errors: TenantIntegrityLinkError[] = [];
    for (const link of links) {
      try {
        const found = await this.checkLink(link);
        if (found) violations.push(found);
      } catch (error) {
        // One relationship failing (timeout, odd table) must not hide the rest.
        errors.push({ column: link.column, message: (error as Error).message.slice(0, 300), table: link.table });
      }
    }
    return { errors, linksChecked: links.length, violations };
  }

  discoverLinks(): Promise<TenantLink[]> {
    return asPlatform("tenant integrity: discover", () => this.prisma.$queryRawUnsafe<TenantLink[]>(DISCOVER_LINKS_SQL));
  }

  private checkLink(link: TenantLink): Promise<TenantIntegrityViolation | null> {
    return asPlatform(`tenant integrity: ${link.table}.${link.column}`, () =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${LINK_TIMEOUT_MS}`);
        const samples = await tx.$queryRawUnsafe<TenantIntegrityViolationSample[]>(sampleSql(link), DEFAULT_TENANT_ID);
        if (samples.length === 0) return null;
        const [{ count }] = await tx.$queryRawUnsafe<{ count: number }[]>(countSql(link), DEFAULT_TENANT_ID);
        return { column: link.column, count, parentTable: link.parentTable, samples, table: link.table };
      })
    );
  }

  private store(
    trigger: TenantIntegrityRunTrigger,
    startedAt: Date,
    status: TenantIntegrityRunStatus,
    result: TenantIntegrityResult
  ): Promise<TenantIntegrityRun> {
    return asPlatform("tenant integrity: store run", () =>
      this.prisma.tenantIntegrityRun.create({
        data: {
          errors: result.errors as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
          linksChecked: result.linksChecked,
          startedAt,
          status,
          trigger,
          violationCount: result.violations.reduce((sum, v) => sum + v.count, 0),
          violations: result.violations as unknown as Prisma.InputJsonValue
        }
      })
    );
  }

  /** Email to Nexa's platform operators. Never throws: the stored run is the record. */
  private async alert(run: TenantIntegrityRunSummary): Promise<void> {
    if (!this.mail?.isConfigured()) {
      this.logger.warn("Tenant integrity alert not emailed: SMTP is not configured (the run is stored).");
      return;
    }
    try {
      await runInTenant(DEFAULT_TENANT_ID, "tenant integrity: alert", async () => {
        const operators = await this.prisma.user.findMany({
          select: { email: true },
          where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE }
        });
        await this.mail!.sendTenantIntegrityAlert({
          link: `${getFrontendUrl(getApiEnv())}/admin/platform?tab=integrity`,
          linksChecked: run.linksChecked,
          summary: summarizeFindings(run.violations, run.errors),
          to: operators.map((operator) => operator.email).filter(Boolean),
          violationCount: run.violationCount
        });
      });
    } catch (error) {
      this.logger.error(`Tenant integrity alert email failed: ${(error as Error).message}`);
    }
  }
}

function toSummary(row: TenantIntegrityRun): TenantIntegrityRunSummary {
  return {
    errors: (row.errors ?? []) as unknown as TenantIntegrityLinkError[],
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    id: row.id,
    linksChecked: row.linksChecked,
    startedAt: row.startedAt.toISOString(),
    status: row.status,
    trigger: row.trigger === "manual" ? "manual" : "cron",
    violationCount: row.violationCount,
    violations: (row.violations ?? []) as unknown as TenantIntegrityViolation[]
  };
}
