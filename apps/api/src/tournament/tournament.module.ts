import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { TournamentAdminController } from "./tournament-admin.controller";
import { TournamentAuditService } from "./tournament-audit.service";
import { TournamentSettingsService } from "./tournament-settings.service";

/** Tournaments (docs/TOURNAMENTS.md). Phase 1: permissions policy, academy settings, audit log. */
@Module({
  controllers: [TournamentAdminController],
  exports: [TournamentAuditService, TournamentSettingsService],
  imports: [JwtModule, PrismaModule],
  providers: [TournamentAuditService, TournamentSettingsService]
})
export class TournamentModule {}
