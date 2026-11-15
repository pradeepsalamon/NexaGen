-- CreateEnum
CREATE TYPE "TournamentRoundStatus" AS ENUM ('ONGOING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TournamentGameStatus" AS ENUM ('ONGOING', 'FINISHED');

-- CreateEnum
CREATE TYPE "TournamentGameResult" AS ENUM ('WHITE_WON', 'BLACK_WON', 'DRAW', 'NO_RESULT');

-- CreateEnum
CREATE TYPE "TournamentEndReason" AS ENUM ('CHECKMATE', 'STALEMATE', 'INSUFFICIENT_MATERIAL', 'THREEFOLD_REPETITION', 'FIFTY_MOVE_RULE', 'RESIGNATION', 'DRAW_AGREED', 'TIMEOUT', 'NO_SHOW', 'ABANDONED', 'FORFEIT', 'BYE', 'ADJUDICATED', 'ARENA_ENDED');

-- CreateEnum
CREATE TYPE "TournamentResultSource" AS ENUM ('ENGINE', 'BYE', 'FORFEIT', 'HOST', 'CORRECTION');

-- CreateEnum
CREATE TYPE "TournamentByeKind" AS ENUM ('FULL', 'HALF', 'ZERO');

-- CreateEnum
CREATE TYPE "TournamentKnockoutMatchStatus" AS ENUM ('PENDING', 'ONGOING', 'DECIDED');

-- CreateEnum
CREATE TYPE "TournamentKnockoutDecision" AS ENUM ('GAMES', 'SEED', 'BYE', 'FORFEIT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TournamentAuditAction" ADD VALUE 'STARTED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'PAUSED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'RESUMED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'ROUND_STARTED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'ROUND_COMPLETED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'GAME_FORFEITED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'GAME_ADJUDICATED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'RESULT_CORRECTED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'PLAYER_WITHDRAWN_BY_HOST';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'COMPLETED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'RESULTS_PUBLISHED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'STANDINGS_RECOMPUTED';

-- AlterTable
ALTER TABLE "tournament_players" ADD COLUMN     "arenaPausedAt" TIMESTAMP(3),
ADD COLUMN     "currentGameId" TEXT,
ADD COLUMN     "draws" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "losses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onFire" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "performance" INTEGER,
ADD COLUMN     "played" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rank" INTEGER,
ADD COLUMN     "streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tiebreaksJson" JSONB,
ADD COLUMN     "wins" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "arenaEndsAt" TIMESTAMP(3),
ADD COLUMN     "currentRound" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pausedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "tournament_rounds" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "tournamentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "TournamentRoundStatus" NOT NULL DEFAULT 'ONGOING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_knockout_matches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "tournamentId" TEXT NOT NULL,
    "bracketRound" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "playerAId" TEXT,
    "playerBId" TEXT,
    "status" "TournamentKnockoutMatchStatus" NOT NULL DEFAULT 'PENDING',
    "winnerId" TEXT,
    "decidedBy" "TournamentKnockoutDecision",
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_knockout_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_games" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "tournamentId" TEXT NOT NULL,
    "roundId" TEXT,
    "knockoutMatchId" TEXT,
    "roundNumber" INTEGER NOT NULL,
    "gameNumber" INTEGER NOT NULL DEFAULT 1,
    "boardNumber" INTEGER NOT NULL,
    "whitePlayerId" TEXT NOT NULL,
    "blackPlayerId" TEXT,
    "byeKind" "TournamentByeKind",
    "startFen" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "movesJson" JSONB NOT NULL DEFAULT '[]',
    "moveTimesJson" JSONB NOT NULL DEFAULT '[]',
    "ply" INTEGER NOT NULL DEFAULT 0,
    "whiteClockMs" INTEGER NOT NULL,
    "blackClockMs" INTEGER NOT NULL,
    "turnSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "drawOfferedBy" "MatchColor",
    "whiteBerserk" BOOLEAN NOT NULL DEFAULT false,
    "blackBerserk" BOOLEAN NOT NULL DEFAULT false,
    "firstMoveDeadline" TIMESTAMP(3),
    "status" "TournamentGameStatus" NOT NULL DEFAULT 'ONGOING',
    "result" "TournamentGameResult",
    "endReason" "TournamentEndReason",
    "resultSource" "TournamentResultSource",
    "whiteHalfPoints" INTEGER,
    "blackHalfPoints" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tournament_rounds_tournamentId_number_key" ON "tournament_rounds"("tournamentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_knockout_matches_tournamentId_bracketRound_slot_key" ON "tournament_knockout_matches"("tournamentId", "bracketRound", "slot");

-- CreateIndex
CREATE INDEX "tournament_games_tournamentId_status_idx" ON "tournament_games"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "tournament_games_tournamentId_roundNumber_idx" ON "tournament_games"("tournamentId", "roundNumber");

-- CreateIndex
CREATE INDEX "tournament_games_status_turnSince_idx" ON "tournament_games"("status", "turnSince");

-- CreateIndex
CREATE INDEX "tournament_games_whitePlayerId_idx" ON "tournament_games"("whitePlayerId");

-- CreateIndex
CREATE INDEX "tournament_games_blackPlayerId_idx" ON "tournament_games"("blackPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_games_roundId_whitePlayerId_key" ON "tournament_games"("roundId", "whitePlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_games_roundId_blackPlayerId_key" ON "tournament_games"("roundId", "blackPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_games_knockoutMatchId_gameNumber_key" ON "tournament_games"("knockoutMatchId", "gameNumber");

-- CreateIndex
CREATE INDEX "tournament_players_currentGameId_idx" ON "tournament_players"("currentGameId");

-- AddForeignKey
ALTER TABLE "tournament_rounds" ADD CONSTRAINT "tournament_rounds_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_knockout_matches" ADD CONSTRAINT "tournament_knockout_matches_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "tournament_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_knockoutMatchId_fkey" FOREIGN KEY ("knockoutMatchId") REFERENCES "tournament_knockout_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_whitePlayerId_fkey" FOREIGN KEY ("whitePlayerId") REFERENCES "tournament_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_blackPlayerId_fkey" FOREIGN KEY ("blackPlayerId") REFERENCES "tournament_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: a game's two sides are different players; clocks never negative.
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_sides_check"
  CHECK ("blackPlayerId" IS NULL OR "blackPlayerId" <> "whitePlayerId");
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_clock_check"
  CHECK ("whiteClockMs" >= 0 AND "blackClockMs" >= 0);
