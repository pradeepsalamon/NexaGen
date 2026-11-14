import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { DemoInviteService } from "./demo-invite.service";
import { DemoScheduleController } from "./demo-schedule.controller";
import { DemoScheduleService } from "./demo-schedule.service";

@Module({
  imports: [JwtModule.register({}), PrismaModule, MailModule, WhatsAppModule],
  controllers: [DemoScheduleController],
  providers: [DemoInviteService, DemoScheduleService],
  exports: [DemoInviteService]
})
export class DemoClassModule {}
