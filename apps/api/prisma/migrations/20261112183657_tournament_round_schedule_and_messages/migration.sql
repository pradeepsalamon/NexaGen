-- CreateEnum
CREATE TYPE "TournamentRoundStartMode" AS ENUM ('AUTO', 'SCHEDULED', 'MANUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessagingEvent" ADD VALUE 'TOURNAMENT_REGISTRATION_OPEN';
ALTER TYPE "MessagingEvent" ADD VALUE 'TOURNAMENT_STARTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_REGISTRATION_OPEN';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_STARTED';

-- AlterEnum
ALTER TYPE "TournamentAuditAction" ADD VALUE 'NEXT_ROUND_RESCHEDULED';

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "nextRoundAt" TIMESTAMP(3),
ADD COLUMN     "registrationAnnouncedAt" TIMESTAMP(3),
ADD COLUMN     "roundScheduleJson" JSONB,
ADD COLUMN     "roundStartMode" "TournamentRoundStartMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "startedAnnouncedAt" TIMESTAMP(3);

-- Tournaments that were already published or started are not announced after the fact.
UPDATE "tournaments" SET "registrationAnnouncedAt" = now() AT TIME ZONE 'UTC' WHERE "status" <> 'DRAFT';
UPDATE "tournaments" SET "startedAnnouncedAt" = now() AT TIME ZONE 'UTC' WHERE "startedAt" IS NOT NULL;
