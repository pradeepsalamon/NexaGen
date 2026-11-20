-- CreateTable
CREATE TABLE "solo_puzzle_rush_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "studentId" TEXT NOT NULL,
    "mode" "PuzzleRushMode" NOT NULL,
    "puzzles" JSONB NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "score" INTEGER NOT NULL DEFAULT 0,
    "moves" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "solved" INTEGER NOT NULL DEFAULT 0,
    "bestCombo" INTEGER NOT NULL DEFAULT 0,
    "highestRating" INTEGER,
    "puzzleIndex" INTEGER NOT NULL DEFAULT 0,
    "skipsUsed" INTEGER NOT NULL DEFAULT 0,
    "playedAt" TIMESTAMP(3),
    "clockEndsAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solo_puzzle_rush_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solo_puzzle_rush_runs_studentId_mode_finishedAt_idx" ON "solo_puzzle_rush_runs"("studentId", "mode", "finishedAt");

-- CreateIndex
CREATE INDEX "solo_puzzle_rush_runs_mode_finishedAt_score_idx" ON "solo_puzzle_rush_runs"("mode", "finishedAt", "score");

-- AddForeignKey
ALTER TABLE "solo_puzzle_rush_runs" ADD CONSTRAINT "solo_puzzle_rush_runs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

