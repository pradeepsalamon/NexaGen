-- Puzzle of the Day (docs/PUZZLE_OF_THE_DAY.md).
-- CreateEnum
CREATE TYPE "DailyPuzzleLevel" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "DailyPuzzleKind" AS ENUM ('AUTO', 'OVERRIDE');

-- AlterEnum
ALTER TYPE "PuzzleAttemptContext" ADD VALUE 'DAILY';

-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "dailyPuzzleEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "daily_puzzles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "day" DATE NOT NULL,
    "level" "DailyPuzzleLevel" NOT NULL,
    "kind" "DailyPuzzleKind" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "batchId" TEXT,
    "puzzleId" TEXT NOT NULL,
    "setById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_puzzles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_puzzle_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "studentId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "level" "DailyPuzzleLevel" NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "solved" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_puzzle_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_puzzle_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_puzzle_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_puzzles_puzzleId_idx" ON "daily_puzzles"("puzzleId");

-- CreateIndex
CREATE INDEX "daily_puzzles_batchId_idx" ON "daily_puzzles"("batchId");

-- CreateIndex
CREATE INDEX "daily_puzzles_setById_idx" ON "daily_puzzles"("setById");

-- CreateIndex
CREATE UNIQUE INDEX "daily_puzzles_tenantId_day_level_scopeKey_kind_key" ON "daily_puzzles"("tenantId", "day", "level", "scopeKey", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "daily_puzzle_entries_attemptId_key" ON "daily_puzzle_entries"("attemptId");

-- CreateIndex
CREATE INDEX "daily_puzzle_entries_studentId_finishedAt_idx" ON "daily_puzzle_entries"("studentId", "finishedAt");

-- CreateIndex
CREATE INDEX "daily_puzzle_entries_puzzleId_idx" ON "daily_puzzle_entries"("puzzleId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_puzzle_entries_studentId_day_level_key" ON "daily_puzzle_entries"("studentId", "day", "level");

-- CreateIndex
CREATE UNIQUE INDEX "daily_puzzle_settings_tenantId_key" ON "daily_puzzle_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "daily_puzzles" ADD CONSTRAINT "daily_puzzles_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_puzzles" ADD CONSTRAINT "daily_puzzles_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_puzzles" ADD CONSTRAINT "daily_puzzles_setById_fkey" FOREIGN KEY ("setById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_puzzle_entries" ADD CONSTRAINT "daily_puzzle_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_puzzle_entries" ADD CONSTRAINT "daily_puzzle_entries_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_puzzle_entries" ADD CONSTRAINT "daily_puzzle_entries_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "puzzle_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

