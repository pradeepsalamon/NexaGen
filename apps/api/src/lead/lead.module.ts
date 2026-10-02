import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DemoClassModule } from "../demo-class/demo-class.module";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LeadController } from "./lead.controller";
import { LeadService } from "./lead.service";

@Module({
  imports: [DemoClassModule, JwtModule.register({}), PrismaModule, MailModule],
  controllers: [LeadController],
  providers: [LeadService]
})
export class LeadModule {}
