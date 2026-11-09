-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TournamentAuditAction" ADD VALUE 'CREATED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'UPDATED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'DELETED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'PUBLISH_REQUESTED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'PUBLISHED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'CANCELLED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'HOSTS_CHANGED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'IMAGE_CHANGED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'PLAYER_ADDED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'PLAYER_INVITED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'PLAYER_APPROVED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'PLAYER_REJECTED';
ALTER TYPE "TournamentAuditAction" ADD VALUE 'PLAYER_DISQUALIFIED';

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "registrationRequiresApproval" BOOLEAN NOT NULL DEFAULT false;
