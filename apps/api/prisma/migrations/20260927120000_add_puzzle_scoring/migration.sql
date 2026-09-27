-- AlterTable
ALTER TABLE "puzzles" ADD COLUMN     "scoringJson" JSONB;

-- AlterTable
ALTER TABLE "puzzle_attempts" ADD COLUMN     "wrongMoves" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "live_class_puzzle_assignments" ADD COLUMN     "adjustmentsJson" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "leaderboardJson" JSONB,
ADD COLUMN     "scoringJson" JSONB;

-- CreateTable
CREATE TABLE "puzzle_scoring_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "scoringJson" JSONB,
    "leaderboardJson" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "puzzle_scoring_settings_pkey" PRIMARY KEY ("id")
);

