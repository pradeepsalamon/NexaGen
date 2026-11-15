import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { REFERRAL_POINTS_EXPIRY_NOTICE_DAYS } from "@nexa-chess/types";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { ReferralCreditsService } from "./referral-credits.service";
import { ReferralSettingsService } from "./referral-settings.service";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Nightly: each academy's unspent points older than its `pointsExpiryDays` (off by default)
 * expire, then students with points expiring within `REFERRAL_POINTS_EXPIRY_NOTICE_DAYS` are
 * told (`REFERRAL_POINTS_EXPIRING`, at most once a week each through the dedupe key).
 */
@Injectable()
export class ReferralPointsExpiryScheduler {
  private readonly logger = new Logger(ReferralPointsExpiryScheduler.name);

  constructor(
    private readonly credits: ReferralCreditsService,
    private readonly jobLocks: JobLockService,
    private readonly settings: ReferralSettingsService,
    private readonly messaging: MessagingDispatchService
  ) {}

  @Cron("20 21 * * *") // 21:20 UTC, the small hours in India
  async sweep(): Promise<void> {
    try {
      await this.jobLocks.runForEachTenant(JOB_LOCKS.referralPointsExpiry, async (_signal, tenantId) => {
        const settings = await this.settings.find();
        if (!settings) return;
        const users = await this.credits.expirePoints(settings);
        if (users > 0) this.logger.log(`Referral points expired for ${users} users in academy ${tenantId}.`);
        await this.announceExpiring(settings);
      });
    } catch (error) {
      this.logger.error("Referral points expiry failed", error as Error);
    }
  }

  /** Exposed for tests. Awaited one by one, so the job's academy context covers every send. */
  async announceExpiring(settings: Parameters<ReferralCreditsService["expirePoints"]>[0], now = new Date()): Promise<number> {
    const expiring = await this.credits.pointsExpiringWithin(settings, REFERRAL_POINTS_EXPIRY_NOTICE_DAYS, now);
    const week = Math.floor(now.getTime() / WEEK_MS);
    for (const row of expiring) {
      try {
        await this.messaging.dispatch({ event: "REFERRAL_POINTS_EXPIRING", ...row, week });
      } catch (error) {
        this.logger.warn(`Points-expiry notice for ${row.userId} failed: ${(error as Error).message}`);
      }
    }
    return expiring.length;
  }
}
