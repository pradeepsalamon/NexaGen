import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AnalyticsEventModule } from "../analytics/analytics-event.module";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MfaController } from "./mfa/mfa.controller";
import { MfaService } from "./mfa/mfa.service";

@Module({
  imports: [
    JwtModule.register({}),
    MailModule,
    PrismaModule,
    AnalyticsEventModule
  ],
  controllers: [AuthController, MfaController],
  providers: [AuthService, MfaService],
  exports: [AuthService]
})
export class AuthModule {}
