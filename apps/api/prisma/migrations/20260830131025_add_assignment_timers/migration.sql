-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "timeLimitMinutes" INTEGER;

-- AlterTable
ALTER TABLE "student_assignments" ADD COLUMN     "timeSpentSeconds" INTEGER;
