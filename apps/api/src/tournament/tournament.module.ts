import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ApprovalModule } from "../approval/approval.module";
import { BrandingModule } from "../branding/branding.module";
import { GameLibraryModule } from "../game-library/game-library.module";
import { MailModule } from "../mail/mail.module";
import { MessagingModule } from "../messaging/messaging.module";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaModule } from "../prisma/prisma.module";
import { TrashModule } from "../trash/trash.module";
import { UploadModule } from "../upload/upload.module";
import { TournamentAccessService } from "./tournament-access.service";
import { TournamentAdminController } from "./tournament-admin.controller";
import { CertificatePdfService } from "./certificate-pdf.service";
import { TournamentArchiverService } from "./tournament-archiver.service";
import { TournamentBroadcastController } from "./tournament-broadcast.controller";
import { TournamentCertificateService } from "./tournament-certificate.service";
import { TournamentCommentaryService } from "./tournament-commentary.service";
import { TournamentAuditService } from "./tournament-audit.service";
import { TournamentEngineService } from "./tournament-engine.service";
import { TournamentEventsService } from "./tournament-events.service";
import { TournamentGameService } from "./tournament-game.service";
import { TournamentHistoryService } from "./tournament-history.service";
import { TournamentNotifierService } from "./tournament-notifier.service";
import { TournamentRunnerService } from "./tournament-runner.service";
import { TournamentTimerService } from "./tournament-timer.service";
import { TournamentScheduler } from "./tournament.scheduler";
import { TournamentRegistrationService } from "./tournament-registration.service";
import { TournamentSettingsService } from "./tournament-settings.service";
import { TournamentPlayController } from "./tournament-play.controller";
import { TournamentPublicController } from "./tournament-public.controller";
import { TournamentPublicService } from "./tournament-public.service";
import { TournamentRealtimeService } from "./tournament-realtime.service";
import { TournamentRecordsController } from "./tournament-records.controller";
import { TournamentController } from "./tournament.controller";
import { TournamentService } from "./tournament.service";

/** Tournaments (docs/TOURNAMENTS.md). */
@Module({
  controllers: [TournamentAdminController, TournamentBroadcastController, TournamentController, TournamentPlayController, TournamentPublicController, TournamentRecordsController],
  exports: [TournamentAccessService, TournamentAuditService, TournamentEventsService, TournamentGameService, TournamentRunnerService, TournamentSettingsService],
  imports: [ApprovalModule, BrandingModule, GameLibraryModule, JwtModule, MailModule, MessagingModule, PrismaModule, TrashModule, UploadModule],
  providers: [
    // Stateless LiveKit clients; its own instance, so this module doesn't pull in the live-class room.
    LiveKitService,
    CertificatePdfService,
    TournamentAccessService,
    TournamentArchiverService,
    TournamentAuditService,
    TournamentCertificateService,
    TournamentCommentaryService,
    TournamentEngineService,
    TournamentEventsService,
    TournamentGameService,
    TournamentHistoryService,
    TournamentNotifierService,
    TournamentPublicService,
    TournamentRealtimeService,
    TournamentRegistrationService,
    TournamentRunnerService,
    TournamentScheduler,
    TournamentService,
    TournamentSettingsService,
    TournamentTimerService
  ]
})
export class TournamentModule {}
