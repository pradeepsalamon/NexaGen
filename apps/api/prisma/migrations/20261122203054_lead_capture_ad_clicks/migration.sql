-- AlterTable
ALTER TABLE "support_settings" ADD COLUMN     "captureLeads" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "whatsapp_webhook_events" ADD COLUMN     "adReferral" JSONB;

-- CreateTable
CREATE TABLE "lead_ad_clicks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "leadId" TEXT NOT NULL,
    "firstSourceType" TEXT,
    "firstAdId" TEXT,
    "firstCtwaClid" TEXT,
    "firstHeadline" TEXT,
    "firstSourceUrl" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "latestSourceType" TEXT,
    "latestAdId" TEXT,
    "latestCtwaClid" TEXT,
    "latestHeadline" TEXT,
    "latestSourceUrl" TEXT,
    "latestSeenAt" TIMESTAMP(3) NOT NULL,
    "latestMessageId" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_ad_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_ad_clicks_leadId_key" ON "lead_ad_clicks"("leadId");

-- CreateIndex
CREATE INDEX "lead_ad_clicks_latestAdId_idx" ON "lead_ad_clicks"("latestAdId");

-- AddForeignKey
ALTER TABLE "lead_ad_clicks" ADD CONSTRAINT "lead_ad_clicks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
