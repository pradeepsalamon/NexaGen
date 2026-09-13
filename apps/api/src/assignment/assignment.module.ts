import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AnalyticsEventModule } from "../analytics/analytics-event.module";
import { NotificationModule } from "../notification/notification.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StockfishModule } from "../stockfish/stockfish.module";
import { UploadModule } from "../upload/upload.module";
import { AssignmentAttemptService } from "./assignment-attempt.service";
import { AssignmentEvaluationService } from "./assignment-evaluation.service";
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
    StockfishModule,
    UploadModule
  ],
  providers: [AssignmentService, AssignmentAttemptService, AssignmentEvaluationService],
  exports: [AssignmentEvaluationService]
})
export class AssignmentModule {}
