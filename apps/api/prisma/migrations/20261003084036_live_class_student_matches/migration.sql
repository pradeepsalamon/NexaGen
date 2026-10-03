-- CreateEnum
CREATE TYPE "LiveClassMatchRoundStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "MatchPairingMode" AS ENUM ('AUTO', 'COACH', 'STUDENT_CHOICE');

-- CreateEnum
CREATE TYPE "MatchGameStatus" AS ENUM ('ONGOING', 'FINISHED');

-- CreateEnum
CREATE TYPE "MatchGameResult" AS ENUM ('WHITE_WON', 'BLACK_WON', 'DRAW');

-- CreateEnum
CREATE TYPE "MatchEndReason" AS ENUM ('CHECKMATE', 'STALEMATE', 'INSUFFICIENT_MATERIAL', 'THREEFOLD_REPETITION', 'FIFTY_MOVE_RULE', 'RESIGNATION', 'DRAW_AGREED', 'TIMEOUT', 'ADJUDICATED', 'ABORTED', 'ROUND_ENDED');

-- CreateEnum
CREATE TYPE "MatchColor" AS ENUM ('WHITE', 'BLACK');

-- CreateEnum
CREATE TYPE "MatchChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "live_class_match_rounds" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "startedById" TEXT,
    "status" "LiveClassMatchRoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "pairingMode" "MatchPairingMode" NOT NULL,
    "startFen" TEXT NOT NULL,
    "clockInitialMs" INTEGER,
    "clockIncrementMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_match_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_match_games" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "whiteId" TEXT NOT NULL,
    "blackId" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "movesJson" JSONB NOT NULL DEFAULT '[]',
    "ply" INTEGER NOT NULL DEFAULT 0,
    "whiteClockMs" INTEGER,
    "blackClockMs" INTEGER,
    "turnSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MatchGameStatus" NOT NULL DEFAULT 'ONGOING',
    "result" "MatchGameResult",
    "endReason" "MatchEndReason",
    "drawOfferedBy" "MatchColor",
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_match_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_match_challenges" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "status" "MatchChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_match_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_match_rounds_liveClassId_idx" ON "live_class_match_rounds"("liveClassId");

-- CreateIndex
CREATE INDEX "live_class_match_games_roundId_idx" ON "live_class_match_games"("roundId");

-- CreateIndex
CREATE INDEX "live_class_match_games_whiteId_idx" ON "live_class_match_games"("whiteId");

-- CreateIndex
CREATE INDEX "live_class_match_games_blackId_idx" ON "live_class_match_games"("blackId");

-- CreateIndex
CREATE INDEX "live_class_match_challenges_roundId_idx" ON "live_class_match_challenges"("roundId");

-- CreateIndex
CREATE INDEX "live_class_match_challenges_toId_idx" ON "live_class_match_challenges"("toId");

-- AddForeignKey
ALTER TABLE "live_class_match_rounds" ADD CONSTRAINT "live_class_match_rounds_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_match_rounds" ADD CONSTRAINT "live_class_match_rounds_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_match_games" ADD CONSTRAINT "live_class_match_games_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "live_class_match_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_match_games" ADD CONSTRAINT "live_class_match_games_whiteId_fkey" FOREIGN KEY ("whiteId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_match_games" ADD CONSTRAINT "live_class_match_games_blackId_fkey" FOREIGN KEY ("blackId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_match_challenges" ADD CONSTRAINT "live_class_match_challenges_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "live_class_match_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_match_challenges" ADD CONSTRAINT "live_class_match_challenges_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_match_challenges" ADD CONSTRAINT "live_class_match_challenges_toId_fkey" FOREIGN KEY ("toId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One running match round per class.
CREATE UNIQUE INDEX "live_class_match_rounds_one_active_per_class" ON "live_class_match_rounds"("liveClassId") WHERE "status" = 'ACTIVE';

-- One pending challenge per (round, challenger, opponent).
CREATE UNIQUE INDEX "live_class_match_challenges_one_pending" ON "live_class_match_challenges"("roundId", "fromId", "toId") WHERE "status" = 'PENDING';
