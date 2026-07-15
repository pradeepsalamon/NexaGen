import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { BatchModule } from "./batch/batch.module";
import { CoachModule } from "./coach/coach.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TrashModule } from "./trash/trash.module";
import { UserModule } from "./user/user.module";
import { LiveClassModule } from "./live-class/live-class.module";
import { AdminModule } from './admin/admin.module';
import { StudentModule } from "./student/student.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    PrismaModule, 
    AuthModule, 
    BatchModule, 
    CoachModule,
    TrashModule, 
    UserModule,
    LiveClassModule,
    AdminModule,
    StudentModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ]
})
export class AppModule {}
