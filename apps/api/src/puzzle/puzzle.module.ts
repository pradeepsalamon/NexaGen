import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AnalyticsEventModule } from "../analytics/analytics-event.module";
import { AssignmentModule } from "../assignment/assignment.module";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProgressModule } from "../progress/progress.module";
import { TrashModule } from "../trash/trash.module";
import { LiveClassPuzzleController } from "./live-class-puzzle.controller";
import { LiveClassPuzzleService } from "./live-class-puzzle.service";
import { PuzzleAttemptService } from "./puzzle-attempt.service";
import { PuzzleScoringSettingsService } from "./puzzle-scoring-settings.service";
import { PuzzleTopicService } from "./puzzle-topic.service";
import { PuzzleController } from "./puzzle.controller";
import { PuzzleService } from "./puzzle.service";

@Module({
  controllers: [PuzzleController, LiveClassPuzzleController],
  imports: [
    AnalyticsEventModule,
    AssignmentModule,
    JwtModule,
    LiveClassModule,
    PrismaModule,
    ProgressModule,
    TrashModule
  ],
  providers: [
    PuzzleTopicService,
    PuzzleService,
    PuzzleAttemptService,
    PuzzleScoringSettingsService,
    LiveClassPuzzleService
  ]
})
export class PuzzleModule {}
