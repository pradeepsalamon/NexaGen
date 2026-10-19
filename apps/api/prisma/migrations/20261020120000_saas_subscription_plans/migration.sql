-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE', 'CANCEL_SCHEDULED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenantSubscriptionEventSource" AS ENUM ('ADMIN', 'SYSTEM', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "PlatformStaffRole" AS ENUM ('PLATFORM_ADMIN', 'PLATFORM_SUPPORT');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "limits" JSONB NOT NULL DEFAULT '{}',
    "priceMonthlyMinor" INTEGER,
    "priceYearlyMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "TenantSubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_subscription_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "source" "TenantSubscriptionEventSource" NOT NULL,
    "fromStatus" "TenantSubscriptionStatus",
    "toStatus" "TenantSubscriptionStatus",
    "fromPlanCode" TEXT,
    "toPlanCode" TEXT,
    "actorUserId" TEXT,
    "note" TEXT,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PlatformStaffRole" NOT NULL DEFAULT 'PLATFORM_ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "platform_plans_code_key" ON "platform_plans"("code");

-- CreateIndex
CREATE INDEX "platform_plans_sortOrder_idx" ON "platform_plans"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_subscriptions_tenantId_key" ON "tenant_subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_subscriptions_planId_idx" ON "tenant_subscriptions"("planId");

-- CreateIndex
CREATE INDEX "tenant_subscriptions_status_idx" ON "tenant_subscriptions"("status");

-- CreateIndex
CREATE INDEX "tenant_subscription_events_tenantId_createdAt_idx" ON "tenant_subscription_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_subscription_events_subscriptionId_idx" ON "tenant_subscription_events"("subscriptionId");

-- CreateIndex
CREATE INDEX "tenant_subscription_events_actorUserId_idx" ON "tenant_subscription_events"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_staff_userId_key" ON "platform_staff"("userId");

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "platform_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscription_events" ADD CONSTRAINT "tenant_subscription_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscription_events" ADD CONSTRAINT "tenant_subscription_events_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "tenant_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscription_events" ADD CONSTRAINT "tenant_subscription_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_staff" ADD CONSTRAINT "platform_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed: the default plans (DEFAULT_PLATFORM_PLANS in @nexa-chess/types) and the
-- existing academy as tenant `tenant_nexa` on Enterprise, so every feature and
-- limit it has today stays exactly as it is. Prices are integer paise.
INSERT INTO "platform_plans" ("id", "code", "name", "description", "sortOrder", "features", "limits", "priceMonthlyMinor", "priceYearlyMinor", "currency", "trialDays", "updatedAt") VALUES
  ('plan_starter', 'STARTER', 'Starter', 'For a coach or a small academy getting started.', 10,
   ARRAY['directChat','gameLibrary'],
   '{"maxBatches":10,"maxCoaches":3,"maxConcurrentLiveClasses":2,"maxStudents":50}', 249900, 2499000, 'INR', 14, CURRENT_TIMESTAMP),
  ('plan_growth', 'GROWTH', 'Growth', 'For growing academies that sell courses and run demo classes.', 20,
   ARRAY['directChat','gameLibrary','classRecording','coachFeedback','courses','customBranding','demoClasses','interactiveClassroom','leadsCrm','smartRevision','studentPayments'],
   '{"maxBatches":50,"maxCoaches":15,"maxConcurrentLiveClasses":5,"maxStudents":250}', 699900, 6999000, 'INR', 14, CURRENT_TIMESTAMP),
  ('plan_business', 'BUSINESS', 'Business', 'For established academies: payroll, analytics and automation.', 30,
   ARRAY['directChat','gameLibrary','classRecording','coachFeedback','courses','customBranding','demoClasses','interactiveClassroom','leadsCrm','smartRevision','studentPayments','advancedAnalytics','coachPayroll','gameAnalysis','messagingAutomation'],
   '{"maxBatches":200,"maxCoaches":50,"maxConcurrentLiveClasses":15,"maxStudents":1000}', 1499900, 14999000, 'INR', 14, CURRENT_TIMESTAMP),
  ('plan_enterprise', 'ENTERPRISE', 'Enterprise', 'Everything, without limits.', 40,
   ARRAY['advancedAnalytics','classRecording','coachFeedback','coachPayroll','courses','customBranding','demoClasses','directChat','gameAnalysis','gameLibrary','interactiveClassroom','leadsCrm','messagingAutomation','smartRevision','studentPayments'],
   '{"maxBatches":null,"maxCoaches":null,"maxConcurrentLiveClasses":null,"maxStudents":null}', NULL, NULL, 'INR', 0, CURRENT_TIMESTAMP);

INSERT INTO "tenants" ("id", "slug", "name", "status", "updatedAt")
VALUES ('tenant_nexa', 'nexa', 'Nexa Chess', 'ACTIVE', CURRENT_TIMESTAMP);

INSERT INTO "tenant_subscriptions" ("id", "tenantId", "planId", "status", "updatedAt")
VALUES ('sub_tenant_nexa', 'tenant_nexa', 'plan_enterprise', 'ACTIVE', CURRENT_TIMESTAMP);
