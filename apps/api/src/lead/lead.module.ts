import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DemoClassModule } from "../demo-class/demo-class.module";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ReferralModule } from "../referral/referral.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { LeadController } from "./lead.controller";
import { LeadStageModule } from "./lead-stage.module";
import { LeadAwaitingDemoService } from "./lead-awaiting-demo.service";
import { LeadFunnelService } from "./lead-funnel.service";
import { LeadService } from "./lead.service";
import { TrashModule } from "../trash/trash.module";

@Module({
  imports: [DemoClassModule, JwtModule.register({}), LeadStageModule, PrismaModule, MailModule, ReferralModule, TrashModule, WhatsAppModule],
  controllers: [LeadController],
  providers: [LeadAwaitingDemoService, LeadFunnelService, LeadService],
  exports: [LeadStageModule, LeadService]
})
export class LeadModule {}
