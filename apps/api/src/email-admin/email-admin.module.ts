import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { EmailAdminController } from "./email-admin.controller";
import { EmailAdminService } from "./email-admin.service";
import { EmailVerificationService } from "./email-verification.service";

@Module({
  controllers: [EmailAdminController],
  exports: [EmailVerificationService],
  imports: [JwtModule.register({}), MailModule, PrismaModule],
  providers: [EmailAdminService, EmailVerificationService]
})
export class EmailAdminModule {}
