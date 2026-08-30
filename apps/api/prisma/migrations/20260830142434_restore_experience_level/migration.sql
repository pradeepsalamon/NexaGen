-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "experienceLevel" "ExperienceLevel" NOT NULL DEFAULT 'BEGINNER';
