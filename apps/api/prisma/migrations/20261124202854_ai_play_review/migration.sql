-- AI play review (docs/AI_PLAY_REVIEW.md): the outside-AI switch history,
-- per-academy switches, engine reviews + outside-AI comments, credited class-board
-- moves (gap B) and each Storm/Racer puzzle's line (gap A). Additive only.

-- CreateEnum
CREATE TYPE "AiConsentChangedBy" AS ENUM ('STUDENT', 'COACH', 'ADMIN');

-- CreateEnum
CREATE TYPE "PlaySource" AS ENUM ('PUZZLE', 'ASSIGNMENT', 'PLAYOUT', 'POLL', 'MATCH', 'SIMUL', 'TOURNAMENT', 'OWN_GAME', 'RUSH', 'CLASS_BOARD');

-- CreateEnum
CREATE TYPE "AiPlayReviewStatus" AS ENUM ('DONE', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "live_class_puzzle_rush_entries" ADD COLUMN     "movesJson" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "solo_puzzle_rush_runs" ADD COLUMN     "movesJson" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "ai_review_consents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "studentId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "guardianConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "changedById" TEXT,
    "changedByRole" "AiConsentChangedBy" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_review_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_play_review_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "engineReviewEnabled" BOOLEAN NOT NULL DEFAULT true,
    "outsideAiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_play_review_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_play_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "studentId" TEXT NOT NULL,
    "source" "PlaySource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "status" "AiPlayReviewStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "accuracy" INTEGER,
    "blunders" INTEGER NOT NULL DEFAULT 0,
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "inaccuracies" INTEGER NOT NULL DEFAULT 0,
    "missedTactics" INTEGER NOT NULL DEFAULT 0,
    "studentMoves" INTEGER NOT NULL DEFAULT 0,
    "findingsJson" JSONB NOT NULL DEFAULT '[]',
    "versionsJson" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_play_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_play_comments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "reviewId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_play_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_board_moves" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "chessGameId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "ply" INTEGER NOT NULL,
    "uci" TEXT NOT NULL,
    "san" TEXT NOT NULL,
    "fenBefore" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_class_board_moves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_review_consents_studentId_createdAt_idx" ON "ai_review_consents"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_review_consents_changedById_idx" ON "ai_review_consents"("changedById");

-- CreateIndex
CREATE UNIQUE INDEX "ai_play_review_settings_tenantId_key" ON "ai_play_review_settings"("tenantId");

-- CreateIndex
CREATE INDEX "ai_play_reviews_studentId_playedAt_idx" ON "ai_play_reviews"("studentId", "playedAt");

-- CreateIndex
CREATE INDEX "ai_play_reviews_reviewedAt_idx" ON "ai_play_reviews"("reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_play_reviews_tenantId_studentId_source_sourceId_key" ON "ai_play_reviews"("tenantId", "studentId", "source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_play_comments_reviewId_key" ON "ai_play_comments"("reviewId");

-- CreateIndex
CREATE INDEX "ai_play_comments_studentId_idx" ON "ai_play_comments"("studentId");

-- CreateIndex
CREATE INDEX "ai_play_comments_createdAt_idx" ON "ai_play_comments"("createdAt");

-- CreateIndex
CREATE INDEX "live_class_board_moves_studentId_idx" ON "live_class_board_moves"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_board_moves_chessGameId_ply_key" ON "live_class_board_moves"("chessGameId", "ply");

-- AddForeignKey
ALTER TABLE "ai_review_consents" ADD CONSTRAINT "ai_review_consents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_consents" ADD CONSTRAINT "ai_review_consents_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_play_reviews" ADD CONSTRAINT "ai_play_reviews_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_play_comments" ADD CONSTRAINT "ai_play_comments_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ai_play_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_play_comments" ADD CONSTRAINT "ai_play_comments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_board_moves" ADD CONSTRAINT "live_class_board_moves_chessGameId_fkey" FOREIGN KEY ("chessGameId") REFERENCES "chess_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_board_moves" ADD CONSTRAINT "live_class_board_moves_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New plan feature (docs/SAAS_PLANS.md § "Adding a feature"): AI play review, in
-- the Enterprise tier (Nexa's academy is Enterprise); other tiers via the console.
UPDATE "platform_plans" SET "features" = array_append("features", 'aiPlayReview') WHERE "id" IN ('plan_enterprise') AND NOT ('aiPlayReview' = ANY("features"));
