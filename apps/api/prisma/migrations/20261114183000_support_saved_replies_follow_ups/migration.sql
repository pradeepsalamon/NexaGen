-- AlterTable
ALTER TABLE "support_conversations" ADD COLUMN     "nudgedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "remindersSent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "support_saved_replies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "body" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "showInBot" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_saved_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_saved_replies_tenantId_sortOrder_idx" ON "support_saved_replies"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "support_tickets_leadId_idx" ON "support_tickets"("leadId");

-- CreateIndex
CREATE INDEX "support_tickets_status_createdAt_idx" ON "support_tickets"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_saved_replies" ADD CONSTRAINT "support_saved_replies_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

