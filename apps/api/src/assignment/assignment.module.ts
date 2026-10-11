import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AnalyticsEventModule } from "../analytics/analytics-event.module";
import { NotificationModule } from "../notification/notification.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProgressModule } from "../progress/progress.module";
import { StockfishModule } from "../stockfish/stockfish.module";
import { UploadModule } from "../upload/upload.module";
import { AssignmentAttemptService } from "./assignment-attempt.service";
import { AssignmentEvaluationService } from "./assignment-evaluation.service";
import { AssignmentPuzzleSetService } from "./assignment-puzzle-set.service";
import { AssignmentController } from "./assignment.controller";
import { AssignmentService } from "./assignment.service";
import { MessagingModule } from "../messaging/messaging.module";

@Module({
  controllers: [AssignmentController],
  imports: [
    AnalyticsEventModule,
    JwtModule,
    MessagingModule,
    NotificationModule,
    PrismaModule,
    ProgressModule,
    StockfishModule,
    UploadModule
  ],
  providers: [
    AssignmentService,
    AssignmentAttemptService,
    AssignmentEvaluationService,
    AssignmentPuzzleSetService
  ],
  exports: [AssignmentEvaluationService, AssignmentPuzzleSetService]
})
export class AssignmentModule {}
