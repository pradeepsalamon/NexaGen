import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import { SUPPORT_DEMO_ATTEND_PREFIX, SUPPORT_DEMO_MOVE_PREFIX, supportReplyText, type SupportReply } from "@nexa-chess/types";
import { ClassStatus, LeadStatus, Prisma } from "@prisma/client";
import { DEFAULT_TIME_ZONE, zonedDateToUtc, zonedYmd } from "../common/time";
import { demoInvitePath } from "../demo-class/demo-invite.service";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { WHATSAPP_REPLY_WINDOW_MS } from "./support-conversation.service";
import { SupportDemoSlotsService, supportSlotTitle } from "./support-demo-slots.service";
import { SupportOutboxService } from "./support-outbox.service";
import { SupportSettingsService, supportAnswersNumber } from "./support-settings.service";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** The evening reminder goes at this local hour, the day before the class. */
export const DEMO_EVENING_REMINDER_HOUR = 19;
/** Not later than this after 7 pm (a late job run never wakes a family at night). */
const EVENING_WINDOW_MS = 4 * HOUR_MS;
/** The last reminder: about an hour before, never in the last 10 minutes. */
const HOUR_REMINDER_LEAD_MS = 60 * MINUTE_MS;
const HOUR_REMINDER_LATEST_MS = 10 * MINUTE_MS;
/** A missed-demo message only for a demo that ended within this long. */
const MISSED_MESSAGE_WITHIN_MS = 24 * HOUR_MS;
/** A free-form message needs this much of the 24-hour window left (the outbox may retry). */
const WINDOW_MARGIN_MS = 30 * MINUTE_MS;
const BATCH = 50;

export type DemoReminderKind = "EVENING" | "HOUR";

/**
 * Which reminder a booking is due now, if any (docs/LEAD_STAGES.md). The evening one goes
 * from 7 pm local the day before (for 4 hours), only for a booking made before then and a
 * class more than 3 hours away; the hour one from 60 to 10 minutes before. Each once.
 */
export function demoReminderDue(
  booking: { createdAt: Date; eveningReminderAt: Date | null; hourReminderAt: Date | null; startsAt: Date; timeZone: string },
  now: Date
): DemoReminderKind | null {
  const untilStart = booking.startsAt.getTime() - now.getTime();
  if (untilStart <= HOUR_REMINDER_LATEST_MS) return null;
  if (untilStart <= HOUR_REMINDER_LEAD_MS) return booking.hourReminderAt ? null : "HOUR";
  if (booking.eveningReminderAt || booking.hourReminderAt || untilStart <= 3 * HOUR_MS) return null;
  const day = zonedYmd(booking.timeZone, booking.startsAt);
  const eveningAt = new Date(zonedDateToUtc(booking.timeZone, day.year, day.month, day.day - 1).getTime() + DEMO_EVENING_REMINDER_HOUR * HOUR_MS);
  const inWindow = now.getTime() >= eveningAt.getTime() && now.getTime() < eveningAt.getTime() + EVENING_WINDOW_MS;
  return inWindow && booking.createdAt.getTime() < eveningAt.getTime() ? "EVENING" : null;
}

type Booking = Prisma.DemoClassRegistrationGetPayload<{
  include: { class: { include: { demoSchedule: { select: { timezone: true } } } }; lead: true };
}>;

/**
 * WhatsApp demo reminders with [Yes, I'll attend] [Reschedule], and one "Sorry we missed you"
 * with [Pick a new time] (docs/LEAD_STAGES.md). Free-form inside the parent's 24-hour window
 * (through the bot's outbox, into their conversation); outside it only with an approved
 * template (SUPPORT_DEMO_*_TEMPLATE), else skipped. Only for numbers the bot answers, never
 * after STOP. The taps are handled by the bot (`SupportConversationService`).
 */
@Injectable()
export class SupportDemoRemindersService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(SupportDemoRemindersService.name);

  constructor(
    private readonly demoSlots: SupportDemoSlotsService,
    private readonly jobLocks: JobLockService,
    private readonly outbox: SupportOutboxService,
    private readonly prisma: PrismaService,
    private readonly settings: SupportSettingsService,
    private readonly whatsapp: WhatsAppService
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    await this.jobLocks.runForEachTenant(JOB_LOCKS.demoReminders, () => this.sendDueNow());
  }

  /** Inside one academy. Returns how many messages went out. */
  async sendDueNow(now = new Date()): Promise<number> {
    const settings = await this.settings.forBot();
    if (!settings.botEnabled) return 0;
    let sent = 0;

    const upcoming = await this.prisma.demoClassRegistration.findMany({
      include: { class: { include: { demoSchedule: { select: { timezone: true } } } }, lead: true },
      take: BATCH,
      where: {
        class: { isDemo: true, startsAt: { gt: new Date(now.getTime() + HOUR_REMINDER_LATEST_MS), lte: new Date(now.getTime() + 30 * HOUR_MS) }, status: ClassStatus.SCHEDULED },
        contactMethod: "PHONE",
        hourReminderAt: null,
        lead: { status: { in: [LeadStatus.DEMO_SCHEDULED, LeadStatus.DEMO_CONFIRMED] } }
      }
    });
    for (const booking of upcoming) {
      const kind = demoReminderDue(
        {
          createdAt: booking.createdAt,
          eveningReminderAt: booking.eveningReminderAt,
          hourReminderAt: booking.hourReminderAt,
          startsAt: booking.class.startsAt,
          timeZone: booking.class.demoSchedule?.timezone ?? DEFAULT_TIME_ZONE
        },
        now
      );
      // Someone who already said yes needs no "will you attend?" the evening before.
      if (!kind || (kind === "EVENING" && booking.lead?.status === LeadStatus.DEMO_CONFIRMED)) continue;
      if (await this.deliver(booking, kind, now, settings)) sent++;
    }

    const missed = await this.prisma.demoClassRegistration.findMany({
      include: { class: { include: { demoSchedule: { select: { timezone: true } } } }, lead: true },
      take: BATCH,
      where: {
        class: { endsAt: { gte: new Date(now.getTime() - MISSED_MESSAGE_WITHIN_MS) }, isDemo: true, status: ClassStatus.COMPLETED },
        contactMethod: "PHONE",
        joinedAt: null,
        lead: { status: LeadStatus.NO_SHOW },
        missedMessageAt: null
      }
    });
    for (const booking of missed) {
      // Only the booking the lead missed (not an older one).
      if (booking.lead?.assignedClassId !== booking.classId) continue;
      if (await this.deliver(booking, "MISSED", now, settings)) sent++;
    }
    return sent;
  }

  /** Claims the booking's reminder, then sends it. False when nothing went out. */
  private async deliver(
    booking: Booking,
    kind: DemoReminderKind | "MISSED",
    now: Date,
    settings: Awaited<ReturnType<SupportSettingsService["forBot"]>>
  ): Promise<boolean> {
    const field = kind === "EVENING" ? "eveningReminderAt" : kind === "HOUR" ? "hourReminderAt" : "missedMessageAt";
    const waId = this.whatsapp.normalizeRecipient(booking.phoneNumber ?? booking.contactValue);
    // Claimed first, whatever happens next: a reminder is never sent twice, and a number we
    // may not message is not looked at again.
    const claim = await this.prisma.demoClassRegistration.updateMany({ data: { [field]: now }, where: { id: booking.id, [field]: null } });
    if (claim.count === 0 || !waId || !booking.lead || !supportAnswersNumber(settings, waId)) return false;
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { waId } });
    if (contact?.optedOutAt) return false;

    const lead = booking.lead;
    const when = supportSlotTitle(booking.class.startsAt, booking.class.demoSchedule?.timezone ?? DEFAULT_TIME_ZONE);
    const reply = await this.message(booking, kind, when);
    const inWindow = !!contact?.lastInboundAt && now.getTime() - contact.lastInboundAt.getTime() < WHATSAPP_REPLY_WINDOW_MS - WINDOW_MARGIN_MS;
    const conversation = inWindow && contact
      ? await this.prisma.supportConversation.findFirst({ orderBy: { createdAt: "desc" }, where: { contactId: contact.id, status: { not: "CLOSED" } } })
      : null;

    try {
      if (conversation) {
        await this.prisma.supportMessage.create({
          data: {
            author: "BOT",
            body: supportReplyText(reply),
            clientKey: `demo-${kind.toLowerCase()}:${booking.id}`,
            conversationId: conversation.id,
            direction: "OUTBOUND",
            payload: reply.kind === "text" ? Prisma.JsonNull : (reply as unknown as Prisma.InputJsonValue),
            status: "PENDING"
          }
        });
        await this.outbox.sendPending(conversation.id);
      } else {
        const template = kind === "MISSED" ? this.env.SUPPORT_DEMO_MISSED_TEMPLATE : this.env.SUPPORT_DEMO_REMINDER_TEMPLATE;
        if (!template) return false;
        const buttons = kind === "MISSED" ? [`${SUPPORT_DEMO_MOVE_PREFIX}${booking.id}`] : [`${SUPPORT_DEMO_ATTEND_PREFIX}${booking.id}`, `${SUPPORT_DEMO_MOVE_PREFIX}${booking.id}`];
        await this.whatsapp.sendTemplate({
          components: [
            { parameters: [lead.parentName, lead.studentName, when].map((text) => ({ text, type: "text" as const })), type: "body" },
            ...buttons.map((payload, index) => ({
              index: String(index),
              parameters: [{ payload, type: "payload" as const }],
              sub_type: "quick_reply" as const,
              type: "button" as const
            }))
          ],
          language: this.env.SUPPORT_DEMO_TEMPLATE_LANGUAGE,
          name: template,
          to: waId
        });
      }
      await this.prisma.leadActivity.create({
        data: {
          activityType: "DEMO_REMINDER",
          leadId: lead.id,
          title: kind === "MISSED" ? "Sent \"sorry we missed you\" on WhatsApp" : kind === "EVENING" ? "Sent the evening-before demo reminder on WhatsApp" : "Sent the 1-hour demo reminder on WhatsApp"
        }
      });
      return true;
    } catch (error) {
      this.logger.warn(`Demo ${kind.toLowerCase()} message for booking ${booking.id} not sent: ${(error as Error).message}`);
      return false;
    }
  }

  private async message(booking: Booking, kind: DemoReminderKind | "MISSED", when: string): Promise<SupportReply> {
    const lead = booking.lead!;
    const attend = { id: `${SUPPORT_DEMO_ATTEND_PREFIX}${booking.id}`, title: "Yes, I'll attend" };
    const move = { id: `${SUPPORT_DEMO_MOVE_PREFIX}${booking.id}`, title: "Reschedule" };
    if (kind === "MISSED") {
      return {
        body: `Hi ${lead.parentName}, we missed ${lead.studentName} at the free demo class (${when}). No problem: pick a new time that suits you.`,
        buttons: [{ id: move.id, title: "Pick a new time" }],
        kind: "buttons"
      };
    }
    if (kind === "EVENING") {
      return { body: `Hi ${lead.parentName}, a reminder: ${lead.studentName}'s free demo class is tomorrow, ${when}. Will you attend?`, buttons: [attend, move], kind: "buttons" };
    }
    const origin = await this.demoSlots.academyOrigin();
    const link = origin && booking.inviteToken ? ` Join from this link: ${origin}${demoInvitePath(booking.classId, booking.inviteToken)}` : "";
    const body = `Hi ${lead.parentName}, ${lead.studentName}'s free demo class starts in about an hour (${when}).${link}`;
    return lead.status === LeadStatus.DEMO_CONFIRMED ? { body, kind: "text" } : { body: `${body}\nWill you attend?`, buttons: [attend, move], kind: "buttons" };
  }
}
