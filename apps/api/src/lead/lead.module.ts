import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { LeadController } from "./lead.controller";
import { LeadService } from "./lead.service";

@Module({
  imports: [JwtModule.register({}), PrismaModule, MailModule, WhatsAppModule],
  controllers: [LeadController],
  providers: [LeadService]
})
export class LeadModule {}
