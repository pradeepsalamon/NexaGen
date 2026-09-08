-- CreateEnum
CREATE TYPE "PuzzleType" AS ENUM ('TACTICAL', 'CHECKMATE', 'BEST_MOVE', 'CALCULATION', 'ENDGAME', 'OPENING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PuzzleDifficulty" AS ENUM ('BEGINNER', 'EASY', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "PuzzleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PuzzleVisibility" AS ENUM ('GLOBAL', 'PRIVATE');

-- CreateEnum
CREATE TYPE "PuzzleAttemptStatus" AS ENUM ('IN_PROGRESS', 'SOLVED', 'FAILED', 'ABANDONED');

-- CreateTable
CREATE TABLE "puzzle_topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteGroupId" TEXT,

    CONSTRAINT "puzzle_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzles" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "puzzleType" "PuzzleType" NOT NULL,
    "difficulty" "PuzzleDifficulty" NOT NULL,
    "fen" TEXT NOT NULL,
    "solutionMovesJson" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT,
    "hintsJson" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedSeconds" INTEGER,
    "status" "PuzzleStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "PuzzleVisibility" NOT NULL DEFAULT 'PRIVATE',
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

    CONSTRAINT "puzzles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzle_attempts" (
    "id" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "liveClassId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "status" "PuzzleAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
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

    CONSTRAINT "puzzle_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "puzzle_topics_isDeleted_idx" ON "puzzle_topics"("isDeleted");

-- CreateIndex
CREATE INDEX "puzzle_topics_deletedAt_idx" ON "puzzle_topics"("deletedAt");

-- CreateIndex
CREATE INDEX "puzzle_topics_deletedById_idx" ON "puzzle_topics"("deletedById");

-- CreateIndex
CREATE INDEX "puzzle_topics_deleteGroupId_idx" ON "puzzle_topics"("deleteGroupId");

-- CreateIndex
CREATE INDEX "puzzle_topics_sortOrder_idx" ON "puzzle_topics"("sortOrder");

-- CreateIndex
CREATE INDEX "puzzles_topicId_idx" ON "puzzles"("topicId");

-- CreateIndex
CREATE INDEX "puzzles_createdById_idx" ON "puzzles"("createdById");

-- CreateIndex
CREATE INDEX "puzzles_puzzleType_idx" ON "puzzles"("puzzleType");

-- CreateIndex
CREATE INDEX "puzzles_difficulty_idx" ON "puzzles"("difficulty");

-- CreateIndex
CREATE INDEX "puzzles_status_idx" ON "puzzles"("status");

-- CreateIndex
CREATE INDEX "puzzles_visibility_idx" ON "puzzles"("visibility");

-- CreateIndex
CREATE INDEX "puzzles_createdAt_idx" ON "puzzles"("createdAt");

-- CreateIndex
CREATE INDEX "puzzles_isDeleted_idx" ON "puzzles"("isDeleted");

-- CreateIndex
CREATE INDEX "puzzles_deletedAt_idx" ON "puzzles"("deletedAt");

-- CreateIndex
CREATE INDEX "puzzles_deletedById_idx" ON "puzzles"("deletedById");

-- CreateIndex
CREATE INDEX "puzzles_deleteGroupId_idx" ON "puzzles"("deleteGroupId");

-- CreateIndex
CREATE INDEX "puzzle_attempts_puzzleId_idx" ON "puzzle_attempts"("puzzleId");

-- CreateIndex
CREATE INDEX "puzzle_attempts_studentId_idx" ON "puzzle_attempts"("studentId");

-- CreateIndex
CREATE INDEX "puzzle_attempts_liveClassId_idx" ON "puzzle_attempts"("liveClassId");

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_attempts_puzzleId_studentId_attemptNumber_key" ON "puzzle_attempts"("puzzleId", "studentId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "puzzle_topics" ADD CONSTRAINT "puzzle_topics_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_topics" ADD CONSTRAINT "puzzle_topics_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "puzzle_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzles" ADD CONSTRAINT "puzzles_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_attempts" ADD CONSTRAINT "puzzle_attempts_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_attempts" ADD CONSTRAINT "puzzle_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique indexes: a soft-deleted topic must not reserve its name/slug
-- (README §"Trash And Soft Delete" step 5).
CREATE UNIQUE INDEX "puzzle_topics_name_key" ON "puzzle_topics"("name") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "puzzle_topics_slug_key" ON "puzzle_topics"("slug") WHERE "isDeleted" = false;
