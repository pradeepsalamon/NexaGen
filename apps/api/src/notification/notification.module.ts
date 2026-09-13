import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";

@Module({
  controllers: [NotificationController],
  imports: [JwtModule, PrismaModule],
  providers: [NotificationService],
  exports: [NotificationService]
})
export class NotificationModule {}
