-- CreateEnum
CREATE TYPE "WeeklyReportStatus" AS ENUM ('DRAFT');

-- CreateTable
CREATE TABLE "weak_spot_tip_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "motif" TEXT NOT NULL,
    "baseText" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weak_spot_tip_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "studentId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" "WeeklyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "factsJson" JSONB NOT NULL,
    "templateText" TEXT NOT NULL,
    "finalText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weak_spot_tip_reviews_tenantId_motif_key" ON "weak_spot_tip_reviews"("tenantId", "motif");

-- CreateIndex
CREATE INDEX "weekly_reports_studentId_weekStart_idx" ON "weekly_reports"("studentId", "weekStart");

-- CreateIndex
CREATE INDEX "weekly_reports_tenantId_weekStart_idx" ON "weekly_reports"("tenantId", "weekStart");

-- CreateIndex
CREATE INDEX "weekly_reports_createdAt_idx" ON "weekly_reports"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reports_tenantId_studentId_weekStart_key" ON "weekly_reports"("tenantId", "studentId", "weekStart");

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

