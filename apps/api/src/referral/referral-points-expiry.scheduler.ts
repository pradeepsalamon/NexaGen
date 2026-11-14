import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { ReferralCreditsService } from "./referral-credits.service";
import { ReferralSettingsService } from "./referral-settings.service";

/** Nightly: each academy's unspent points older than its `pointsExpiryDays` (off by default). */
@Injectable()
export class ReferralPointsExpiryScheduler {
  private readonly logger = new Logger(ReferralPointsExpiryScheduler.name);

  constructor(
    private readonly credits: ReferralCreditsService,
    private readonly jobLocks: JobLockService,
    private readonly settings: ReferralSettingsService
  ) {}

  @Cron("20 21 * * *") // 21:20 UTC, the small hours in India
  async sweep(): Promise<void> {
    try {
      await this.jobLocks.runForEachTenant(JOB_LOCKS.referralPointsExpiry, async (_signal, tenantId) => {
        const settings = await this.settings.find();
        if (!settings) return;
        const users = await this.credits.expirePoints(settings);
        if (users > 0) this.logger.log(`Referral points expired for ${users} users in academy ${tenantId}.`);
      });
    } catch (error) {
      this.logger.error("Referral points expiry failed", error as Error);
    }
  }
}
