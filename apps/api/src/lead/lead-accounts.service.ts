import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { LEAD_FINAL_STATUSES } from "@nexa-chess/types";
import { LeadStatus, OrderStatus, UserRole, UserStatus } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { phoneTail } from "./frappe-crm-push.service";
import { WHATSAPP_LEAD_REUSE_DAYS } from "./lead-constants";
import { LeadStageService } from "./lead-stage.service";

const DAY_MS = 24 * 60 * 60_000;
/** Registrations this recent are matched to a lead (the job runs every 10 minutes). */
export const LEAD_ACCOUNT_LINK_LOOKBACK_MS = 2 * DAY_MS;
/** Fewer digits than this is not a number worth matching on. */
const MIN_MATCH_DIGITS = 7;
const BATCH = 100;

/**
 * Follows a lead through the normal registration flow (docs/LEAD_STAGES.md "Registration
 * and enrolment"): a new student account is linked to its lead (same email, else the same
 * mobile number, a lead of the last 90 days not marked Lost), which moves it to Payment
 * pending; once that account is approved or has a paid order, the lead is Converted
 * (Frappe "Enrolled"). Only a CRM stage: nothing about the lead is shown to the account.
 */
@Injectable()
export class LeadAccountsService {
  constructor(
    private readonly jobLocks: JobLockService,
    private readonly leadStages: LeadStageService,
    private readonly prisma: PrismaService
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    await this.jobLocks.runForEachTenant(JOB_LOCKS.leadAccounts, async () => {
      await this.linkNewAccountsNow();
      await this.enrolNow();
    });
  }

  /** Inside one academy. Returns how many leads were linked. */
  async linkNewAccountsNow(now = new Date()): Promise<number> {
    const accounts = await this.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, email: true, id: true, phoneNumber: true, studentProfile: { select: { parentPhone: true } } },
      take: BATCH,
      where: { createdAt: { gte: new Date(now.getTime() - LEAD_ACCOUNT_LINK_LOOKBACK_MS) }, leads: { none: {} }, role: UserRole.STUDENT }
    });
    let linked = 0;
    for (const account of accounts) {
      const since = new Date(account.createdAt.getTime() - WHATSAPP_LEAD_REUSE_DAYS * DAY_MS);
      const open = { createdAt: { gte: since, lte: account.createdAt }, status: { not: LeadStatus.LOST }, userId: null };
      const byEmail = await this.prisma.lead.findFirst({
        orderBy: { createdAt: "desc" },
        select: { id: true },
        where: { ...open, email: { equals: account.email, mode: "insensitive" } }
      });
      const tails = [account.phoneNumber, account.studentProfile?.parentPhone]
        .map((phone) => (phone ? phoneTail(phone) : ""))
        .filter((tail) => tail.length >= MIN_MATCH_DIGITS);
      const byPhone =
        byEmail || tails.length === 0
          ? null
          : await this.prisma.lead.findFirst({
              orderBy: { createdAt: "desc" },
              select: { id: true },
              where: { ...open, OR: [...new Set(tails)].map((tail) => ({ phone: { endsWith: tail } })) }
            });
      const lead = byEmail ?? byPhone;
      if (!lead) continue;
      const claim = await this.prisma.lead.updateMany({ data: { userId: account.id }, where: { id: lead.id, userId: null } });
      if (claim.count === 0) continue;
      linked++;
      await this.leadStages.apply(lead.id, "REGISTERED", {
        activity: { description: `Matched by ${byEmail ? "email" : "mobile number"}.`, title: `Registered an account (${account.email})` }
      });
    }
    return linked;
  }

  /** Inside one academy. Linked leads whose account was approved or paid → Converted. */
  async enrolNow(): Promise<number> {
    const leads = await this.prisma.lead.findMany({
      select: { id: true },
      take: BATCH,
      where: {
        status: { notIn: [...LEAD_FINAL_STATUSES] },
        user: { OR: [{ status: UserStatus.ACTIVE }, { orders: { some: { status: OrderStatus.PAID } } }] }
      }
    });
    let moved = 0;
    for (const lead of leads) {
      if (await this.leadStages.apply(lead.id, "ENROLLED", { activity: { title: "Enrolled: the account was approved or paid" } })) moved++;
    }
    return moved;
  }
}
