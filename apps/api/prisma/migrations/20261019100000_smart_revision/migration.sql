-- CreateEnum
CREATE TYPE "RevisionItemKind" AS ENUM ('PUZZLE', 'TOPIC');

-- CreateEnum
CREATE TYPE "RevisionItemSource" AS ENUM ('MISTAKE', 'COACH');

-- CreateEnum
CREATE TYPE "RevisionItemStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "RevisionGrade" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateEnum
CREATE TYPE "RevisionOutcome" AS ENUM ('CLEAN', 'ASSISTED', 'FAILED');

-- AlterEnum
ALTER TYPE "PuzzleAttemptContext" ADD VALUE 'REVISION';

-- CreateTable
CREATE TABLE "revision_items" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "RevisionItemKind" NOT NULL,
    "contentKey" TEXT NOT NULL,
    "puzzleId" TEXT,
    "topicId" TEXT,
    "source" "RevisionItemSource" NOT NULL,
    "status" "RevisionItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceAttemptId" TEXT,
    "recommendedById" TEXT,
    "recommendedAt" TIMESTAMP(3),
    "note" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" INTEGER NOT NULL DEFAULT 250,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lastGrade" "RevisionGrade",
    "lastReviewedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "currentAttemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revision_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revision_reviews" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptId" TEXT,
    "puzzleId" TEXT,
    "grade" "RevisionGrade" NOT NULL,
    "outcome" "RevisionOutcome" NOT NULL,
    "intervalBefore" INTEGER NOT NULL,
    "intervalAfter" INTEGER NOT NULL,
    "dueAtAfter" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revision_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "revision_items_currentAttemptId_key" ON "revision_items"("currentAttemptId");

-- CreateIndex
CREATE INDEX "revision_items_studentId_status_dueAt_idx" ON "revision_items"("studentId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "revision_items_puzzleId_idx" ON "revision_items"("puzzleId");

-- CreateIndex
CREATE INDEX "revision_items_topicId_idx" ON "revision_items"("topicId");

-- CreateIndex
CREATE INDEX "revision_items_recommendedById_idx" ON "revision_items"("recommendedById");

-- CreateIndex
CREATE UNIQUE INDEX "revision_items_studentId_contentKey_key" ON "revision_items"("studentId", "contentKey");

-- CreateIndex
CREATE UNIQUE INDEX "revision_reviews_attemptId_key" ON "revision_reviews"("attemptId");

-- CreateIndex
CREATE INDEX "revision_reviews_studentId_reviewedAt_idx" ON "revision_reviews"("studentId", "reviewedAt");

-- CreateIndex
CREATE INDEX "revision_reviews_itemId_reviewedAt_idx" ON "revision_reviews"("itemId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "puzzle_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_recommendedById_fkey" FOREIGN KEY ("recommendedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_reviews" ADD CONSTRAINT "revision_reviews_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "revision_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_reviews" ADD CONSTRAINT "revision_reviews_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_reviews" ADD CONSTRAINT "revision_reviews_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "puzzle_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

