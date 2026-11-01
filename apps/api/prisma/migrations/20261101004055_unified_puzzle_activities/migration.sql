-- CreateEnum
CREATE TYPE "LibraryActivityKind" AS ENUM ('MCQ', 'PLAYOUT');

-- CreateEnum
CREATE TYPE "LiveClassActivityRunStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "PlayoutGameStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "PlayoutResult" AS ENUM ('WIN', 'LOSS', 'DRAW', 'NONE');

-- CreateEnum
CREATE TYPE "PlayoutEndReason" AS ENUM ('GOAL_ACHIEVED', 'CHECKMATE', 'STALEMATE', 'DRAW', 'TIME_UP', 'MOVE_LIMIT', 'RESIGNED', 'RETRIED', 'ACTIVITY_ENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LiveClassActivityKind" ADD VALUE 'MCQ';
ALTER TYPE "LiveClassActivityKind" ADD VALUE 'PLAYOUT';

-- AlterTable
ALTER TABLE "live_class_activity_queue_items" ADD COLUMN     "activityId" TEXT,
ADD COLUMN     "activityRunId" TEXT;

-- CreateTable
CREATE TABLE "library_activities" (
    "id" TEXT NOT NULL,
    "kind" "LibraryActivityKind" NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" "PuzzleDifficulty" NOT NULL,
    "topic" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbnailUrl" TEXT,
    "configJson" JSONB NOT NULL,
    "status" "PuzzleStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "PuzzleVisibility" NOT NULL DEFAULT 'GLOBAL',
    "createdById" TEXT,
    "createdByRole" "UserRole" NOT NULL,
    "updatedById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteGroupId" TEXT,

    CONSTRAINT "library_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_activity_runs" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "activityId" TEXT,
    "kind" "LibraryActivityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" "PuzzleDifficulty" NOT NULL,
    "configJson" JSONB NOT NULL,
    "startedById" TEXT,
    "status" "LiveClassActivityRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_activity_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_mcq_attempts" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "selectedOptionIds" TEXT[],
    "correctOptionIds" TEXT[],
    "correct" BOOLEAN NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_class_mcq_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_class_playout_games" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "studentColor" TEXT NOT NULL,
    "startFen" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "ply" INTEGER NOT NULL DEFAULT 0,
    "movesJson" JSONB NOT NULL DEFAULT '[]',
    "pgn" TEXT NOT NULL DEFAULT '',
    "engineSkill" INTEGER NOT NULL,
    "engineMoveMs" INTEGER NOT NULL,
    "status" "PlayoutGameStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "endReason" "PlayoutEndReason",
    "result" "PlayoutResult",
    "goalAchieved" BOOLEAN NOT NULL DEFAULT false,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER,
    "maxScore" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "lastMoveAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_playout_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_activities_kind_idx" ON "library_activities"("kind");

-- CreateIndex
CREATE INDEX "library_activities_topicId_idx" ON "library_activities"("topicId");

-- CreateIndex
CREATE INDEX "library_activities_createdById_idx" ON "library_activities"("createdById");

-- CreateIndex
CREATE INDEX "library_activities_difficulty_idx" ON "library_activities"("difficulty");

-- CreateIndex
CREATE INDEX "library_activities_status_idx" ON "library_activities"("status");

-- CreateIndex
CREATE INDEX "library_activities_createdAt_idx" ON "library_activities"("createdAt");

-- CreateIndex
CREATE INDEX "library_activities_isDeleted_idx" ON "library_activities"("isDeleted");

-- CreateIndex
CREATE INDEX "library_activities_deletedAt_idx" ON "library_activities"("deletedAt");

-- CreateIndex
CREATE INDEX "library_activities_deletedById_idx" ON "library_activities"("deletedById");

-- CreateIndex
CREATE INDEX "library_activities_deleteGroupId_idx" ON "library_activities"("deleteGroupId");

-- CreateIndex
CREATE INDEX "live_class_activity_runs_liveClassId_idx" ON "live_class_activity_runs"("liveClassId");

-- CreateIndex
CREATE INDEX "live_class_activity_runs_activityId_idx" ON "live_class_activity_runs"("activityId");

-- CreateIndex
CREATE INDEX "live_class_mcq_attempts_studentId_idx" ON "live_class_mcq_attempts"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_mcq_attempts_runId_studentId_attemptNumber_key" ON "live_class_mcq_attempts"("runId", "studentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "live_class_playout_games_studentId_idx" ON "live_class_playout_games"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_playout_games_runId_studentId_attemptNumber_key" ON "live_class_playout_games"("runId", "studentId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_activity_queue_items_activityRunId_key" ON "live_class_activity_queue_items"("activityRunId");

-- CreateIndex
CREATE INDEX "live_class_activity_queue_items_activityId_idx" ON "live_class_activity_queue_items"("activityId");

-- AddForeignKey
ALTER TABLE "library_activities" ADD CONSTRAINT "library_activities_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "puzzle_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_activities" ADD CONSTRAINT "library_activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_activities" ADD CONSTRAINT "library_activities_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_activity_runs" ADD CONSTRAINT "live_class_activity_runs_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_activity_runs" ADD CONSTRAINT "live_class_activity_runs_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "library_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_mcq_attempts" ADD CONSTRAINT "live_class_mcq_attempts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "live_class_activity_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_mcq_attempts" ADD CONSTRAINT "live_class_mcq_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_playout_games" ADD CONSTRAINT "live_class_playout_games_runId_fkey" FOREIGN KEY ("runId") REFERENCES "live_class_activity_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_playout_games" ADD CONSTRAINT "live_class_playout_games_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written (Prisma can't express these).

-- Titles sort naturally, like puzzles.title ("MCQ 2" before "MCQ 10"), and the
-- unified library's UNION ORDER BY needs the same collation on both sides.
ALTER TABLE "library_activities" ALTER COLUMN "title" TYPE TEXT COLLATE "natural_sort";

-- One running activity per class.
CREATE UNIQUE INDEX "live_class_activity_runs_one_active_per_class"
  ON "live_class_activity_runs" ("liveClassId") WHERE "status" = 'ACTIVE';

-- One open game per student per run: a double-clicked Start can't open two.
CREATE UNIQUE INDEX "live_class_playout_games_one_open_per_student"
  ON "live_class_playout_games" ("runId", "studentId") WHERE "status" = 'IN_PROGRESS';
