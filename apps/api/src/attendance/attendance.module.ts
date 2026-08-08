import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { AttendanceService } from "./attendance.service";
import { AttendanceController } from "./attendance.controller";
import { AttendanceWebhookController } from "./attendance-webhook.controller";
import { LiveClassModule } from "../live-class/live-class.module";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}),
    forwardRef(() => LiveClassModule),
  ],
  controllers: [AttendanceController, AttendanceWebhookController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
