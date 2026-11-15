-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "pdfBytes" INTEGER;

-- CreateTable
CREATE TABLE "tenant_usage_days" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_usage_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_usage_days_day_idx" ON "tenant_usage_days"("day");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_usage_days_tenantId_day_key" ON "tenant_usage_days"("tenantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_files_tenantId_publicId_key" ON "uploaded_files"("tenantId", "publicId");

-- AddForeignKey
ALTER TABLE "tenant_usage_days" ADD CONSTRAINT "tenant_usage_days_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
