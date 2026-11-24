import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ClassStatus, LeadStatus } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { LeadStageService } from "./lead-stage.service";

/** Demos that ended longer ago than this are left alone (no backfill of old bookings). */
export const DEMO_MISSED_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
const BATCH = 100;

/**
 * Marks a booked lead "Missed demo" once its demo class was held (COMPLETED)
 * and the guest never joined it (docs/LEAD_STAGES.md). A class that was never
 * held is the academy's miss, not the family's, so it changes nothing.
 */
@Injectable()
export class LeadDemoMissedService {
  constructor(
    private readonly jobLocks: JobLockService,
    private readonly leadStages: LeadStageService,
    private readonly prisma: PrismaService
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    await this.jobLocks.runForEachTenant(JOB_LOCKS.leadDemoMissed, () => this.markMissedNow());
  }

  /** Inside one academy. Returns how many leads moved. */
  async markMissedNow(now = new Date()): Promise<number> {
    const leads = await this.prisma.lead.findMany({
      select: {
        assignedClass: { select: { id: true, topic: true } },
        demoRegistrations: { select: { classId: true, joinedAt: true } },
        id: true
      },
      take: BATCH,
      where: {
        assignedClass: {
          endsAt: { gte: new Date(now.getTime() - DEMO_MISSED_LOOKBACK_MS) },
          isDemo: true,
          status: ClassStatus.COMPLETED
        },
        status: { in: [LeadStatus.DEMO_SCHEDULED, LeadStatus.DEMO_CONFIRMED] }
      }
    });
    let moved = 0;
    for (const lead of leads) {
      const demo = lead.assignedClass;
      if (!demo) continue;
      const joined = lead.demoRegistrations.some((registration) => registration.classId === demo.id && registration.joinedAt);
      if (joined) continue;
      const stage = await this.leadStages.apply(lead.id, "DEMO_MISSED", {
        activity: { title: `Missed demo class: ${demo.topic ?? "Demo class"}` }
      });
      if (stage) moved++;
    }
    return moved;
  }
}
