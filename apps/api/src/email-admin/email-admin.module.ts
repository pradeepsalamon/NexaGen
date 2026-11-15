import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { EmailAdminController } from "./email-admin.controller";
import { EmailAdminService } from "./email-admin.service";
import { EmailPreferencesController } from "./email-preferences.controller";
import { EmailPreferencesService } from "./email-preferences.service";
import { EmailVerificationService } from "./email-verification.service";

@Module({
  controllers: [EmailAdminController, EmailPreferencesController],
  exports: [EmailPreferencesService, EmailVerificationService],
  imports: [JwtModule.register({}), MailModule, PrismaModule],
  providers: [EmailAdminService, EmailPreferencesService, EmailVerificationService]
})
export class EmailAdminModule {}
