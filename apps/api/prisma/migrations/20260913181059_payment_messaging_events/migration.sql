-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessagingEvent" ADD VALUE 'PAYMENT_RECEIVED';
ALTER TYPE "MessagingEvent" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "MessagingEvent" ADD VALUE 'REFUND_PROCESSED';
ALTER TYPE "MessagingEvent" ADD VALUE 'SUBSCRIPTION_RENEWAL_FAILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'REFUND_PROCESSED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_RENEWAL_FAILED';
