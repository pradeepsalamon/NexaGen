-- CreateEnum
CREATE TYPE "LiveClassPuzzleStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "live_class_puzzle_assignments" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "assignedById" TEXT,
    "status" "LiveClassPuzzleStatus" NOT NULL DEFAULT 'ACTIVE',
    "revealLeaderboard" BOOLEAN NOT NULL DEFAULT true,
    "durationSeconds" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_puzzle_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_puzzle_assignments_liveClassId_idx" ON "live_class_puzzle_assignments"("liveClassId");

-- CreateIndex
CREATE INDEX "live_class_puzzle_assignments_puzzleId_idx" ON "live_class_puzzle_assignments"("puzzleId");

-- CreateIndex: one ACTIVE puzzle per class at a time
CREATE UNIQUE INDEX "live_class_puzzle_assignments_active_per_class" ON "live_class_puzzle_assignments"("liveClassId") WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "live_class_puzzle_assignments" ADD CONSTRAINT "live_class_puzzle_assignments_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_puzzle_assignments" ADD CONSTRAINT "live_class_puzzle_assignments_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_puzzle_assignments" ADD CONSTRAINT "live_class_puzzle_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
