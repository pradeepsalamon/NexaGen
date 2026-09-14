-- AlterEnum
ALTER TYPE "MessagingEvent" ADD VALUE 'INVOICE_ISSUED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_ISSUED';

-- AlterTable
ALTER TABLE "message_deliveries" ADD COLUMN     "documentFilename" TEXT,
ADD COLUMN     "documentLink" TEXT,
ADD COLUMN     "documentMediaId" TEXT;
