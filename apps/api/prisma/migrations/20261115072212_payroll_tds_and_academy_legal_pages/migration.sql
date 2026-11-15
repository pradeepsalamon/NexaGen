-- AlterTable
ALTER TABLE "coach_compensation_profiles" ADD COLUMN     "tdsRateBps" INTEGER;

-- AlterTable
ALTER TABLE "coach_payroll_records" ADD COLUMN     "tdsMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tdsSnapshot" JSONB;

-- CreateTable
CREATE TABLE "tenant_legal_pages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_legal_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "tdsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tdsRateBps" INTEGER NOT NULL DEFAULT 0,
    "tdsThresholdMinor" INTEGER NOT NULL DEFAULT 0,
    "financialYearStartMonth" INTEGER NOT NULL DEFAULT 4,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_legal_pages_tenantId_kind_key" ON "tenant_legal_pages"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_settings_tenantId_key" ON "payroll_settings"("tenantId");
