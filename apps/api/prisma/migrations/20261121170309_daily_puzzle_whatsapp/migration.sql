-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DAILY_PUZZLE';

-- AlterEnum
ALTER TYPE "MessagingEvent" ADD VALUE 'DAILY_PUZZLE';

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "dailyPuzzleWhatsAppAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messaging_rules" ADD COLUMN     "scheduleDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "dailyPuzzleAt" TIMESTAMP(3);

