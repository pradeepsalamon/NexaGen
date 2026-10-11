-- Multi-puzzle assignments (PUZZLE_SET). Additive only: existing assignments,
-- attempts and puzzle attempts are untouched.

-- AlterEnum
ALTER TYPE "AssignmentActivityType" ADD VALUE 'PUZZLE_SET';

-- AlterEnum
ALTER TYPE "PuzzleAttemptContext" ADD VALUE 'ASSIGNMENT';

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "leaderboardJson" JSONB,
ADD COLUMN     "scoringJson" JSONB;

-- AlterTable
ALTER TABLE "puzzle_attempts" ADD COLUMN     "studentAssignmentId" TEXT;

-- CreateTable
CREATE TABLE "assignment_puzzles" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "scoringJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_puzzles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignment_puzzles_assignmentId_position_idx" ON "assignment_puzzles"("assignmentId", "position");

-- CreateIndex
CREATE INDEX "assignment_puzzles_puzzleId_idx" ON "assignment_puzzles"("puzzleId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_puzzles_assignmentId_puzzleId_key" ON "assignment_puzzles"("assignmentId", "puzzleId");

-- CreateIndex
CREATE INDEX "puzzle_attempts_studentAssignmentId_puzzleId_idx" ON "puzzle_attempts"("studentAssignmentId", "puzzleId");

-- AddForeignKey
ALTER TABLE "assignment_puzzles" ADD CONSTRAINT "assignment_puzzles_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_puzzles" ADD CONSTRAINT "assignment_puzzles_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_attempts" ADD CONSTRAINT "puzzle_attempts_studentAssignmentId_fkey" FOREIGN KEY ("studentAssignmentId") REFERENCES "student_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

