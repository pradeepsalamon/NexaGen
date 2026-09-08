import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ActivityTrackingInterceptor } from "../common/activity/activity-tracking.interceptor";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AnalyticsCache } from "./analytics-cache";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsEventModule } from "./analytics-event.module";
import { AnalyticsScheduler } from "./analytics.scheduler";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsTablesService } from "./analytics-tables.service";
import { BatchesAnalyticsSection } from "./sections/batches.section";
import { ClassesAnalyticsSection } from "./sections/classes.section";
import { CoachesAnalyticsSection } from "./sections/coaches.section";
import { OperationsAnalyticsSection } from "./sections/operations.section";
import { RecordingsAnalyticsSection } from "./sections/recordings.section";
import { UsersAnalyticsSection } from "./sections/users.section";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}),
    LiveClassModule,
    AnalyticsEventModule
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsCache,
    AnalyticsService,
    AnalyticsTablesService,
    AnalyticsScheduler,
    UsersAnalyticsSection,
    ClassesAnalyticsSection,
    CoachesAnalyticsSection,
    BatchesAnalyticsSection,
    RecordingsAnalyticsSection,
    OperationsAnalyticsSection,
    { provide: APP_INTERCEPTOR, useClass: ActivityTrackingInterceptor }
  ]
})
export class AnalyticsModule {}
