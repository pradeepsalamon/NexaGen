-- CreateEnum
CREATE TYPE "ReferralVoucherType" AS ENUM ('PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'FREE_DAYS');

-- CreateEnum
CREATE TYPE "ReferralRedemptionStatus" AS ENUM ('PENDING', 'FULFILLED', 'REJECTED', 'CANCELLED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReferralCreditEntryType" ADD VALUE 'REDEMPTION';
ALTER TYPE "ReferralCreditEntryType" ADD VALUE 'REDEMPTION_REVERSAL';

-- AlterTable
ALTER TABLE "referral_credit_entries" ADD COLUMN     "redemptionId" TEXT;

-- AlterTable
ALTER TABLE "referral_rewards" ADD COLUMN     "stageId" TEXT,
ALTER COLUMN "ruleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "referral_settings" ADD COLUMN     "autoApproveCash" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoApprovePoints" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxRedemptionsPer30Days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "redemptionsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "referral_stages" ADD COLUMN     "coachCashMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "newMemberPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "salesCashMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "studentPoints" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "referral_vouchers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ReferralVoucherType" NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "percentOff" INTEGER,
    "amountOffMinor" INTEGER,
    "maxDiscountMinor" INTEGER,
    "minOrderMinor" INTEGER,
    "freeDays" INTEGER,
    "planIds" TEXT[],
    "codeValidDays" INTEGER,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER,
    "perUserLimit" INTEGER DEFAULT 1,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_redemptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "voucherId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ReferralRedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "pointsCost" INTEGER NOT NULL,
    "voucherName" TEXT NOT NULL,
    "type" "ReferralVoucherType" NOT NULL,
    "percentOff" INTEGER,
    "amountOffMinor" INTEGER,
    "maxDiscountMinor" INTEGER,
    "minOrderMinor" INTEGER,
    "freeDays" INTEGER,
    "currency" TEXT NOT NULL,
    "discountId" TEXT,
    "planId" TEXT,
    "entitlementId" TEXT,
    "accessEndsAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_vouchers_isActive_sortOrder_idx" ON "referral_vouchers"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "referral_redemptions_discountId_key" ON "referral_redemptions"("discountId");

-- CreateIndex
CREATE INDEX "referral_redemptions_voucherId_status_idx" ON "referral_redemptions"("voucherId", "status");

-- CreateIndex
CREATE INDEX "referral_redemptions_userId_createdAt_idx" ON "referral_redemptions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_redemptions_status_idx" ON "referral_redemptions"("status");

-- CreateIndex
CREATE INDEX "referral_credit_entries_redemptionId_idx" ON "referral_credit_entries"("redemptionId");

-- CreateIndex
CREATE INDEX "referral_rewards_stageId_idx" ON "referral_rewards"("stageId");

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "referral_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_credit_entries" ADD CONSTRAINT "referral_credit_entries_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "referral_redemptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_vouchers" ADD CONSTRAINT "referral_vouchers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "referral_vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Data: the referral rebuild (docs/REFERRALS.md § "What changed in the rebuild") ──

-- Per-referral rules become stage values: students earn points, coaches and
-- SALES earn money, new members get points. Each column takes the sum of the
-- active rules that paid that party at that stage.
UPDATE "referral_stages" s SET
  "studentPoints" = COALESCE((
    SELECT SUM(r."amountMinor") FROM "referral_reward_rules" r
    WHERE r."stageId" = s."id" AND r."isActive" AND r."kind" = 'PER_REFERRAL' AND r."beneficiary" = 'REFERRER'
      AND r."unit" = 'POINTS' AND (cardinality(r."roles") = 0 OR 'STUDENT' = ANY(r."roles"))
  ), 0),
  "coachCashMinor" = COALESCE((
    SELECT SUM(r."amountMinor") FROM "referral_reward_rules" r
    WHERE r."stageId" = s."id" AND r."isActive" AND r."kind" = 'PER_REFERRAL' AND r."beneficiary" = 'REFERRER'
      AND r."unit" = 'CASH' AND (cardinality(r."roles") = 0 OR 'COACH' = ANY(r."roles"))
  ), 0),
  "salesCashMinor" = COALESCE((
    SELECT SUM(r."amountMinor") FROM "referral_reward_rules" r
    WHERE r."stageId" = s."id" AND r."isActive" AND r."kind" = 'PER_REFERRAL' AND r."beneficiary" = 'REFERRER'
      AND r."unit" = 'CASH' AND (cardinality(r."roles") = 0 OR 'SALES' = ANY(r."roles"))
  ), 0),
  "newMemberPoints" = COALESCE((
    SELECT SUM(r."amountMinor") FROM "referral_reward_rules" r
    WHERE r."stageId" = s."id" AND r."isActive" AND r."beneficiary" = 'REFERRED' AND r."unit" = 'POINTS'
  ), 0);

-- Only milestone bonuses stay rules: points for students only, money for
-- coaches/SALES only. Everything else is switched off (kept for history).
UPDATE "referral_reward_rules" SET "isActive" = false
WHERE NOT (
  "kind" = 'MILESTONE' AND "beneficiary" = 'REFERRER' AND (
    ("unit" = 'POINTS' AND "roles" = ARRAY['STUDENT']::"UserRole"[])
    OR ("unit" = 'CASH' AND cardinality("roles") > 0 AND NOT ('STUDENT' = ANY("roles")))
  )
);

-- Students no longer withdraw money; points are no longer sent, converted or
-- paid with (the columns stay, nothing reads them).
UPDATE "referral_settings" SET
  "withdrawalRoles" = array_remove("withdrawalRoles", 'STUDENT'::"UserRole"),
  "pointsTransferEnabled" = false,
  "pointsConversionEnabled" = false,
  "pointsPaymentEnabled" = false;
