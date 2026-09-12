import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
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
import { QueueModule } from "./queue/queue.module";

@Module({
  imports: [
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
    StudentModule,
    UploadModule,
    StockfishModule,
    AttendanceModule,
    BackupModule,
    AssignmentModule,
    NotificationModule,
    AnalyticsModule,
    PuzzleModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ]
})
export class AppModule {}
