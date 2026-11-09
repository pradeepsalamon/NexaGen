import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ApprovalModule } from "../approval/approval.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TrashModule } from "../trash/trash.module";
import { UploadModule } from "../upload/upload.module";
import { TournamentAccessService } from "./tournament-access.service";
import { TournamentAdminController } from "./tournament-admin.controller";
import { TournamentAuditService } from "./tournament-audit.service";
import { TournamentRegistrationService } from "./tournament-registration.service";
import { TournamentSettingsService } from "./tournament-settings.service";
import { TournamentController } from "./tournament.controller";
import { TournamentService } from "./tournament.service";

/** Tournaments (docs/TOURNAMENTS.md). */
@Module({
  controllers: [TournamentAdminController, TournamentController],
  exports: [TournamentAccessService, TournamentAuditService, TournamentSettingsService],
  imports: [ApprovalModule, JwtModule, PrismaModule, TrashModule, UploadModule],
  providers: [
    TournamentAccessService,
    TournamentAuditService,
    TournamentRegistrationService,
    TournamentService,
    TournamentSettingsService
  ]
})
export class TournamentModule {}
