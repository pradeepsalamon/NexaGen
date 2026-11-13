-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessagingEvent" ADD VALUE 'REFERRAL_PROGRESS';
ALTER TYPE "MessagingEvent" ADD VALUE 'REFERRAL_REWARD';
ALTER TYPE "MessagingEvent" ADD VALUE 'REFERRAL_REQUEST_DECIDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL_PROGRESS';
ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL_REWARD';
ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL_REQUEST_DECIDED';

-- AlterEnum
ALTER TYPE "ReferralCreditEntryType" ADD VALUE 'EXPIRY';

-- AlterTable
ALTER TABLE "referral_settings" ADD COLUMN     "pointsExpiryDays" INTEGER;
