import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { LiveClassModule } from "../live-class/live-class.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StockfishModule } from "../stockfish/stockfish.module";
import { TrashModule } from "../trash/trash.module";
import { UploadModule } from "../upload/upload.module";
import { ActivityRunEventsService } from "./activity-run-events.service";
import { ActivityRunController } from "./activity-run.controller";
import { ActivityRunService } from "./activity-run.service";
import { LibraryActivityController } from "./library-activity.controller";
import { LibraryActivityService } from "./library-activity.service";
import { PlayoutGameService } from "./playout-game.service";

@Module({
  controllers: [LibraryActivityController, ActivityRunController],
  imports: [JwtModule, LiveClassModule, PrismaModule, StockfishModule, TrashModule, UploadModule],
  providers: [ActivityRunEventsService, ActivityRunService, LibraryActivityService, PlayoutGameService],
  // The activity queue starts and ends its MCQ / Playout items through the run service.
  exports: [ActivityRunService]
})
export class PuzzleActivityModule {}
