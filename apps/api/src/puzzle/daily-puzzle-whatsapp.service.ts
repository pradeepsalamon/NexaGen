import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { Cron, CronExpression } from "@nestjs/schedule";
import { JwtService } from "@nestjs/jwt";
import {
  describeSchedule,
  type DailyPuzzleLevel,
  type DailyPuzzlePictureResponse,
  type DailyPuzzleWhatsAppStatus,
  type DailyPuzzleWhatsAppSummary
} from "@nexa-chess/types";
import type { MessagingRule, User } from "@prisma/client";
import { ChessAppearanceService } from "../chess-appearance/chess-appearance.service";
import { assertValidFen } from "../assignment/assignment-evaluation.service";
import { dayToDate } from "../progress/progress-recorder.service";
import { runInTenant } from "../tenancy/tenant-context";
import { zonedYmd } from "../common/time";
import { ACTIVE_STUDENT_ACCOUNT, cancelQueuedDailyPuzzle, loadDailyPuzzleAudience } from "../messaging/daily-puzzle-deliveries";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { MessagingRuleService } from "../messaging/messaging-rule.service";
import { computeScheduledFor } from "../messaging/messaging.schedule";
import { maskPhoneNumber } from "../messaging/messaging.format";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { DailyPuzzleService } from "./daily-puzzle.service";
import {
  dailyPuzzlePictureKey,
  dailyPuzzlePicturePath,
  readDailyPuzzlePicture,
  signDailyPuzzlePicture
} from "./daily-puzzle-picture";
import { assertStudent, authenticateUser } from "./puzzle-auth.helper";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Puzzle of the Day on WhatsApp (docs/PUZZLE_OF_THE_DAY.md step 2).
 *
 * Who gets it: every student account's own phone, on by default; the
 * student's switch in the app is the only on/off (STOP still blocks every
 * proactive message). The one rule is `loadDailyPuzzleAudience`. Never a bare
 * WhatsApp contact, never a typed-in parent phone. A number on 2+ student
 * accounts gets it once, link only.
 *
 * When: the DAILY_PUZZLE messaging rule (admin: on/off, days, time, template),
 * read in the academy's time zone, the day being the academy's puzzle day.
 * Sending goes through MessagingDispatchService like every other rule.
 */
@Injectable()
export class DailyPuzzleWhatsAppService {
  private readonly logger = new Logger(DailyPuzzleWhatsAppService.name);

  private readonly pictureKey = dailyPuzzlePictureKey();

  constructor(
    private readonly appearance: ChessAppearanceService,
    private readonly dispatch: MessagingDispatchService,
    private readonly jobLocks: JobLockService,
    private readonly jwtService: JwtService,
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
    private readonly rules: MessagingRuleService,
    private readonly whatsapp: WhatsAppService
  ) {}

  // ── Student ──

  /** The switch on the student's Puzzle of the Day page (on unless they turned it off). */
  async statusFor(student: Pick<User, "id" | "phoneNumber">): Promise<DailyPuzzleWhatsAppStatus> {
    const phone = this.whatsapp.normalizeRecipient(student.phoneNumber);
    const [rule, profile, sharing] = await Promise.all([
      this.rules.getRule("DAILY_PUZZLE"),
      this.prisma.studentProfile.findUnique({ select: { dailyPuzzleWhatsAppOffAt: true }, where: { userId: student.id } }),
      phone ? this.otherAccountsOn(student.id, phone) : Promise.resolve(0)
    ]);
    const available = this.sending(rule);
    return {
      available,
      on: profile?.dailyPuzzleWhatsAppOffAt == null,
      phoneMasked: maskPhoneNumber(phone),
      schedule: available ? describeSchedule(rule) : null,
      sharedPhone: sharing > 0
    };
  }

  async setForStudent(accessToken: string | undefined, on: boolean): Promise<DailyPuzzleWhatsAppStatus> {
    const student = assertStudent(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const profile = await this.prisma.studentProfile.findUnique({ select: { id: true }, where: { userId: student.id } });
    if (!profile) throw new BadRequestException("Your student profile isn't set up yet. Please ask your academy.");
    if (on) {
      await this.prisma.studentProfile.update({ data: { dailyPuzzleWhatsAppOffAt: null }, where: { userId: student.id } });
    } else {
      // Keeps the first time it was turned off.
      await this.prisma.studentProfile.updateMany({
        data: { dailyPuzzleWhatsAppOffAt: new Date() },
        where: { dailyPuzzleWhatsAppOffAt: null, userId: student.id }
      });
      // Today's queued message stays when another student on the same number still wants it.
      const phone = this.whatsapp.normalizeRecipient(student.phoneNumber);
      if (phone) {
        const audience = await loadDailyPuzzleAudience(this.prisma, (raw) => this.whatsapp.normalizeRecipient(raw));
        if (!audience.numbers.some((n) => n.phone === phone)) await cancelQueuedDailyPuzzle(this.prisma, phone);
      }
    }
    return this.statusFor(student);
  }

  /** Other active student accounts on the same number (siblings): link only, no answering. */
  private async otherAccountsOn(studentId: string, phone: string): Promise<number> {
    const accounts = await this.prisma.user.findMany({
      select: { id: true, phoneNumber: true },
      where: { ...ACTIVE_STUDENT_ACCOUNT, id: { not: studentId }, phoneNumber: { not: null } }
    });
    return accounts.filter((a) => this.whatsapp.normalizeRecipient(a.phoneNumber) === phone).length;
  }

  // ── Admin ──

  /** Academy figures for the admin schedule page: whom it reaches, who turned it off, who has no usable phone. */
  async summary(): Promise<DailyPuzzleWhatsAppSummary> {
    const [rule, audience, settings] = await Promise.all([
      this.rules.getRule("DAILY_PUZZLE"),
      loadDailyPuzzleAudience(this.prisma, (raw) => this.whatsapp.normalizeRecipient(raw)),
      this.daily().whatsappSettings()
    ]);
    return {
      settings,
      noPhone: audience.noPhone,
      numbers: audience.numbers.length,
      schedule: describeSchedule(rule),
      sending: this.sending(rule),
      sharedNumbers: audience.numbers.filter((n) => n.studentId === null).length,
      students: audience.students,
      turnedOff: audience.turnedOff
    };
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

    const audience = await loadDailyPuzzleAudience(this.prisma, (raw) => this.whatsapp.normalizeRecipient(raw));
    if (audience.numbers.length === 0) return 0;
    // Picked before queueing, so the picture exists when Meta fetches it.
    const picturePath = await this.picturePathFor(tenantId, puzzleDay, audience.numbers[0].studentIds[0]);

    const summary = await this.dispatch.dispatch({ day: puzzleDay, event: "DAILY_PUZZLE", picturePath, timeZone });
    if (summary.queuedWhatsApp > 0) {
      this.logger.log(`Puzzle of the Day ${puzzleDay}: ${summary.queuedWhatsApp} WhatsApp message(s) queued.`);
    }
    return summary.queuedWhatsApp;
  }

  // ── The board picture (step 3) ──

  /**
   * The signed picture path of the academy-wide puzzle at the pictured level
   * (never a batch's own pick), picking it now if needed. Null = no signing key
   * or no puzzle at that level today: the message goes without a picture.
   */
  async picturePathFor(tenantId: string, day: string, actorId: string): Promise<string | null> {
    if (!this.pictureKey) return null;
    const { level } = await this.daily().whatsappSettings();
    const puzzleId = await this.daily().academyPuzzle(day, level, actorId);
    if (!puzzleId) return null;
    return dailyPuzzlePicturePath(signDailyPuzzlePicture({ day, level, puzzleId, tenantId }, this.pictureKey));
  }

  /** The day, level and puzzle of a picture link this service signed; null for anything else. */
  readPicture(token: string): { day: string; level: DailyPuzzleLevel; puzzleId: string; tenantId: string } | null {
    return this.pictureKey ? readDailyPuzzlePicture(token, this.pictureKey) : null;
  }

  /**
   * Public (the link is the credential): what the web app's image route draws.
   * Only a genuine, unexpired link to the academy's own puzzle of that day and
   * level; the position the student solves from, drawn from their side, in the
   * academy's board look. No solution, no student data.
   */
  async picture(token: string): Promise<DailyPuzzlePictureResponse> {
    const claims = this.readPicture(token);
    if (!claims) throw new NotFoundException("Picture not found.");
    return runInTenant(claims.tenantId, "dailyPuzzlePicture", async () => {
      const row = await this.prisma.dailyPuzzle.findFirst({
        select: { puzzle: { select: { fen: true } } },
        where: { day: dayToDate(claims.day), level: claims.level, puzzleId: claims.puzzleId, scopeKey: "academy" }
      });
      // Still one of the academy's own picks for that day and level (automatic or an admin's).
      if (!row) throw new NotFoundException("Picture not found.");
      const fen = assertValidFen(row.puzzle.fen);
      const look = await this.appearance.academyAppearance();
      return { boardTheme: look.boardThemeId, fen, flip: fen.split(" ")[1] === "b", pieceSet: look.pieceSetId };
    });
  }

  private daily(): DailyPuzzleService {
    // Resolved lazily: DailyPuzzleService also reads this service (the student's switch).
    return this.moduleRef.get(DailyPuzzleService, { strict: false });
  }

  /** The academy sends it: rule on, WhatsApp channel on, the academy's WhatsApp connected. */
  private sending(rule: MessagingRule): boolean {
    return rule.enabled && rule.whatsappEnabled && this.whatsapp.isConfigured();
  }
}
