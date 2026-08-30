/*
  Warnings:

  - You are about to drop the column `completedAt` on the `student_assignments` table. All the data in the column will be lost.
  - You are about to drop the column `timeSpentSeconds` on the `student_assignments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "student_assignments" DROP COLUMN "completedAt",
DROP COLUMN "timeSpentSeconds",
ADD COLUMN     "accuracy" DOUBLE PRECISION,
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "mistakes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "time_spent_seconds" INTEGER;
