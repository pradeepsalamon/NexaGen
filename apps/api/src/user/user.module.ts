import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { TrashModule } from "../trash/trash.module";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { MessagingModule } from "../messaging/messaging.module";
import { ReferralModule } from "../referral/referral.module";
import { MailModule } from "../mail/mail.module";
import { RosterImportService } from "./roster-import.service";

@Module({
  controllers: [UserController],
  imports: [JwtModule.register({}), MailModule, MessagingModule, PrismaModule, ReferralModule, TrashModule],
  providers: [RosterImportService, UserService],
  exports: [UserService]
})
export class UserModule { }
