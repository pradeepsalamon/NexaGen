import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AnalyticsEventModule } from "../analytics/analytics-event.module";
import { AssignmentModule } from "../assignment/assignment.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TrashModule } from "../trash/trash.module";
import { PuzzleAttemptService } from "./puzzle-attempt.service";
import { PuzzleTopicService } from "./puzzle-topic.service";
import { PuzzleController } from "./puzzle.controller";
import { PuzzleService } from "./puzzle.service";

@Module({
  controllers: [PuzzleController],
  imports: [AnalyticsEventModule, AssignmentModule, JwtModule, PrismaModule, TrashModule],
  providers: [PuzzleTopicService, PuzzleService, PuzzleAttemptService]
})
export class PuzzleModule {}
