-- CreateEnum
CREATE TYPE "ReferralWallet" AS ENUM ('CASH', 'POINTS');

-- CreateEnum
CREATE TYPE "ReferralRewardUnit" AS ENUM ('CASH', 'POINTS', 'DISCOUNT_PERCENT');

-- CreateEnum
CREATE TYPE "ReferralBeneficiary" AS ENUM ('REFERRER', 'REFERRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReferralCreditEntryType" ADD VALUE 'POINTS_TRANSFER_OUT';
ALTER TYPE "ReferralCreditEntryType" ADD VALUE 'POINTS_TRANSFER_IN';
ALTER TYPE "ReferralCreditEntryType" ADD VALUE 'CONVERSION_OUT';
ALTER TYPE "ReferralCreditEntryType" ADD VALUE 'CONVERSION_IN';

-- AlterTable
ALTER TABLE "referral_credit_entries" ADD COLUMN     "conversionId" TEXT,
ADD COLUMN     "transferId" TEXT,
ADD COLUMN     "wallet" "ReferralWallet" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "referral_reward_rules" ADD COLUMN     "beneficiary" "ReferralBeneficiary" NOT NULL DEFAULT 'REFERRER',
ADD COLUMN     "discountValidDays" INTEGER,
ADD COLUMN     "maxDiscountMinor" INTEGER,
ADD COLUMN     "unit" "ReferralRewardUnit" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "referral_rewards" ADD COLUMN     "beneficiary" "ReferralBeneficiary" NOT NULL DEFAULT 'REFERRER',
ADD COLUMN     "discountId" TEXT,
ADD COLUMN     "unit" "ReferralRewardUnit" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "referral_settings" ADD COLUMN     "conversionPoints" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "conversionValueMinor" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "maxTransferPointsPerDay" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "minConversionPoints" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "minTransferPoints" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "pointsConversionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pointsConversionRoles" "UserRole"[] DEFAULT ARRAY['STUDENT', 'COACH', 'SALES']::"UserRole"[],
ADD COLUMN     "pointsPaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pointsTransferEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pointsTransferRoles" "UserRole"[] DEFAULT ARRAY['STUDENT', 'COACH', 'SALES']::"UserRole"[];

-- AlterTable
ALTER TABLE "referrals" ADD COLUMN     "referredUserId" TEXT;

-- CreateTable
CREATE TABLE "referral_points_transfers" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_points_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_points_conversions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "ratePoints" INTEGER NOT NULL,
    "rateValueMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_points_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_points_transfers_fromUserId_createdAt_idx" ON "referral_points_transfers"("fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_points_transfers_toUserId_createdAt_idx" ON "referral_points_transfers"("toUserId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_points_transfers_createdAt_idx" ON "referral_points_transfers"("createdAt");

-- CreateIndex
CREATE INDEX "referral_points_conversions_userId_createdAt_idx" ON "referral_points_conversions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_points_conversions_createdAt_idx" ON "referral_points_conversions"("createdAt");

-- CreateIndex
CREATE INDEX "referral_credit_entries_transferId_idx" ON "referral_credit_entries"("transferId");

-- CreateIndex
CREATE INDEX "referral_credit_entries_conversionId_idx" ON "referral_credit_entries"("conversionId");

-- CreateIndex
CREATE INDEX "referral_credit_entries_userId_wallet_idx" ON "referral_credit_entries"("userId", "wallet");

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_discountId_key" ON "referral_rewards"("discountId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referredUserId_key" ON "referrals"("referredUserId");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_credit_entries" ADD CONSTRAINT "referral_credit_entries_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "referral_points_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_credit_entries" ADD CONSTRAINT "referral_credit_entries_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "referral_points_conversions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_points_transfers" ADD CONSTRAINT "referral_points_transfers_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_points_transfers" ADD CONSTRAINT "referral_points_transfers_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_points_conversions" ADD CONSTRAINT "referral_points_conversions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

