import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { LeadStatus } from "@prisma/client";
import { SystemNotifier } from "../mail/system-notifier.service";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";

/** A lead younger than this may still be booked by the bot or by hand; not yet "waiting". */
export const AWAITING_DEMO_GRACE_MS = 2 * 60 * 60_000;
/** Older leads are left out (the list is about who to call now). */
export const AWAITING_DEMO_LOOKBACK_MS = 30 * 24 * 60 * 60_000;
/** At most this many lines; the count still says how many there are. */
export const AWAITING_DEMO_LIST_MAX = 20;

const NOT_BOOKED: LeadStatus[] = [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.INTERESTED];

type AwaitingLead = {
  experienceLevel: string;
  parentName: string;
  phone: string;
  status: LeadStatus;
  studentAge: number;
  studentName: string;
};

/** One line per lead, for the staff message. */
export function awaitingDemoLine(lead: AwaitingLead): string {
  const why = lead.status === LeadStatus.NO_SHOW ? "missed their demo" : "no demo time yet";
  return `${lead.studentName} (${lead.studentAge}, ${lead.experienceLevel}), parent ${lead.parentName}, ${lead.phone}: ${why}`;
}

/**
 * Once a day, tells staff which leads asked for a demo but have no demo class
 * (or missed theirs), so nobody is left waiting (docs/LEAD_STAGES.md). WhatsApp
 * leads also get the bot's own nudge; a website-form lead can't be messaged
 * first for free, so a person books them.
 */
@Injectable()
export class LeadAwaitingDemoService {
  constructor(
    private readonly jobLocks: JobLockService,
    private readonly notifier: SystemNotifier,
    private readonly prisma: PrismaService
  ) {}

  // 04:45 UTC = 10:15 in India, after the morning's bookings settle.
  @Cron("45 4 * * *")
  async sweep(): Promise<void> {
    await this.jobLocks.runForEachTenant(JOB_LOCKS.leadAwaitingDemo, () => this.announceNow());
  }

  /** Inside one academy. Returns how many leads were listed (0 = nothing sent). */
  async announceNow(now = new Date()): Promise<number> {
    const where = {
      createdAt: { gte: new Date(now.getTime() - AWAITING_DEMO_LOOKBACK_MS), lte: new Date(now.getTime() - AWAITING_DEMO_GRACE_MS) },
      OR: [{ assignedClassId: null, status: { in: NOT_BOOKED } }, { status: LeadStatus.NO_SHOW }]
    };
    const [count, leads] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        orderBy: { createdAt: "asc" },
        select: { experienceLevel: true, parentName: true, phone: true, status: true, studentAge: true, studentName: true },
        take: AWAITING_DEMO_LIST_MAX,
        where
      })
    ]);
    if (count === 0) return 0;
    const lines = leads.map(awaitingDemoLine);
    if (count > lines.length) lines.push(`…and ${count - lines.length} more on the Leads page.`);
    try {
      await this.notifier.send(
        "LEADS_AWAITING_DEMO_ADMIN",
        await this.notifier.adminAlertRecipients(),
        { "leads.awaitingCount": String(count), "leads.awaitingList": lines.join("\n") },
        { dedupeKey: now.toISOString().slice(0, 10) }
      );
    } catch {
      // The notifier logs its own failures; tomorrow's run lists them again.
    }
    return count;
  }
}
