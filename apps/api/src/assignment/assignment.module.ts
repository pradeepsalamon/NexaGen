import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { StockfishModule } from "../stockfish/stockfish.module";
import { UploadModule } from "../upload/upload.module";
import { AssignmentAttemptService } from "./assignment-attempt.service";
import { AssignmentEvaluationService } from "./assignment-evaluation.service";
import { AssignmentController } from "./assignment.controller";
import { AssignmentService } from "./assignment.service";

@Module({
  controllers: [AssignmentController],
  imports: [JwtModule, PrismaModule, StockfishModule, UploadModule],
  providers: [AssignmentService, AssignmentAttemptService, AssignmentEvaluationService]
})
export class AssignmentModule {}
