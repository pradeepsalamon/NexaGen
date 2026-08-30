/*
  Warnings:

  - You are about to drop the column `accuracy` on the `student_assignments` table. All the data in the column will be lost.
  - You are about to drop the column `mistakes` on the `student_assignments` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `student_assignments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "student_assignments" DROP COLUMN "accuracy",
DROP COLUMN "mistakes",
DROP COLUMN "score";
