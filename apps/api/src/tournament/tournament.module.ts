import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ApprovalModule } from "../approval/approval.module";
import { GameLibraryModule } from "../game-library/game-library.module";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaModule } from "../prisma/prisma.module";
import { TrashModule } from "../trash/trash.module";
import { UploadModule } from "../upload/upload.module";
import { TournamentAccessService } from "./tournament-access.service";
import { TournamentAdminController } from "./tournament-admin.controller";
import { TournamentArchiverService } from "./tournament-archiver.service";
import { TournamentBroadcastController } from "./tournament-broadcast.controller";
import { TournamentCommentaryService } from "./tournament-commentary.service";
import { TournamentAuditService } from "./tournament-audit.service";
import { TournamentEngineService } from "./tournament-engine.service";
import { TournamentEventsService } from "./tournament-events.service";
import { TournamentGameService } from "./tournament-game.service";
import { TournamentRunnerService } from "./tournament-runner.service";
import { TournamentScheduler } from "./tournament.scheduler";
import { TournamentRegistrationService } from "./tournament-registration.service";
import { TournamentSettingsService } from "./tournament-settings.service";
import { TournamentPlayController } from "./tournament-play.controller";
import { TournamentPublicController } from "./tournament-public.controller";
import { TournamentPublicService } from "./tournament-public.service";
import { TournamentRealtimeService } from "./tournament-realtime.service";
import { TournamentController } from "./tournament.controller";
import { TournamentService } from "./tournament.service";

/** Tournaments (docs/TOURNAMENTS.md). */
@Module({
  controllers: [TournamentAdminController, TournamentBroadcastController, TournamentController, TournamentPlayController, TournamentPublicController],
  exports: [TournamentAccessService, TournamentAuditService, TournamentEventsService, TournamentGameService, TournamentRunnerService, TournamentSettingsService],
  imports: [ApprovalModule, GameLibraryModule, JwtModule, PrismaModule, TrashModule, UploadModule],
  providers: [
    // Stateless LiveKit clients; its own instance, so this module doesn't pull in the live-class room.
    LiveKitService,
    TournamentAccessService,
    TournamentArchiverService,
    TournamentAuditService,
    TournamentCommentaryService,
    TournamentEngineService,
    TournamentEventsService,
    TournamentGameService,
    TournamentPublicService,
    TournamentRealtimeService,
    TournamentRegistrationService,
    TournamentRunnerService,
    TournamentScheduler,
    TournamentService,
    TournamentSettingsService
  ]
})
export class TournamentModule {}
