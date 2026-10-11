-- CreateEnum
CREATE TYPE "BatchType" AS ENUM ('GROUP', 'INDIVIDUAL', 'BUDDY');

-- AlterTable
ALTER TABLE "batches" ADD COLUMN "batchType" "BatchType";

-- AlterTable
ALTER TABLE "classes" ADD COLUMN "batchType" "BatchType";
