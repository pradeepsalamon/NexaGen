-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL_POINTS_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL_TAKEN_BACK';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessagingEvent" ADD VALUE 'REFERRAL_POINTS_EXPIRING';
ALTER TYPE "MessagingEvent" ADD VALUE 'REFERRAL_TAKEN_BACK';

