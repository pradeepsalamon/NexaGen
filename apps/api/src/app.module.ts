import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ResilientThrottlerStorage } from "./common/throttler/resilient-throttler-storage";
import { createThrottlerStorage } from "./common/throttler/throttler-storage.factory";
import { AuthModule } from "./auth/auth.module";
import { BatchModule } from "./batch/batch.module";
import { BatchScheduleModule } from "./batch-schedule/batch-schedule.module";
import { CoachModule } from "./coach/coach.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TrashModule } from "./trash/trash.module";
import { UserModule } from "./user/user.module";
import { LiveClassModule } from "./live-class/live-class.module";
import { AdminModule } from './admin/admin.module';
import { PresenceModule } from "./presence/presence.module";
import { StudentModule } from "./student/student.module";
import { ScheduleModule } from "@nestjs/schedule";
import { UploadModule } from "./upload/upload.module";
import { StockfishModule } from "./stockfish/stockfish.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { BackupModule } from "./backup/backup.module";
import { AssignmentModule } from "./assignment/assignment.module";
import { NotificationModule } from "./notification/notification.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { PuzzleModule } from "./puzzle/puzzle.module";
import { SimulModule } from "./simul/simul.module";
import { StudentMatchModule } from "./student-match/student-match.module";
import { MovePollModule } from "./move-poll/move-poll.module";
import { CourseModule } from "./course/course.module";
import { QueueModule } from "./queue/queue.module";
import { MessagingModule } from "./messaging/messaging.module";
import { AnnouncementModule } from "./announcement/announcement.module";
import { PaymentsModule } from "./payments/payments.module";
import { PayrollModule } from "./payroll/payroll.module";
import { ChessAppearanceModule } from "./chess-appearance/chess-appearance.module";
import { TypographyModule } from "./typography/typography.module";
import { ClassRequestModule } from "./class-request/class-request.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { ProgressModule } from "./progress/progress.module";
import { DemoClassModule } from "./demo-class/demo-class.module";
import { LeadModule } from "./lead/lead.module";
import { HealthModule } from "./health/health.module";
import { RetentionModule } from "./retention/retention.module";

@Module({
  imports: [
    SentryModule.forRoot(),
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const storage = createThrottlerStorage();
        return {
          throttlers: [{ ttl: 60000, limit: 100 }],
          ...(storage ? { storage: new ResilientThrottlerStorage(storage) } : {}),
        };
      },
    }),
    ScheduleModule.forRoot(),
    QueueModule.forRoot(),
    PrismaModule, 
    AuthModule, 
    BatchModule,
    BatchScheduleModule,
    CoachModule,
    TrashModule, 
    UserModule,
    LiveClassModule,
    AdminModule,
    PresenceModule,
    StudentModule,
    UploadModule,
    StockfishModule,
    AttendanceModule,
    BackupModule,
    AssignmentModule,
    NotificationModule,
    AnalyticsModule,
    PuzzleModule,
    SimulModule,
    StudentMatchModule,
    MovePollModule,
    CourseModule,
    MessagingModule,
    AnnouncementModule,
    PaymentsModule,
    PayrollModule,
    ChessAppearanceModule,
    TypographyModule,
    DemoClassModule,
    LeadModule,
    FeedbackModule,
    ClassRequestModule,
    ProgressModule,
    HealthModule,
    RetentionModule
  ],
  providers: [
    // Reports unexpected errors only; HttpExceptions (4xx, deliberate 5xx) are skipped.
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ]
})
export class AppModule {}
