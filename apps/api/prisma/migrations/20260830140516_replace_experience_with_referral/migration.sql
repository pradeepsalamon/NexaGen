/*
  Warnings:

  - You are about to drop the column `timeLimitMinutes` on the `assignments` table. All the data in the column will be lost.
  - You are about to drop the column `completed_at` on the `student_assignments` table. All the data in the column will be lost.
  - You are about to drop the column `time_spent_seconds` on the `student_assignments` table. All the data in the column will be lost.
  - You are about to drop the column `experienceLevel` on the `student_profiles` table. All the data in the column will be lost.
  - You are about to drop the `recording_watch_progress` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ReferralSource" AS ENUM ('ADS', 'FRIEND', 'SCHOOL', 'OTHER');

-- DropForeignKey
ALTER TABLE "recording_watch_progress" DROP CONSTRAINT "recording_watch_progress_classId_fkey";

-- DropForeignKey
ALTER TABLE "recording_watch_progress" DROP CONSTRAINT "recording_watch_progress_liveSessionId_fkey";

-- DropForeignKey
ALTER TABLE "recording_watch_progress" DROP CONSTRAINT "recording_watch_progress_studentId_fkey";

-- AlterTable
ALTER TABLE "assignments" DROP COLUMN "timeLimitMinutes";

-- AlterTable
ALTER TABLE "student_assignments" DROP COLUMN "completed_at",
DROP COLUMN "time_spent_seconds",
ADD COLUMN     "completedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "student_profiles" DROP COLUMN "experienceLevel",
ADD COLUMN     "referralSource" "ReferralSource" NOT NULL DEFAULT 'OTHER';

-- DropTable
DROP TABLE "recording_watch_progress";

-- DropEnum
DROP TYPE "ExperienceLevel";
