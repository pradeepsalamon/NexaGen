import { DEFAULT_PLATFORM_PLANS, DEFAULT_TENANT_ID } from "@nexa-chess/types";
import type { PrismaClient } from "@prisma/client";

/**
 * Creates the default plans and the `tenant_nexa` tenant on Enterprise when
 * they are missing — never overwrites an edited row. Production gets these
 * from the `saas_subscription_plans` migration; this covers the dev seed and
 * the integration suite (which truncates every table between tests).
 */
export async function ensurePlatformDefaults(
  prisma: Pick<PrismaClient, "platformPlan" | "tenant" | "tenantSubscription">
) {
  await prisma.platformPlan.createMany({
    data: DEFAULT_PLATFORM_PLANS.map((plan) => ({
      code: plan.code,
      currency: plan.currency,
      description: plan.description,
      features: plan.features,
      id: plan.id,
      limits: plan.limits,
      name: plan.name,
      priceMonthlyMinor: plan.priceMonthlyMinor,
      priceYearlyMinor: plan.priceYearlyMinor,
      sortOrder: plan.sortOrder,
      trialDays: plan.trialDays
    })),
    skipDuplicates: true
  });
  await prisma.tenant.upsert({
    create: { id: DEFAULT_TENANT_ID, name: "Nexa Chess", slug: "nexa" },
    update: {},
    where: { id: DEFAULT_TENANT_ID }
  });
  await prisma.tenantSubscription.upsert({
    create: { id: `sub_${DEFAULT_TENANT_ID}`, planId: "plan_enterprise", status: "ACTIVE", tenantId: DEFAULT_TENANT_ID },
    update: {},
    where: { tenantId: DEFAULT_TENANT_ID }
  });
}
