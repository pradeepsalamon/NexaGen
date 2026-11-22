-- CreateEnum
CREATE TYPE "TenantClosureChoice" AS ENUM ('KEEP_DATA', 'DELETE_DATA');

-- CreateEnum
CREATE TYPE "TenantClosureStatus" AS ENUM ('REQUESTED', 'WITHDRAWN', 'DECLINED', 'CLOSED', 'PURGE_SCHEDULED', 'PURGING', 'PURGED', 'CANCELLED', 'REOPENED');

-- CreateTable
CREATE TABLE "tenant_closures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "choice" "TenantClosureChoice" NOT NULL,
    "status" "TenantClosureStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "requestedByUserId" TEXT,
    "requestedByName" TEXT,
    "requestedByEmail" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "purgeAfter" TIMESTAMP(3),
    "purgeStartedAt" TIMESTAMP(3),
    "purgeLeaseUntil" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "purgeReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_closures_tenantId_createdAt_idx" ON "tenant_closures"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_closures_status_purgeAfter_idx" ON "tenant_closures"("status", "purgeAfter");

-- AddForeignKey
ALTER TABLE "tenant_closures" ADD CONSTRAINT "tenant_closures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One open closure per academy (docs/ACADEMY_CLOSURE.md): a second request, or a
-- second approval racing the first, fails on this instead of closing twice.
CREATE UNIQUE INDEX "tenant_closures_one_open_per_tenant" ON "tenant_closures"("tenantId")
  WHERE "status" IN ('REQUESTED', 'PURGE_SCHEDULED', 'PURGING');
