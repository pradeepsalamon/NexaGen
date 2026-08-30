-- CreateEnum
CREATE TYPE "AssignmentActivityType" AS ENUM ('REPLAY', 'SOLVE_LINE', 'PLAY_VS_ENGINE', 'FREE_ANALYSIS');

-- CreateEnum
CREATE TYPE "AssignmentAttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABANDONED');

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "activityType" "AssignmentActivityType" NOT NULL DEFAULT 'REPLAY',
ADD COLUMN     "allowHints" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowRetry" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "engineLevel" INTEGER,
ADD COLUMN     "maxAttempts" INTEGER,
ADD COLUMN     "orientation" TEXT,
ADD COLUMN     "passThresholdPercent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "requiredCompletionPercent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "solutionMovesJson" JSONB,
ADD COLUMN     "startFen" TEXT,
ADD COLUMN     "studentColor" TEXT;

-- AlterTable
ALTER TABLE "student_assignments" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bestAccuracyPercent" INTEGER,
ADD COLUMN     "bestScorePercent" INTEGER,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "student_assignment_attempts" (
    "id" TEXT NOT NULL,
    "studentAssignmentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "AssignmentAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "movesJson" JSONB NOT NULL DEFAULT '[]',
    "scorePercent" INTEGER,
    "accuracyPercent" INTEGER,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_assignment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_assignment_attempts_studentAssignmentId_idx" ON "student_assignment_attempts"("studentAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "student_assignment_attempts_studentAssignmentId_attemptNumb_key" ON "student_assignment_attempts"("studentAssignmentId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "student_assignment_attempts" ADD CONSTRAINT "student_assignment_attempts_studentAssignmentId_fkey" FOREIGN KEY ("studentAssignmentId") REFERENCES "student_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
