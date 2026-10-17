import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { UserModule } from "../user/user.module";
import { AccountDeletionService } from "./account-deletion.service";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

@Module({
  imports: [JwtModule.register({}), MailModule, PrismaModule, UserModule],
  controllers: [PrivacyController],
  providers: [AccountDeletionService, PrivacyService]
})
export class PrivacyModule {}
