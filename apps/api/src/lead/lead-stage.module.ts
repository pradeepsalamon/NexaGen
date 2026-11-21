import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ReferralModule } from "../referral/referral.module";
import { FrappeCrmPushService } from "./frappe-crm-push.service";
import { LeadDemoMissedService } from "./lead-demo-missed.service";
import { LeadStageService } from "./lead-stage.service";

/** Lead stages and their copy in Frappe CRM; its own module so demo booking and the live class can use it without the lead module. */
@Module({
  imports: [PrismaModule, ReferralModule],
  providers: [FrappeCrmPushService, LeadDemoMissedService, LeadStageService],
  exports: [FrappeCrmPushService, LeadStageService]
})
export class LeadStageModule {}
