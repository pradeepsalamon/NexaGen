-- CreateEnum
CREATE TYPE "ReferralStageTrigger" AS ENUM ('MANUAL', 'LINK_VISITED', 'DEMO_BOOKED', 'DEMO_ATTENDED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "ReferralRewardKind" AS ENUM ('PER_REFERRAL', 'MILESTONE');

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING', 'CREDITED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReferralCreditEntryType" AS ENUM ('REWARD', 'REWARD_REVERSAL', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'PAYMENT_CODE', 'PAYMENT_CODE_REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ReferralWithdrawalStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "discounts" ADD COLUMN     "restrictedToUserId" TEXT;

-- CreateTable
CREATE TABLE "referral_stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'secondary',
    "position" INTEGER NOT NULL,
    "trigger" "ReferralStageTrigger" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_visits" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "referralId" TEXT,
    "visitorId" TEXT NOT NULL,
    "landingUrl" TEXT,
    "referrer" TEXT,
    "deviceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "visitorId" TEXT,
    "leadId" TEXT,
    "stageId" TEXT NOT NULL,
    "prospectName" TEXT,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_stage_reaches" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_stage_reaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_stage_events" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_stage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_reward_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stageId" TEXT NOT NULL,
    "kind" "ReferralRewardKind" NOT NULL DEFAULT 'PER_REFERRAL',
    "milestoneCount" INTEGER,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "roles" "UserRole"[],
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_reward_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_rewards" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referralId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_credit_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReferralCreditEntryType" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "rewardId" TEXT,
    "withdrawalId" TEXT,
    "discountId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_withdrawals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "payoutDetails" TEXT NOT NULL,
    "status" "ReferralWithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "adminNote" TEXT,
    "payoutReference" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "referrerRoles" "UserRole"[] DEFAULT ARRAY['STUDENT', 'COACH', 'SALES']::"UserRole"[],
    "attributionDays" INTEGER NOT NULL DEFAULT 30,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "withdrawalRoles" "UserRole"[] DEFAULT ARRAY['COACH', 'SALES']::"UserRole"[],
    "minWithdrawalMinor" INTEGER NOT NULL DEFAULT 50000,
    "paymentUseRoles" "UserRole"[] DEFAULT ARRAY['STUDENT']::"UserRole"[],
    "programTerms" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_stages_position_idx" ON "referral_stages"("position");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_userId_key" ON "referral_codes"("userId");

-- CreateIndex
CREATE INDEX "referral_visits_codeId_createdAt_idx" ON "referral_visits"("codeId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_visits_referralId_idx" ON "referral_visits"("referralId");

-- CreateIndex
CREATE INDEX "referral_visits_createdAt_idx" ON "referral_visits"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_leadId_key" ON "referrals"("leadId");

-- CreateIndex
CREATE INDEX "referrals_referrerId_stageId_idx" ON "referrals"("referrerId", "stageId");

-- CreateIndex
CREATE INDEX "referrals_stageId_idx" ON "referrals"("stageId");

-- CreateIndex
CREATE INDEX "referrals_createdAt_idx" ON "referrals"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_codeId_visitorId_key" ON "referrals"("codeId", "visitorId");

-- CreateIndex
CREATE INDEX "referral_stage_reaches_stageId_idx" ON "referral_stage_reaches"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_stage_reaches_referralId_stageId_key" ON "referral_stage_reaches"("referralId", "stageId");

-- CreateIndex
CREATE INDEX "referral_stage_events_referralId_createdAt_idx" ON "referral_stage_events"("referralId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_reward_rules_stageId_idx" ON "referral_reward_rules"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_dedupeKey_key" ON "referral_rewards"("dedupeKey");

-- CreateIndex
CREATE INDEX "referral_rewards_referrerId_createdAt_idx" ON "referral_rewards"("referrerId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_rewards_status_idx" ON "referral_rewards"("status");

-- CreateIndex
CREATE INDEX "referral_credit_entries_userId_createdAt_idx" ON "referral_credit_entries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_credit_entries_rewardId_idx" ON "referral_credit_entries"("rewardId");

-- CreateIndex
CREATE INDEX "referral_credit_entries_withdrawalId_idx" ON "referral_credit_entries"("withdrawalId");

-- CreateIndex
CREATE INDEX "referral_credit_entries_discountId_idx" ON "referral_credit_entries"("discountId");

-- CreateIndex
CREATE INDEX "referral_withdrawals_userId_createdAt_idx" ON "referral_withdrawals"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_withdrawals_status_idx" ON "referral_withdrawals"("status");

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_restrictedToUserId_fkey" FOREIGN KEY ("restrictedToUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_visits" ADD CONSTRAINT "referral_visits_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "referral_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_visits" ADD CONSTRAINT "referral_visits_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "referral_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "referral_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_stage_reaches" ADD CONSTRAINT "referral_stage_reaches_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_stage_reaches" ADD CONSTRAINT "referral_stage_reaches_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "referral_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_stage_events" ADD CONSTRAINT "referral_stage_events_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_stage_events" ADD CONSTRAINT "referral_stage_events_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "referral_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_stage_events" ADD CONSTRAINT "referral_stage_events_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "referral_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_stage_events" ADD CONSTRAINT "referral_stage_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_reward_rules" ADD CONSTRAINT "referral_reward_rules_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "referral_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_reward_rules" ADD CONSTRAINT "referral_reward_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "referral_reward_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_credit_entries" ADD CONSTRAINT "referral_credit_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_credit_entries" ADD CONSTRAINT "referral_credit_entries_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "referral_rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_credit_entries" ADD CONSTRAINT "referral_credit_entries_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "referral_withdrawals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_credit_entries" ADD CONSTRAINT "referral_credit_entries_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_credit_entries" ADD CONSTRAINT "referral_credit_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_withdrawals" ADD CONSTRAINT "referral_withdrawals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_withdrawals" ADD CONSTRAINT "referral_withdrawals_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_settings" ADD CONSTRAINT "referral_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Hand-written: invariants and seed data (docs/REFERRALS.md) ──

-- Each automatic trigger names at most one stage; MANUAL stages are unlimited.
CREATE UNIQUE INDEX "referral_stages_trigger_automatic_key"
  ON "referral_stages"("trigger") WHERE "trigger" <> 'MANUAL';

-- The default pipeline. Admins rename, reorder and add stages from
-- /admin/referrals; the automatic ones cannot be deleted.
INSERT INTO "referral_stages" ("id", "name", "description", "tone", "position", "trigger", "updatedAt") VALUES
  ('refstage_visited',   'Visited',       'Opened the referral link.',                  'secondary',   10, 'LINK_VISITED',  CURRENT_TIMESTAMP),
  ('refstage_booked',    'Demo booked',   'Booked a free demo class.',                  'info',        20, 'DEMO_BOOKED',   CURRENT_TIMESTAMP),
  ('refstage_attended',  'Demo attended', 'Joined the demo class.',                     'warning',     30, 'DEMO_ATTENDED', CURRENT_TIMESTAMP),
  ('refstage_converted', 'Onboarded',     'Enrolled at the academy (set by an admin).', 'success',     40, 'CONVERTED',     CURRENT_TIMESTAMP),
  ('refstage_lost',      'Not joined',    'Decided not to join.',                       'destructive', 50, 'LOST',          CURRENT_TIMESTAMP);

INSERT INTO "referral_settings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);

-- SaaS plans: the referral program ships with Growth and up, so the existing
-- academy (Enterprise) keeps every feature it has today plus this one.
UPDATE "platform_plans"
   SET "features" = array_append("features", 'referralProgram')
 WHERE "id" IN ('plan_growth', 'plan_business', 'plan_enterprise')
   AND NOT ('referralProgram' = ANY("features"));
