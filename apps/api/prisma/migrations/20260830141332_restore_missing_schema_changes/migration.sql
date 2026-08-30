/*
  Warnings:

  - You are about to drop the column `completedAt` on the `student_assignments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "timeLimitMinutes" INTEGER;

-- AlterTable
ALTER TABLE "student_assignments" DROP COLUMN "completedAt",
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "time_spent_seconds" INTEGER;

-- CreateTable
CREATE TABLE "recording_watch_progress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recording_watch_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recording_watch_progress_studentId_classId_key" ON "recording_watch_progress"("studentId", "classId");

-- AddForeignKey
ALTER TABLE "recording_watch_progress" ADD CONSTRAINT "recording_watch_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_watch_progress" ADD CONSTRAINT "recording_watch_progress_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_watch_progress" ADD CONSTRAINT "recording_watch_progress_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
