import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { WEEKLY_REPORT_BUILD_HOUR, addDays, mondayOf } from "@nexa-chess/types";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { academyMidnight } from "./weekly-report.facts";
import { WeeklyReportService, academyToday } from "./weekly-report.service";

/** Students built per academy per run; the next hour carries on. */
export const WEEKLY_REPORT_BATCH = 300;
const LOCK_TTL_MS = 30 * 60_000;

/**
 * The finished week due for reports at `now` in `timeZone`: last week's Monday
 * once this Monday has reached WEEKLY_REPORT_BUILD_HOUR (after the nightly play
 * review), else the week before it. A week is never built while still running.
 */
export function weekDueForReports(timeZone: string, now: Date): string {
  const thisMonday = mondayOf(academyToday(timeZone, now));
  const readyAt = academyMidnight(timeZone, thisMonday).getTime() + WEEKLY_REPORT_BUILD_HOUR * 3_600_000;
  return addDays(thisMonday, now.getTime() >= readyAt ? -7 : -14);
}

/**
 * Builds each academy's weekly reports (docs/WEEKLY_REPORTS.md): every hour,
 * per academy, the students still without a report for the last finished
 * week. Idempotent (one report per student and week); sends nothing.
 */
@Injectable()
export class WeeklyReportJob {
  private readonly logger = new Logger(WeeklyReportJob.name);

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly reports: WeeklyReportService
  ) {}

  @Cron("23 * * * *", { name: "weekly-reports" })
  async hourly(): Promise<void> {
    await this.jobLocks
      .runForEachTenant(
        JOB_LOCKS.weeklyReports,
        async (signal, tenantId) => {
          const built = await this.runForAcademy(signal);
          if (built > 0) this.logger.log(`${tenantId}: built ${built} weekly reports`);
        },
        { ttlMs: LOCK_TTL_MS }
      )
      .catch((error: unknown) => this.logger.error(`Weekly reports failed: ${(error as Error).message}`));
  }

  /** One academy's run (inside `runInTenant`). Returns the reports written. */
  async runForAcademy(signal: AbortSignal, now: Date = new Date()): Promise<number> {
    const timeZone = await this.reports.academyTimeZone();
    const weekStart = weekDueForReports(timeZone, now);
    const students = await this.reports.studentsWithoutReport(weekStart, WEEKLY_REPORT_BATCH);
    let built = 0;
    for (const studentId of students) {
      if (signal.aborted) break;
      try {
        if (await this.reports.buildWeek(studentId, weekStart, timeZone, now)) built += 1;
      } catch (error) {
        // One student's bad data never stops the others; the next run tries again.
        this.logger.warn(`Weekly report for ${studentId} (${weekStart}) failed: ${(error as Error).message}`);
      }
    }
    return built;
  }
}
