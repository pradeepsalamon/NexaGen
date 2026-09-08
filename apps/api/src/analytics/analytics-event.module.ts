import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AnalyticsEventService } from "./analytics-event.service";

/**
 * Isolated so feature modules (auth, live-class, assignment) can record events
 * without importing the full `AnalyticsModule` (which depends on LiveClass +
 * Attendance and would create a cycle).
 */
@Module({
  imports: [PrismaModule],
  providers: [AnalyticsEventService],
  exports: [AnalyticsEventService]
})
export class AnalyticsEventModule {}
