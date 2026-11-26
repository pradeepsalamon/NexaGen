-- AI class recaps (docs/CLASS_RECAPS.md): one recap per class, drafted from the
-- coach's transcript, plus each academy's switches. The plan feature joins the
-- Enterprise plan (operators add it to other plans in the console). Additive only.

-- CreateEnum
CREATE TYPE "ClassRecapStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'PUBLISHED', 'DISCARDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ClassRecapProvider" AS ENUM ('LOCAL', 'OUTSIDE');

-- CreateTable
CREATE TABLE "class_recaps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "classId" TEXT NOT NULL,
    "status" "ClassRecapStatus" NOT NULL DEFAULT 'QUEUED',
    "notBefore" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "regenerations" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "provider" "ClassRecapProvider",
    "providerName" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "modelCalls" INTEGER,
    "latencyMs" INTEGER,
    "removedCount" INTEGER,
    "draftJson" JSONB,
    "contentJson" JSONB,
    "editedAt" TIMESTAMP(3),
    "editedById" TEXT,
    "generatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_recaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_recap_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "provider" "ClassRecapProvider" NOT NULL DEFAULT 'LOCAL',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_recap_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_recaps_classId_key" ON "class_recaps"("classId");

-- CreateIndex
CREATE INDEX "class_recaps_status_notBefore_idx" ON "class_recaps"("status", "notBefore");

-- CreateIndex
CREATE INDEX "class_recaps_tenantId_status_updatedAt_idx" ON "class_recaps"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "class_recap_settings_tenantId_key" ON "class_recap_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "class_recaps" ADD CONSTRAINT "class_recaps_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Plan feature (docs/SAAS_PLANS.md: a new feature joins Enterprise by migration).
UPDATE "platform_plans" SET "features" = array_append("features", 'aiClassRecaps') WHERE "id" IN ('plan_enterprise') AND NOT ('aiClassRecaps' = ANY("features"));
