-- CreateEnum
CREATE TYPE "PuzzleRushMode" AS ENUM ('STORM', 'RACER');

-- CreateTable
CREATE TABLE "live_class_puzzle_rushes" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "startedById" TEXT,
    "mode" "PuzzleRushMode" NOT NULL,
    "puzzles" JSONB NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_puzzle_rushes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_puzzle_rush_entries" (
    "id" TEXT NOT NULL,
    "rushId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "moves" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "solved" INTEGER NOT NULL DEFAULT 0,
    "bestCombo" INTEGER NOT NULL DEFAULT 0,
    "highestRating" INTEGER,
    "puzzleIndex" INTEGER NOT NULL DEFAULT 0,
    "skipsUsed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "clockEndsAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_puzzle_rush_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_puzzle_rushes_liveClassId_createdAt_idx" ON "live_class_puzzle_rushes"("liveClassId", "createdAt");

-- CreateIndex
CREATE INDEX "live_class_puzzle_rush_entries_studentId_idx" ON "live_class_puzzle_rush_entries"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_puzzle_rush_entries_rushId_studentId_key" ON "live_class_puzzle_rush_entries"("rushId", "studentId");

-- AddForeignKey
ALTER TABLE "live_class_puzzle_rushes" ADD CONSTRAINT "live_class_puzzle_rushes_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_puzzle_rushes" ADD CONSTRAINT "live_class_puzzle_rushes_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_puzzle_rush_entries" ADD CONSTRAINT "live_class_puzzle_rush_entries_rushId_fkey" FOREIGN KEY ("rushId") REFERENCES "live_class_puzzle_rushes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_puzzle_rush_entries" ADD CONSTRAINT "live_class_puzzle_rush_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One active (not ended) Storm/Racer round per class. Hand-written: Prisma
-- can't express a partial unique index.
CREATE UNIQUE INDEX "live_class_puzzle_rushes_one_active_per_class" ON "live_class_puzzle_rushes"("liveClassId") WHERE "endedAt" IS NULL;
