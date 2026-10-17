import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { AttendanceMonitoringService } from "./attendance-monitoring.service";
import { AttendanceReportService } from "./attendance-report.service";
import { AttendanceRoomPresenceService } from "./attendance-room-presence.service";
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
  providers: [
    AttendanceService,
    AttendanceReportService,
    AttendanceMonitoringService,
    AttendanceRoomPresenceService
  ],
  exports: [AttendanceService, AttendanceReportService],
})
export class AttendanceModule {}
