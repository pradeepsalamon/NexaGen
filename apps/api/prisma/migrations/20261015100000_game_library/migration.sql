-- CreateEnum
CREATE TYPE "ChessGameSource" AS ENUM ('LIVE_BOARD', 'SIMUL', 'MATCH', 'IMPORT');

-- CreateEnum
CREATE TYPE "ChessGameStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "chess_games" (
    "id" TEXT NOT NULL,
    "source" "ChessGameSource" NOT NULL,
    "sourceKey" TEXT,
    "sourceRevision" BIGINT NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "classId" TEXT,
    "batchId" TEXT,
    "whitePlayerId" TEXT,
    "blackPlayerId" TEXT,
    "whiteName" TEXT NOT NULL,
    "blackName" TEXT NOT NULL,
    "createdById" TEXT,
    "status" "ChessGameStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "result" TEXT NOT NULL DEFAULT '*',
    "termination" TEXT,
    "startFen" TEXT NOT NULL,
    "pgn" TEXT NOT NULL,
    "moveCount" INTEGER NOT NULL DEFAULT 0,
    "hasVariations" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chess_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chess_games_sourceKey_key" ON "chess_games"("sourceKey");

-- CreateIndex
CREATE INDEX "chess_games_classId_idx" ON "chess_games"("classId");

-- CreateIndex
CREATE INDEX "chess_games_batchId_idx" ON "chess_games"("batchId");

-- CreateIndex
CREATE INDEX "chess_games_whitePlayerId_idx" ON "chess_games"("whitePlayerId");

-- CreateIndex
CREATE INDEX "chess_games_blackPlayerId_idx" ON "chess_games"("blackPlayerId");

-- CreateIndex
CREATE INDEX "chess_games_createdById_idx" ON "chess_games"("createdById");

-- CreateIndex
CREATE INDEX "chess_games_startedAt_idx" ON "chess_games"("startedAt");

-- CreateIndex
CREATE INDEX "chess_games_source_status_idx" ON "chess_games"("source", "status");

-- AddForeignKey
ALTER TABLE "chess_games" ADD CONSTRAINT "chess_games_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess_games" ADD CONSTRAINT "chess_games_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess_games" ADD CONSTRAINT "chess_games_whitePlayerId_fkey" FOREIGN KEY ("whitePlayerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess_games" ADD CONSTRAINT "chess_games_blackPlayerId_fkey" FOREIGN KEY ("blackPlayerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess_games" ADD CONSTRAINT "chess_games_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

