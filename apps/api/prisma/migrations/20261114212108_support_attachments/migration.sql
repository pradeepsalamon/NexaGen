-- CreateEnum
CREATE TYPE "SupportAttachmentStatus" AS ENUM ('PENDING', 'STORED', 'FAILED');

-- AlterTable
ALTER TABLE "whatsapp_webhook_events" ADD COLUMN     "mediaCaption" TEXT,
ADD COLUMN     "mediaFilename" TEXT,
ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "mediaMimeType" TEXT;

-- CreateTable
CREATE TABLE "support_attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "messageId" TEXT,
    "mediaId" TEXT NOT NULL,
    "mimeType" TEXT,
    "filename" TEXT,
    "status" "SupportAttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "error" TEXT,
    "storageKey" TEXT,
    "bytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_attachments_messageId_key" ON "support_attachments"("messageId");

-- CreateIndex
CREATE INDEX "support_attachments_status_createdAt_idx" ON "support_attachments"("status", "createdAt");

-- CreateIndex
CREATE INDEX "support_attachments_messageId_idx" ON "support_attachments"("messageId");

-- AddForeignKey
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "support_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

