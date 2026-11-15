-- SaaS Phase 5 (docs/SAAS_MULTI_TENANCY.md §F, "Phase 5 plan"): per-academy
-- branding, and three catalogued branding features. Additive only.

-- CreateTable
CREATE TABLE "tenant_brandings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "displayName" TEXT,
    "tagline" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "defaultTheme" TEXT NOT NULL DEFAULT 'system',
    "logoLightUrl" TEXT,
    "logoDarkUrl" TEXT,
    "faviconUrl" TEXT,
    "loginImageUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "emailSenderName" TEXT,
    "replyToEmail" TEXT,
    "hidePoweredBy" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_brandings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_brandings_tenantId_key" ON "tenant_brandings"("tenantId");

-- New features (docs/SAAS_PLANS.md § "Adding a feature"): appended to the
-- seeded tiers so each tier still includes everything the cheaper ones do.
UPDATE "platform_plans" SET "features" = array_append("features", 'brandIdentity') WHERE "id" IN ('plan_growth', 'plan_business', 'plan_enterprise') AND NOT ('brandIdentity' = ANY("features"));
UPDATE "platform_plans" SET "features" = array_append("features", 'customDomain') WHERE "id" IN ('plan_business', 'plan_enterprise') AND NOT ('customDomain' = ANY("features"));
UPDATE "platform_plans" SET "features" = array_append("features", 'whiteLabel') WHERE "id" IN ('plan_enterprise') AND NOT ('whiteLabel' = ANY("features"));
