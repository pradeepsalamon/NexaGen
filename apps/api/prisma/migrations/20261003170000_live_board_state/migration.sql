-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "boardState" JSONB,
ADD COLUMN     "boardStateUpdatedAt" TIMESTAMP(3);

