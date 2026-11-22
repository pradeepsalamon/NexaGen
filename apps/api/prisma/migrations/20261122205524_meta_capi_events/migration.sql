-- CreateEnum
CREATE TYPE "MetaCapiEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "visitor_sessions" ADD COLUMN     "adConsent" BOOLEAN,
ADD COLUMN     "adConsentAt" TIMESTAMP(3),
ADD COLUMN     "fbp" TEXT;

-- CreateTable
CREATE TABLE "meta_capi_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "leadId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "valueMinor" INTEGER,
    "currency" TEXT,
    "status" "MetaCapiEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_capi_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_capi_events_status_nextAttemptAt_idx" ON "meta_capi_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "meta_capi_events_createdAt_idx" ON "meta_capi_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "meta_capi_events_leadId_eventName_key" ON "meta_capi_events"("leadId", "eventName");

-- AddForeignKey
ALTER TABLE "meta_capi_events" ADD CONSTRAINT "meta_capi_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
