-- CreateEnum
CREATE TYPE "TournamentCommentaryType" AS ENUM ('GENERAL', 'GAME', 'MOVE', 'PLAYER', 'ROUND', 'ANNOUNCEMENT', 'FEATURED', 'EMERGENCY');

-- AlterEnum
ALTER TYPE "TournamentAuditAction" ADD VALUE 'COMMENTARY_HIDDEN';

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "featuredAt" TIMESTAMP(3),
ADD COLUMN     "featuredGameId" TEXT,
ADD COLUMN     "featuredPlayerId" TEXT;

-- CreateTable
CREATE TABLE "tournament_commentary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "tournamentId" TEXT NOT NULL,
    "type" "TournamentCommentaryType" NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "clientId" TEXT NOT NULL,
    "gameId" TEXT,
    "playerId" TEXT,
    "ply" INTEGER,
    "fen" TEXT,
    "highlightJson" JSONB,
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "pinnedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "hiddenById" TEXT,
    "hiddenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_commentary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournament_commentary_tournamentId_createdAt_idx" ON "tournament_commentary"("tournamentId", "createdAt");

-- CreateIndex
CREATE INDEX "tournament_commentary_tournamentId_pinnedAt_idx" ON "tournament_commentary"("tournamentId", "pinnedAt");

-- CreateIndex
CREATE INDEX "tournament_commentary_gameId_idx" ON "tournament_commentary"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_commentary_authorId_clientId_key" ON "tournament_commentary"("authorId", "clientId");

-- AddForeignKey
ALTER TABLE "tournament_commentary" ADD CONSTRAINT "tournament_commentary_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_commentary" ADD CONSTRAINT "tournament_commentary_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_commentary" ADD CONSTRAINT "tournament_commentary_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "tournament_games"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_commentary" ADD CONSTRAINT "tournament_commentary_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "tournament_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_commentary" ADD CONSTRAINT "tournament_commentary_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

