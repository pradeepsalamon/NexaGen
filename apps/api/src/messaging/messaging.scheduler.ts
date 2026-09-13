import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ClassStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingDispatchService } from "./messaging-dispatch.service";
import { MessagingRuleService } from "./messaging-rule.service";

const MINUTE_MS = 60_000;
/** One rule per side of the class, each with its own lead time and wording. */
const CLASS_REMINDER_EVENTS = ["CLASS_REMINDER", "CLASS_REMINDER_COACH"] as const;
/** Matches the cron interval below; overlap is harmless (deliveries dedupe). */
const CLASS_SWEEP_WINDOW_MINUTES = 5;

/**
 * The two rules that fire ahead of a moment rather than from an action.
 *
 * Both take an advisory lock first: the crons are only safe to run once per
 * tick, and a second API container would otherwise duplicate the sweep between
 * the dedupe read and the delivery write.
 */
@Injectable()
export class MessagingScheduler {
  private static readonly CLASS_REMINDER_LOCK_ID = 73_002_051;
  private static readonly DUE_SOON_LOCK_ID = 73_002_052;

  private readonly logger = new Logger(MessagingScheduler.name);

  constructor(
    private readonly dispatch: MessagingDispatchService,
    private readonly prisma: PrismaService,
    private readonly rules: MessagingRuleService
  ) {}

  /**
   * Classes whose start crosses a lead-time boundary in this tick.
   *
   * The student and coach reminders are separate rules with separate lead times
   * and wording, so each gets its own window: a class can be 30 minutes from a
   * student reminder and 60 from the coach's. The 5-minute cadence is the
   * accuracy — a 30-minute rule goes out between 30 and 35 minutes ahead.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async classReminders(): Promise<void> {
    await this.withLock(MessagingScheduler.CLASS_REMINDER_LOCK_ID, async () => {
      for (const event of CLASS_REMINDER_EVENTS) {
        await this.sweepClassReminder(event);
      }
    });
  }

  private async sweepClassReminder(
    event: (typeof CLASS_REMINDER_EVENTS)[number]
  ): Promise<void> {
    const rule = await this.rules.getRule(event);
    if (!rule.enabled) return;

    const lead = (rule.leadTimeMinutes ?? 30) * MINUTE_MS;
    const now = Date.now();
    const from = new Date(now + lead);
    const to = new Date(now + lead + CLASS_SWEEP_WINDOW_MINUTES * MINUTE_MS);

    const classes = await this.prisma.coachClass.findMany({
      where: { status: ClassStatus.SCHEDULED, startsAt: { gte: from, lt: to } },
      select: { id: true }
    });

    for (const cls of classes) {
      await this.dispatch.dispatch({ event, classId: cls.id });
    }

    if (classes.length > 0) {
      this.logger.log(`Queued ${event} for ${classes.length} class(es).`);
    }
  }

  /**
   * Unfinished assignments entering the lead-time window. Hourly, because the
   * default lead is a day — the dedupe key carries the due date, so a
   * rescheduled deadline reminds again and an unchanged one never does.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async assignmentDueReminders(): Promise<void> {
    await this.withLock(MessagingScheduler.DUE_SOON_LOCK_ID, async () => {
      const rule = await this.rules.getRule("ASSIGNMENT_DUE_SOON");
      if (!rule.enabled) return;

      const now = new Date();
      const until = new Date(
        now.getTime() + (rule.leadTimeMinutes ?? 24 * 60) * MINUTE_MS
      );

      const rows = await this.prisma.studentAssignment.findMany({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          assignmentBatch: { dueDate: { gt: now, lte: until } }
        },
        select: { id: true }
      });
      if (rows.length === 0) return;

      const summary = await this.dispatch.dispatch({
        event: "ASSIGNMENT_DUE_SOON",
        studentAssignmentIds: rows.map((row) => row.id)
      });

      this.logger.log(
        `Assignment due reminders queued: ${summary.queuedInApp} in-app, ${summary.queuedWhatsApp} WhatsApp.`
      );
    });
  }

  private async withLock(lockId: number, run: () => Promise<void>): Promise<void> {
    try {
      const [lock] = await this.prisma.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_lock(${lockId}) AS locked
      `;
      if (!lock?.locked) return;

      try {
        await run();
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
      }
    } catch (error) {
      this.logger.error("Messaging cron failed", error as Error);
    }
  }
}
