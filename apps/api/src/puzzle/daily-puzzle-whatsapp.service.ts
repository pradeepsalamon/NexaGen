import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { JwtService } from "@nestjs/jwt";
import {
  describeSchedule,
  type DailyPuzzleWhatsAppStatus,
  type DailyPuzzleWhatsAppSummary
} from "@nexa-chess/types";
import { Prisma, UserRole, UserStatus, type MessagingRule, type User } from "@prisma/client";
import { zonedYmd } from "../common/time";
import { cancelQueuedDailyPuzzle } from "../messaging/daily-puzzle-deliveries";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { MessagingRuleService } from "../messaging/messaging-rule.service";
import { computeScheduledFor } from "../messaging/messaging.schedule";
import { maskPhoneNumber } from "../messaging/messaging.format";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { assertStudent, authenticateUser } from "./puzzle-auth.helper";

const HOUR_MS = 60 * 60 * 1000;

/** A student whose Puzzle of the Day is on: a batch with training and the daily puzzle on. */
const DAILY_PUZZLE_STUDENT: Prisma.UserWhereInput = {
  isDeleted: false,
  role: UserRole.STUDENT,
  status: UserStatus.ACTIVE,
  studentBatches: {
    some: { batch: { dailyPuzzleEnabled: true, isDeleted: false, puzzleTrainingEnabled: true }, isDeleted: false }
  }
};

/**
 * Puzzle of the Day on WhatsApp (docs/PUZZLE_OF_THE_DAY.md step 2).
 *
 * Who gets it: a student who turned it on in the app (to the account's own
 * phone), and any number that sent PUZZLE to the academy's WhatsApp (the bot
 * records that on `WhatsAppContact.dailyPuzzleAt`). Nobody else, and never a
 * typed-in parent phone. The message names no student (a keyword number is not
 * proven to be the student's family), so it is only a nudge with a link.
 *
 * When: the DAILY_PUZZLE messaging rule (admin: on/off, days, time, template),
 * read in the academy's time zone, the day being the academy's puzzle day.
 * Sending goes through MessagingDispatchService like every other rule.
 */
@Injectable()
export class DailyPuzzleWhatsAppService {
  private readonly logger = new Logger(DailyPuzzleWhatsAppService.name);

  constructor(
    private readonly dispatch: MessagingDispatchService,
    private readonly jobLocks: JobLockService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly rules: MessagingRuleService,
    private readonly whatsapp: WhatsAppService
  ) {}

  // ── Student ──

  /** The switch on the student's Puzzle of the Day page. */
  async statusFor(student: Pick<User, "id" | "phoneNumber">): Promise<DailyPuzzleWhatsAppStatus> {
    const [rule, profile] = await Promise.all([
      this.rules.getRule("DAILY_PUZZLE"),
      this.prisma.studentProfile.findUnique({ select: { dailyPuzzleWhatsAppAt: true }, where: { userId: student.id } })
    ]);
    const available = this.sending(rule);
    const phone = this.whatsapp.normalizeRecipient(student.phoneNumber);
    return {
      available,
      on: profile?.dailyPuzzleWhatsAppAt != null,
      phoneMasked: maskPhoneNumber(phone),
      schedule: available ? describeSchedule(rule) : null
    };
  }

  async setForStudent(accessToken: string | undefined, on: boolean): Promise<DailyPuzzleWhatsAppStatus> {
    const student = assertStudent(await authenticateUser(this.jwtService, this.prisma, accessToken));
    if (on) {
      if (!this.sending(await this.rules.getRule("DAILY_PUZZLE"))) {
        throw new BadRequestException("Your academy doesn't send Puzzle of the Day on WhatsApp.");
      }
      if (!this.whatsapp.normalizeRecipient(student.phoneNumber)) {
        throw new BadRequestException("Add your WhatsApp number to your profile first.");
      }
      const profile = await this.prisma.studentProfile.findUnique({ select: { id: true }, where: { userId: student.id } });
      if (!profile) throw new BadRequestException("Your student profile isn't set up yet. Please ask your academy.");
      // Keeps the first time it was turned on.
      await this.prisma.studentProfile.updateMany({
        data: { dailyPuzzleWhatsAppAt: new Date() },
        where: { dailyPuzzleWhatsAppAt: null, userId: student.id }
      });
    } else {
      await this.prisma.studentProfile.updateMany({ data: { dailyPuzzleWhatsAppAt: null }, where: { userId: student.id } });
      await cancelQueuedDailyPuzzle(this.prisma, { recipientId: student.id });
    }
    return this.statusFor(student);
  }

  // ── Admin ──

  /** Academy figures for the admin schedule page: how many numbers it would reach. */
  async summary(): Promise<DailyPuzzleWhatsAppSummary> {
    const [rule, appStudents, keywordNumbers] = await Promise.all([
      this.rules.getRule("DAILY_PUZZLE"),
      this.prisma.user.count({
        where: { ...DAILY_PUZZLE_STUDENT, studentProfile: { dailyPuzzleWhatsAppAt: { not: null } } }
      }),
      this.prisma.whatsAppContact.count({ where: { dailyPuzzleAt: { not: null }, optedOutAt: null } })
    ]);
    return { appStudents, keywordNumbers, schedule: describeSchedule(rule), sending: this.sending(rule) };
  }

  // ── Sending ──

  /**
   * Hourly, per academy: within the hour before the rule's next send time,
   * queue one message per number for that academy day. Re-runs collide on the
   * delivery dedupe key (number + day), so an overlap never sends twice.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async queueDue(): Promise<void> {
    try {
      await this.jobLocks.runForEachTenant(JOB_LOCKS.dailyPuzzleWhatsApp, () => this.queueForAcademy());
    } catch (error) {
      this.logger.error("Puzzle of the Day WhatsApp sweep failed", error as Error);
    }
  }

  /** One academy's sweep (inside its tenant). Returns how many numbers were queued. */
  async queueForAcademy(now: Date = new Date()): Promise<number> {
    const rule = await this.rules.getRule("DAILY_PUZZLE");
    if (!this.sending(rule)) return 0;
    const tenantId = requireTenantId("dailyPuzzle");
    const [tenant, settings] = await Promise.all([
      this.prisma.tenant.findUnique({ select: { timezone: true }, where: { id: tenantId } }),
      this.prisma.dailyPuzzleSettings.findUnique({ select: { enabled: true }, where: { tenantId } })
    ]);
    if (settings && !settings.enabled) return 0;

    const timeZone = tenant?.timezone ?? "Asia/Kolkata";
    const sendAt = computeScheduledFor(rule, timeZone, now);
    if (sendAt.getTime() - now.getTime() > HOUR_MS) return 0;
    const { year, month, day } = zonedYmd(timeZone, sendAt);
    const puzzleDay = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const [students, contacts] = await Promise.all([
      this.prisma.user.findMany({
        select: { id: true },
        where: { ...DAILY_PUZZLE_STUDENT, studentProfile: { dailyPuzzleWhatsAppAt: { not: null } } }
      }),
      this.prisma.whatsAppContact.findMany({
        select: { id: true },
        where: { dailyPuzzleAt: { not: null }, optedOutAt: null }
      })
    ]);
    if (students.length === 0 && contacts.length === 0) return 0;

    const summary = await this.dispatch.dispatch({
      contactIds: contacts.map((c) => c.id),
      day: puzzleDay,
      event: "DAILY_PUZZLE",
      studentIds: students.map((s) => s.id),
      timeZone
    });
    if (summary.queuedWhatsApp > 0) {
      this.logger.log(`Puzzle of the Day ${puzzleDay}: ${summary.queuedWhatsApp} WhatsApp message(s) queued.`);
    }
    return summary.queuedWhatsApp;
  }

  /** The academy sends it: rule on, WhatsApp channel on, the academy's WhatsApp connected. */
  private sending(rule: MessagingRule): boolean {
    return rule.enabled && rule.whatsappEnabled && this.whatsapp.isConfigured();
  }
}
