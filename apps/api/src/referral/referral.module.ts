import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { ReferralAccessService } from "./referral-access.service";
import { ReferralAdminController } from "./referral-admin.controller";
import { ReferralAdminService } from "./referral-admin.service";
import { ReferralCreditsService } from "./referral-credits.service";
import { ReferralPipelineService } from "./referral-pipeline.service";
import { ReferralPointsExpiryScheduler } from "./referral-points-expiry.scheduler";
import { ReferralSettingsService } from "./referral-settings.service";
import { ReferralTrackerService } from "./referral-tracker.service";
import { ReferralVouchersService } from "./referral-vouchers.service";
import { ReferralController } from "./referral.controller";
import { ReferralService } from "./referral.service";

/** Referral program (docs/REFERRALS.md). Exports the tracker for leads and demo classes. */
@Module({
  controllers: [ReferralAdminController, ReferralController],
  exports: [ReferralTrackerService],
  imports: [JwtModule.register({}), MailModule, MessagingModule, PaymentsModule, PrismaModule, WhatsAppModule],
  providers: [
    ReferralAccessService,
    ReferralAdminService,
    ReferralCreditsService,
    ReferralPipelineService,
    ReferralPointsExpiryScheduler,
    ReferralService,
    ReferralSettingsService,
    ReferralTrackerService,
    ReferralVouchersService
  ]
})
export class ReferralModule {}
