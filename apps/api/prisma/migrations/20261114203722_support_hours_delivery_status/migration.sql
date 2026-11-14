-- AlterTable
ALTER TABLE "message_deliveries" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "support_settings" ADD COLUMN     "hours" JSONB,
ADD COLUMN     "outOfHoursMessage" TEXT;

