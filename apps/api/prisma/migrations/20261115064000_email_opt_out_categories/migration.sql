-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('CLASSES', 'HOMEWORK', 'ANNOUNCEMENTS', 'ACCOUNT', 'REFERRALS', 'ACADEMY_TEAM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailOptOutCategories" "EmailCategory"[] DEFAULT ARRAY[]::"EmailCategory"[];

