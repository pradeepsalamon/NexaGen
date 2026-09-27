-- CreateEnum
CREATE TYPE "ClassRequestType" AS ENUM ('EXTRA_CLASS', 'RESCHEDULE');

-- CreateEnum
CREATE TYPE "ClassRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "class_change_requests" (
    "id" TEXT NOT NULL,
    "type" "ClassRequestType" NOT NULL,
    "status" "ClassRequestStatus" NOT NULL DEFAULT 'PENDING',
    "coachId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "classId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "originalStartsAt" TIMESTAMP(3),
    "originalEndsAt" TIMESTAMP(3),
    "topic" TEXT,
    "reason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_progress" (
    "studentId" TEXT NOT NULL,
    "puzzleRating" INTEGER NOT NULL DEFAULT 1200,
    "peakRating" INTEGER NOT NULL DEFAULT 1200,
    "ratedPuzzles" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDay" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_progress_pkey" PRIMARY KEY ("studentId")
);

-- CreateTable
CREATE TABLE "puzzle_rating_changes" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "puzzleRating" INTEGER NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzle_rating_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_change_requests_status_idx" ON "class_change_requests"("status");

-- CreateIndex
CREATE INDEX "class_change_requests_coachId_idx" ON "class_change_requests"("coachId");

-- CreateIndex
CREATE INDEX "class_change_requests_classId_idx" ON "class_change_requests"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_rating_changes_attemptId_key" ON "puzzle_rating_changes"("attemptId");

-- CreateIndex
CREATE INDEX "puzzle_rating_changes_studentId_createdAt_idx" ON "puzzle_rating_changes"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_rating_changes_studentId_puzzleId_key" ON "puzzle_rating_changes"("studentId", "puzzleId");

-- AddForeignKey
ALTER TABLE "class_change_requests" ADD CONSTRAINT "class_change_requests_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_change_requests" ADD CONSTRAINT "class_change_requests_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_change_requests" ADD CONSTRAINT "class_change_requests_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_change_requests" ADD CONSTRAINT "class_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_progress" ADD CONSTRAINT "student_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_rating_changes" ADD CONSTRAINT "puzzle_rating_changes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
