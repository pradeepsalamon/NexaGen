import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationController } from "./notification.controller";
import { NotificationScheduler } from "./notification.scheduler";
import { NotificationService } from "./notification.service";

@Module({
  controllers: [NotificationController],
  imports: [JwtModule, PrismaModule],
  providers: [NotificationService, NotificationScheduler],
  exports: [NotificationService]
})
export class NotificationModule {}
