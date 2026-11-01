-- AlterEnum
ALTER TYPE "MessagingEvent" ADD VALUE 'CLASS_SUBSTITUTE_ASSIGNED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CLASS_SUBSTITUTE_ASSIGNED';

-- AlterTable
ALTER TABLE "class_attendance" ADD COLUMN     "correctedAt" TIMESTAMP(3);
