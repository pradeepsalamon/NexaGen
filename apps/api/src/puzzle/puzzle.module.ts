import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AnalyticsEventModule } from "../analytics/analytics-event.module";
import { AssignmentModule } from "../assignment/assignment.module";
import { ChessAppearanceModule } from "../chess-appearance/chess-appearance.module";
import { LiveClassModule } from "../live-class/live-class.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProgressModule } from "../progress/progress.module";
import { TrashModule } from "../trash/trash.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { AssignmentPuzzleController } from "./assignment-puzzle.controller";
import { DailyPuzzleAnswerService } from "./daily-puzzle-answer.service";
import { DailyPuzzleController } from "./daily-puzzle.controller";
import { DailyPuzzleService } from "./daily-puzzle.service";
import { DailyPuzzleWhatsAppService } from "./daily-puzzle-whatsapp.service";
import { LiveClassPuzzleController } from "./live-class-puzzle.controller";
import { LiveClassPuzzleService } from "./live-class-puzzle.service";
import { PuzzleAttemptService } from "./puzzle-attempt.service";
import { PuzzleCatalogService } from "./puzzle-catalog.service";
import { PuzzleScoringSettingsService } from "./puzzle-scoring-settings.service";
import { PuzzleTopicService } from "./puzzle-topic.service";
import { PuzzleTrainingService } from "./puzzle-training.service";
import { PuzzleController } from "./puzzle.controller";
import { PuzzleService } from "./puzzle.service";

@Module({
  controllers: [PuzzleController, LiveClassPuzzleController, AssignmentPuzzleController, DailyPuzzleController],
  imports: [
    AnalyticsEventModule,
    AssignmentModule,
    ChessAppearanceModule,
    JwtModule,
    LiveClassModule,
    MessagingModule,
    PrismaModule,
    ProgressModule,
    TrashModule,
    WhatsAppModule
  ],
  providers: [
    PuzzleTopicService,
    PuzzleService,
    PuzzleAttemptService,
    PuzzleCatalogService,
    PuzzleScoringSettingsService,
    PuzzleTrainingService,
    DailyPuzzleAnswerService,
    DailyPuzzleService,
    DailyPuzzleWhatsAppService,
    LiveClassPuzzleService
  ],
  // The activity queue shares its puzzle items through the ordinary live puzzle.
  exports: [DailyPuzzleAnswerService, DailyPuzzleWhatsAppService, LiveClassPuzzleService, PuzzleCatalogService]
})
export class PuzzleModule {}
