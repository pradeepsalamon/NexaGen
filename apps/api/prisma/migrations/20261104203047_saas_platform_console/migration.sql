-- SaaS Phase 4 (docs/SAAS_MULTI_TENANCY.md § "Phase 4 plan"): the platform
-- console. New platform tables (audit log, plan versions, platform payments,
-- support visits, content packs) and additive columns. Then the backfill:
-- every plan's current state becomes its version 1, and every existing
-- subscription is pinned to it, so a later plan edit never changes an academy
-- that signed up before it (§G).

-- CreateEnum
CREATE TYPE "PlatformPaymentMethod" AS ENUM ('MANUAL', 'RAZORPAY');

-- CreateEnum
CREATE TYPE "ContentPackItemKind" AS ENUM ('PUZZLE_FOLDER');

-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "supportSessionId" TEXT;

-- AlterTable
ALTER TABLE "platform_plans" ADD COLUMN     "contentPackIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "graceAllows" TEXT[] DEFAULT ARRAY['chat', 'fees', 'homework', 'liveClasses']::TEXT[],
ADD COLUMN     "graceDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "pastDueDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "tenant_subscriptions" ADD COLUMN     "customPriceMinor" INTEGER,
ADD COLUMN     "dealNote" TEXT,
ADD COLUMN     "pendingPlanId" TEXT,
ADD COLUMN     "planVersion" INTEGER;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "creationKey" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isPlatformSupport" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "platform_plan_versions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "method" "PlatformPaymentMethod" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reference" TEXT,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_support_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffUserId" TEXT,
    "reason" TEXT NOT NULL,
    "entryTokenHash" TEXT NOT NULL,
    "entryExpiresAt" TIMESTAMP(3) NOT NULL,
    "enteredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "actionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_packs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_pack_items" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "kind" "ContentPackItemKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_pack_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetTenantId" TEXT,
    "reason" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_plan_versions_planId_version_key" ON "platform_plan_versions"("planId", "version");

-- CreateIndex
CREATE INDEX "platform_payments_tenantId_createdAt_idx" ON "platform_payments"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_support_sessions_entryTokenHash_key" ON "platform_support_sessions"("entryTokenHash");

-- CreateIndex
CREATE INDEX "platform_support_sessions_tenantId_createdAt_idx" ON "platform_support_sessions"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_pack_items_packId_kind_sourceId_key" ON "content_pack_items"("packId", "kind", "sourceId");

-- CreateIndex
CREATE INDEX "platform_audit_logs_createdAt_idx" ON "platform_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "platform_audit_logs_targetTenantId_createdAt_idx" ON "platform_audit_logs"("targetTenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_creationKey_key" ON "tenants"("creationKey");

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "platform_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_plan_versions" ADD CONSTRAINT "platform_plan_versions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "platform_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_support_sessions" ADD CONSTRAINT "platform_support_sessions_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_pack_items" ADD CONSTRAINT "content_pack_items_packId_fkey" FOREIGN KEY ("packId") REFERENCES "content_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: version 1 of every plan, and every subscription on it.
INSERT INTO "platform_plan_versions" ("id", "planId", "version", "snapshot", "createdAt")
SELECT 'ppv_' || md5(p."id" || ':1'), p."id", 1,
       jsonb_build_object(
         'currency', p."currency",
         'features', to_jsonb(p."features"),
         'graceAllows', to_jsonb(p."graceAllows"),
         'graceDays', p."graceDays",
         'limits', p."limits",
         'name', p."name",
         'pastDueDays', p."pastDueDays",
         'priceMonthlyMinor', p."priceMonthlyMinor",
         'priceYearlyMinor', p."priceYearlyMinor",
         'trialDays', p."trialDays"
       ),
       (now() AT TIME ZONE 'UTC')
FROM "platform_plans" p
ON CONFLICT ("planId", "version") DO NOTHING;

UPDATE "tenant_subscriptions" SET "planVersion" = 1 WHERE "planVersion" IS NULL;
