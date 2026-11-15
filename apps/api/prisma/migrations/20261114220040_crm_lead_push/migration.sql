-- CreateEnum
CREATE TYPE "CrmLeadPushStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "crm_lead_pushes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "leadId" TEXT NOT NULL,
    "status" "CrmLeadPushStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "externalId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_lead_pushes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_lead_pushes_leadId_key" ON "crm_lead_pushes"("leadId");

-- CreateIndex
CREATE INDEX "crm_lead_pushes_status_nextAttemptAt_idx" ON "crm_lead_pushes"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "crm_lead_pushes" ADD CONSTRAINT "crm_lead_pushes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

