-- AlterTable
ALTER TABLE "daily_puzzle_entries" ADD COLUMN     "whatsappHintAt" TIMESTAMP(3),
ADD COLUMN     "whatsappTries" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "daily_puzzle_settings" ADD COLUMN     "whatsappAnswerAfter" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "whatsappHintAfter" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "whatsappLevel" "DailyPuzzleLevel" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "whatsappMaxTries" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "message_deliveries" ADD COLUMN     "imageLink" TEXT;

-- AlterTable
ALTER TABLE "messaging_rules" ADD COLUMN     "whatsappTemplateImageHeader" BOOLEAN NOT NULL DEFAULT false;
