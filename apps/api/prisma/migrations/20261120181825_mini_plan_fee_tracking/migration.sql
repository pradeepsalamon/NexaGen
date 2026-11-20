-- Fee tracking split out of online student payments, in-class activities on
-- every plan, and the Mini plan
-- (docs/SAAS_PLANS.md "Fee tracking and online payments", "Mini").
--
-- `feeTracking` gates manual (cash / UPI / bank) payments, fee plans, invoices
-- and the billing pages. `studentPayments` keeps online checkout, gateways,
-- discounts, refunds and subscriptions, and always implies `feeTracking`
-- (IMPLIED_PLAN_FEATURES), so pinned plan versions and deals written before
-- this change keep everything without a data change. Additive only.

-- Every plan that sells online already has it by implication; list it anyway so
-- the rows read correctly in the platform console.
UPDATE "platform_plans" SET "features" = array_append("features", 'feeTracking')
WHERE "id" IN ('plan_starter', 'plan_growth', 'plan_business', 'plan_enterprise')
  AND NOT ('feeTracking' = ANY("features"));

-- In-class activities (simuls, polls, puzzle rush, matches, activity queue) on
-- every plan (owner 2026-11-20); Growth and up had them already.
UPDATE "platform_plans" SET "features" = array_append("features", 'interactiveClassroom')
WHERE "id" IN ('plan_starter')
  AND NOT ('interactiveClassroom' = ANY("features"));

-- Mini: one coach on a NexaChess subdomain. Prices and limits are editable in
-- the platform console; skipped if a plan with this id or code already exists.
INSERT INTO "platform_plans" (
  "id", "code", "name", "description", "sortOrder", "features", "limits",
  "priceMonthlyMinor", "priceYearlyMinor", "currency", "trialDays", "updatedAt"
)
SELECT 'plan_mini', 'MINI', 'Mini', 'For one coach teaching on their own, on a NexaChess address.', 5,
       ARRAY['directChat', 'feeTracking', 'gameLibrary', 'interactiveClassroom'],
       '{"maxBatches":5,"maxCoaches":1,"maxConcurrentLiveClasses":1,"maxStudents":25}',
       99900, 999000, 'INR', 14, (now() AT TIME ZONE 'UTC')
WHERE NOT EXISTS (SELECT 1 FROM "platform_plans" WHERE "id" = 'plan_mini' OR "code" = 'MINI');

-- Version 1 snapshot, as the platform console writes for a new plan.
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
WHERE p."id" = 'plan_mini'
ON CONFLICT ("planId", "version") DO NOTHING;
