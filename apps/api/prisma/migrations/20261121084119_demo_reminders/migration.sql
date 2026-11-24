-- AlterTable
ALTER TABLE "demo_class_registrations" ADD COLUMN     "eveningReminderAt" TIMESTAMP(3),
ADD COLUMN     "hourReminderAt" TIMESTAMP(3),
ADD COLUMN     "missedMessageAt" TIMESTAMP(3);
