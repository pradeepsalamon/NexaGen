-- CreateEnum
CREATE TYPE "MessagingScheduleMode" AS ENUM ('IMMEDIATE', 'DAILY', 'WEEKLY');

-- AlterEnum
ALTER TYPE "MessageDeliveryStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "message_deliveries" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "linkPath" TEXT,
ADD COLUMN     "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "templateLanguage" TEXT,
ADD COLUMN     "templateName" TEXT,
ADD COLUMN     "templateParams" TEXT[],
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "messaging_rules" ADD COLUMN     "scheduleDayOfWeek" INTEGER,
ADD COLUMN     "scheduleHour" INTEGER,
ADD COLUMN     "scheduleMinute" INTEGER,
ADD COLUMN     "scheduleMode" "MessagingScheduleMode" NOT NULL DEFAULT 'IMMEDIATE',
ADD COLUMN     "weekdaysOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "message_deliveries_status_scheduledFor_idx" ON "message_deliveries"("status", "scheduledFor");
