import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { LiveClassModule } from "../live-class/live-class.module";
import { MovePollModule } from "../move-poll/move-poll.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PuzzleActivityModule } from "../puzzle-activity/puzzle-activity.module";
import { PuzzleModule } from "../puzzle/puzzle.module";
import { ActivityQueueController } from "./activity-queue.controller";
import { ActivityQueueService } from "./activity-queue.service";

@Module({
  controllers: [ActivityQueueController],
  imports: [JwtModule, LiveClassModule, MovePollModule, PrismaModule, PuzzleActivityModule, PuzzleModule],
  providers: [ActivityQueueService]
})
export class ActivityQueueModule {}
