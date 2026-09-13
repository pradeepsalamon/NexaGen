import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AnalyticsEventModule } from "../analytics/analytics-event.module";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MessagingModule } from "../messaging/messaging.module";

@Module({
  imports: [
    JwtModule.register({}),
    MailModule,
    MessagingModule,
    PrismaModule,
    AnalyticsEventModule
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService]
})
export class AuthModule {}
