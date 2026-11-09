-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('SWISS', 'ARENA', 'ROUND_ROBIN', 'KNOCKOUT');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'INVITATION_ONLY');

-- CreateEnum
CREATE TYPE "TournamentTiebreak" AS ENUM ('BUCHHOLZ', 'BUCHHOLZ_CUT1', 'MEDIAN_BUCHHOLZ', 'SONNEBORN_BERGER', 'DIRECT_ENCOUNTER', 'WINS', 'PROGRESSIVE', 'PERFORMANCE');

-- CreateEnum
CREATE TYPE "TournamentHostRole" AS ENUM ('HOST', 'CO_HOST', 'COMMENTATOR');

-- CreateEnum
CREATE TYPE "TournamentPlayerStatus" AS ENUM ('INVITED', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "TournamentRatingSource" AS ENUM ('PROFILE', 'UNRATED');

-- CreateEnum
CREATE TYPE "TournamentPublicNameFormat" AS ENUM ('FIRST_NAME_LAST_INITIAL', 'FIRST_NAME_ONLY', 'INITIALS');

-- CreateEnum
CREATE TYPE "TournamentAuditAction" AS ENUM ('SETTINGS_UPDATED');

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bannerUrl" TEXT,
    "logoUrl" TEXT,
    "format" "TournamentFormat" NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "TournamentVisibility" NOT NULL DEFAULT 'PUBLIC',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "lateRegistrationRounds" INTEGER NOT NULL DEFAULT 0,
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "maxPlayers" INTEGER,
    "eligibilityJson" JSONB NOT NULL DEFAULT '{}',
    "rulesText" TEXT,
    "prizesText" TEXT,
    "clockInitialMs" INTEGER NOT NULL,
    "clockIncrementMs" INTEGER NOT NULL DEFAULT 0,
    "startFen" TEXT,
    "rounds" INTEGER,
    "roundBreakSec" INTEGER NOT NULL DEFAULT 60,
    "arenaDurationMin" INTEGER,
    "arenaConfigJson" JSONB,
    "knockoutConfigJson" JSONB,
    "tiebreaks" "TournamentTiebreak"[],
    "spectatorDelaySec" INTEGER NOT NULL DEFAULT 15,
    "publishedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "resultsPublishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_hosts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TournamentHostRole" NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_hosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_players" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TournamentPlayerStatus" NOT NULL,
    "seedRating" INTEGER,
    "seedRatingSource" "TournamentRatingSource" NOT NULL DEFAULT 'UNRATED',
    "seedNumber" INTEGER,
    "ageGroup" TEXT,
    "registeredById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "coachesMayCreate" BOOLEAN NOT NULL DEFAULT false,
    "coachesMayPublishPublic" BOOLEAN NOT NULL DEFAULT false,
    "allowAnonymousSpectating" BOOLEAN NOT NULL DEFAULT false,
    "publicNameFormat" "TournamentPublicNameFormat" NOT NULL DEFAULT 'FIRST_NAME_LAST_INITIAL',
    "defaultSpectatorDelaySec" INTEGER NOT NULL DEFAULT 15,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "tournamentId" TEXT,
    "action" "TournamentAuditAction" NOT NULL,
    "actorId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "reason" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournaments_tenantId_status_startsAt_idx" ON "tournaments"("tenantId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "tournaments_createdById_idx" ON "tournaments"("createdById");

-- CreateIndex
CREATE INDEX "tournaments_isDeleted_idx" ON "tournaments"("isDeleted");

-- CreateIndex
CREATE INDEX "tournaments_deletedAt_idx" ON "tournaments"("deletedAt");

-- CreateIndex
CREATE INDEX "tournaments_deletedById_idx" ON "tournaments"("deletedById");

-- CreateIndex
CREATE INDEX "tournaments_deleteGroupId_idx" ON "tournaments"("deleteGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_tenantId_slug_key" ON "tournaments"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "tournament_hosts_userId_idx" ON "tournament_hosts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_hosts_tournamentId_userId_key" ON "tournament_hosts"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "tournament_players_tournamentId_status_idx" ON "tournament_players"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "tournament_players_userId_idx" ON "tournament_players"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_players_tournamentId_userId_key" ON "tournament_players"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_settings_tenantId_key" ON "tournament_settings"("tenantId");

-- CreateIndex
CREATE INDEX "tournament_audit_logs_tournamentId_createdAt_idx" ON "tournament_audit_logs"("tournamentId", "createdAt");

-- CreateIndex
CREATE INDEX "tournament_audit_logs_tenantId_createdAt_idx" ON "tournament_audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tournament_audit_logs_actorId_idx" ON "tournament_audit_logs"("actorId");

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_hosts" ADD CONSTRAINT "tournament_hosts_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_hosts" ADD CONSTRAINT "tournament_hosts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_hosts" ADD CONSTRAINT "tournament_hosts_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_settings" ADD CONSTRAINT "tournament_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_audit_logs" ADD CONSTRAINT "tournament_audit_logs_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_audit_logs" ADD CONSTRAINT "tournament_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: sanity rules the API also enforces, so a bug can never store
-- a tournament the engines cannot run (docs/TOURNAMENTS.md §3.1).
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_clock_check"
  CHECK ("clockInitialMs" > 0 AND "clockIncrementMs" >= 0);
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_players_check"
  CHECK ("minPlayers" >= 2 AND ("maxPlayers" IS NULL OR "maxPlayers" >= "minPlayers"));
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_registration_window_check"
  CHECK ("registrationOpensAt" IS NULL OR "registrationClosesAt" IS NULL OR "registrationOpensAt" <= "registrationClosesAt");
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_non_negative_check"
  CHECK ("spectatorDelaySec" >= 0 AND "roundBreakSec" >= 0 AND "lateRegistrationRounds" >= 0
         AND ("rounds" IS NULL OR "rounds" >= 1) AND ("arenaDurationMin" IS NULL OR "arenaDurationMin" >= 1));
ALTER TABLE "tournament_settings" ADD CONSTRAINT "tournament_settings_delay_check"
  CHECK ("defaultSpectatorDelaySec" >= 0);

-- SaaS plans: tournaments ship with Enterprise (docs/SAAS_PLANS.md).
UPDATE "platform_plans"
   SET "features" = array_append("features", 'tournaments')
 WHERE "id" IN ('plan_enterprise')
   AND NOT ('tournaments' = ANY("features"));
