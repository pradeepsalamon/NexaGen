-- CreateEnum
CREATE TYPE "GameAutoSyncPolicy" AS ENUM ('OFF', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "GameAutoSyncRule" AS ENUM ('ALWAYS', 'NEVER');

-- AlterTable
ALTER TABLE "external_chess_accounts" ADD COLUMN     "autoSync" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastAutoSyncAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "gameAutoSyncRule" "GameAutoSyncRule",
ADD COLUMN     "gameAutoSyncRuleByAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "game_source_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "autoSyncPolicy" "GameAutoSyncPolicy" NOT NULL DEFAULT 'OFF',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_source_settings_pkey" PRIMARY KEY ("id")
);
