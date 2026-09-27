-- CreateEnum
CREATE TYPE "LiveClassSimulStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "SimulColorMode" AS ENUM ('WHITE', 'BLACK', 'ALTERNATE');

-- CreateEnum
CREATE TYPE "SimulGameStatus" AS ENUM ('ONGOING', 'FINISHED');

-- CreateEnum
CREATE TYPE "SimulGameResult" AS ENUM ('COACH_WON', 'STUDENT_WON', 'DRAW');

-- CreateEnum
CREATE TYPE "SimulEndReason" AS ENUM ('CHECKMATE', 'STALEMATE', 'INSUFFICIENT_MATERIAL', 'THREEFOLD_REPETITION', 'FIFTY_MOVE_RULE', 'RESIGNATION', 'DRAW_AGREED', 'ADJUDICATED', 'SIMUL_ENDED');

-- CreateEnum
CREATE TYPE "SimulSide" AS ENUM ('COACH', 'STUDENT');

-- CreateTable
CREATE TABLE "live_class_simuls" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "startedById" TEXT,
    "status" "LiveClassSimulStatus" NOT NULL DEFAULT 'ACTIVE',
    "colorMode" "SimulColorMode" NOT NULL DEFAULT 'WHITE',
    "startFen" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_simuls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_simul_games" (
    "id" TEXT NOT NULL,
    "simulId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "coachIsWhite" BOOLEAN NOT NULL,
    "fen" TEXT NOT NULL,
    "movesJson" JSONB NOT NULL DEFAULT '[]',
    "ply" INTEGER NOT NULL DEFAULT 0,
    "status" "SimulGameStatus" NOT NULL DEFAULT 'ONGOING',
    "result" "SimulGameResult",
    "endReason" "SimulEndReason",
    "drawOfferedBy" "SimulSide",
    "engineMoves" INTEGER NOT NULL DEFAULT 0,
    "lastMoveAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_simul_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_simuls_liveClassId_idx" ON "live_class_simuls"("liveClassId");

-- CreateIndex
CREATE INDEX "live_class_simul_games_studentId_idx" ON "live_class_simul_games"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_simul_games_simulId_studentId_key" ON "live_class_simul_games"("simulId", "studentId");

-- AddForeignKey
ALTER TABLE "live_class_simuls" ADD CONSTRAINT "live_class_simuls_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_simuls" ADD CONSTRAINT "live_class_simuls_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_simul_games" ADD CONSTRAINT "live_class_simul_games_simulId_fkey" FOREIGN KEY ("simulId") REFERENCES "live_class_simuls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_simul_games" ADD CONSTRAINT "live_class_simul_games_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One running simul per class.
CREATE UNIQUE INDEX "live_class_simuls_one_active_per_class" ON "live_class_simuls"("liveClassId") WHERE "status" = 'ACTIVE';
