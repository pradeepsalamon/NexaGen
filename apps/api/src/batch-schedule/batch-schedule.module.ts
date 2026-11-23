import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { BatchScheduleController } from "./batch-schedule.controller";
import { BatchScheduleService } from "./batch-schedule.service";

@Module({
  controllers: [BatchScheduleController],
  imports: [JwtModule, MessagingModule, PrismaModule],
  providers: [BatchScheduleService]
})
export class BatchScheduleModule {}
