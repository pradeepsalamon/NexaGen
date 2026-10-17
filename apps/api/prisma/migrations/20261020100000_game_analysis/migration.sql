-- CreateEnum
CREATE TYPE "ExternalChessProvider" AS ENUM ('LICHESS', 'CHESS_COM');

-- CreateEnum
CREATE TYPE "ExternalSyncStatus" AS ENUM ('IDLE', 'QUEUED', 'SYNCING', 'FAILED', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "GameAnalysisStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GameAnalysisDepth" AS ENUM ('QUICK', 'STANDARD', 'DEEP');

-- CreateEnum
CREATE TYPE "GameAnalysisSideColor" AS ENUM ('WHITE', 'BLACK');

-- AlterEnum
ALTER TYPE "PuzzleSource" ADD VALUE 'GAME';

-- AlterEnum
ALTER TYPE "RevisionItemSource" ADD VALUE 'GAME';

-- AlterTable
ALTER TABLE "puzzles" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "chess_games" ADD COLUMN     "blackRating" INTEGER,
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "eco" TEXT,
ADD COLUMN     "externalAccountId" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalProvider" "ExternalChessProvider",
ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "openingName" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "timeControl" TEXT,
ADD COLUMN     "whiteRating" INTEGER;

-- CreateTable
CREATE TABLE "external_chess_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ExternalChessProvider" NOT NULL,
    "username" TEXT NOT NULL,
    "usernameKey" TEXT NOT NULL,
    "verificationCode" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "syncStatus" "ExternalSyncStatus" NOT NULL DEFAULT 'IDLE',
    "syncCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "nextSyncAllowedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "gamesImported" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_chess_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_analyses" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameFingerprint" TEXT NOT NULL,
    "depth" "GameAnalysisDepth" NOT NULL,
    "status" "GameAnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestedById" TEXT,
    "engine" TEXT,
    "conventionVersion" TEXT NOT NULL,
    "classificationVersion" TEXT,
    "accuracyVersion" TEXT,
    "tacticsVersion" TEXT,
    "configJson" JSONB NOT NULL,
    "engineJson" JSONB,
    "reportJson" JSONB,
    "progressDone" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "claimedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_analysis_sides" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "side" "GameAnalysisSideColor" NOT NULL,
    "playerId" TEXT,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "result" TEXT NOT NULL,
    "source" "ChessGameSource" NOT NULL,
    "externalProvider" "ExternalChessProvider",
    "rating" INTEGER,
    "timeControl" TEXT,
    "eco" TEXT,
    "openingName" TEXT,
    "accuracy" DOUBLE PRECISION,
    "accuracyVersion" TEXT NOT NULL,
    "classificationVersion" TEXT NOT NULL,
    "tacticsVersion" TEXT NOT NULL,
    "movesTotal" INTEGER NOT NULL,
    "movesEligible" INTEGER NOT NULL,
    "countsJson" JSONB NOT NULL,
    "tacticsJson" JSONB NOT NULL,
    "phasesJson" JSONB NOT NULL,
    "clockJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_analysis_sides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_chess_accounts_provider_usernameKey_idx" ON "external_chess_accounts"("provider", "usernameKey");

-- CreateIndex
CREATE INDEX "external_chess_accounts_syncStatus_idx" ON "external_chess_accounts"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "external_chess_accounts_userId_provider_key" ON "external_chess_accounts"("userId", "provider");

-- CreateIndex
CREATE INDEX "game_analyses_status_priority_createdAt_idx" ON "game_analyses"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "game_analyses_requestedById_createdAt_idx" ON "game_analyses"("requestedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "game_analyses_gameId_gameFingerprint_depth_key" ON "game_analyses"("gameId", "gameFingerprint", "depth");

-- CreateIndex
CREATE INDEX "game_analysis_sides_playerId_playedAt_idx" ON "game_analysis_sides"("playerId", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "game_analysis_sides_analysisId_side_key" ON "game_analysis_sides"("analysisId", "side");

-- CreateIndex
CREATE INDEX "puzzles_ownerId_idx" ON "puzzles"("ownerId");

-- CreateIndex
CREATE INDEX "chess_games_ownerId_startedAt_idx" ON "chess_games"("ownerId", "startedAt");

-- CreateIndex
CREATE INDEX "chess_games_externalAccountId_idx" ON "chess_games"("externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "chess_games_ownerId_contentHash_key" ON "chess_games"("ownerId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "chess_games_ownerId_externalProvider_externalId_key" ON "chess_games"("ownerId", "externalProvider", "externalId");

-- AddForeignKey
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess_games" ADD CONSTRAINT "chess_games_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess_games" ADD CONSTRAINT "chess_games_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "external_chess_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_chess_accounts" ADD CONSTRAINT "external_chess_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_analyses" ADD CONSTRAINT "game_analyses_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "chess_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_analyses" ADD CONSTRAINT "game_analyses_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_analysis_sides" ADD CONSTRAINT "game_analysis_sides_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "game_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_analysis_sides" ADD CONSTRAINT "game_analysis_sides_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One student at a time may hold a VERIFIED link to a given online username
-- (Prisma can't express a partial unique index; hand-written, like the other
-- partial indexes in this repo).
CREATE UNIQUE INDEX "external_chess_accounts_verified_username_key"
  ON "external_chess_accounts" ("provider", "usernameKey")
  WHERE "verifiedAt" IS NOT NULL;
