-- CreateEnum
CREATE TYPE "MessagingEvent" AS ENUM ('CLASS_SCHEDULED', 'CLASS_REMINDER', 'CLASS_CANCELLED', 'ASSIGNMENT_ASSIGNED', 'ASSIGNMENT_DUE_SOON', 'ASSIGNMENT_GRADED', 'ANNOUNCEMENT', 'ACCOUNT_WELCOME', 'ACCOUNT_APPROVED');

-- CreateEnum
CREATE TYPE "MessagingAudience" AS ENUM ('STUDENTS', 'COACHES', 'STUDENTS_AND_COACHES');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('EVERYONE', 'STUDENTS', 'COACHES', 'BATCH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CLASS_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'CLASS_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'CLASS_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'ANNOUNCEMENT';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_WELCOME';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_APPROVED';

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "audience" "AnnouncementAudience" NOT NULL DEFAULT 'EVERYONE',
ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "createdById" TEXT;

-- CreateTable
CREATE TABLE "messaging_rules" (
    "id" TEXT NOT NULL,
    "event" "MessagingEvent" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "audience" "MessagingAudience" NOT NULL DEFAULT 'STUDENTS',
    "leadTimeMinutes" INTEGER,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "whatsappTemplateName" TEXT,
    "whatsappTemplateLanguage" TEXT,
    "whatsappTemplateParams" TEXT[],
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_deliveries" (
    "id" TEXT NOT NULL,
    "event" "MessagingEvent" NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "status" "MessageDeliveryStatus" NOT NULL,
    "recipientId" TEXT,
    "recipientPhone" TEXT,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messaging_rules_event_key" ON "messaging_rules"("event");

-- CreateIndex
CREATE INDEX "message_deliveries_event_createdAt_idx" ON "message_deliveries"("event", "createdAt");

-- CreateIndex
CREATE INDEX "message_deliveries_status_idx" ON "message_deliveries"("status");

-- CreateIndex
CREATE INDEX "message_deliveries_recipientId_idx" ON "message_deliveries"("recipientId");

-- CreateIndex
CREATE INDEX "message_deliveries_createdAt_idx" ON "message_deliveries"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "message_deliveries_channel_dedupeKey_key" ON "message_deliveries"("channel", "dedupeKey");

-- CreateIndex
CREATE INDEX "announcements_audience_idx" ON "announcements"("audience");

-- CreateIndex
CREATE INDEX "announcements_batchId_idx" ON "announcements"("batchId");

-- CreateIndex
CREATE INDEX "announcements_createdAt_idx" ON "announcements"("createdAt");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_rules" ADD CONSTRAINT "messaging_rules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
