-- CreateEnum
CREATE TYPE "TenantIntegrityRunStatus" AS ENUM ('OK', 'VIOLATIONS', 'FAILED');

-- CreateTable
CREATE TABLE "tenant_integrity_runs" (
    "id" TEXT NOT NULL,
    "status" "TenantIntegrityRunStatus" NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "linksChecked" INTEGER NOT NULL DEFAULT 0,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "violations" JSONB NOT NULL DEFAULT '[]',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "tenant_integrity_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_integrity_runs_startedAt_idx" ON "tenant_integrity_runs"("startedAt");
