-- CreateEnum
CREATE TYPE "PuzzleSource" AS ENUM ('NEXA', 'LICHESS');

-- CreateEnum
CREATE TYPE "PuzzleAttemptContext" AS ENUM ('DIRECT', 'LIVE_CLASS', 'TRAINING');

-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "puzzleTrainingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "puzzle_attempts" ADD COLUMN     "context" "PuzzleAttemptContext" NOT NULL DEFAULT 'DIRECT';

-- AlterTable
ALTER TABLE "puzzles" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "setupMoveUci" TEXT,
ADD COLUMN     "source" "PuzzleSource" NOT NULL DEFAULT 'NEXA',
ADD COLUMN     "sourceId" TEXT;

-- CreateTable
CREATE TABLE "lichess_puzzles" (
    "id" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "moves" TEXT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "ratingDeviation" SMALLINT NOT NULL,
    "popularity" SMALLINT NOT NULL,
    "nbPlays" INTEGER NOT NULL,
    "themes" TEXT[],
    "openingTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gameUrl" TEXT NOT NULL,
    "ratingBand" SMALLINT NOT NULL,
    "randKey" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "passesQualityGate" BOOLEAN NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "releaseId" TEXT NOT NULL,

    CONSTRAINT "lichess_puzzles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lichess_catalogue_releases" (
    "id" TEXT NOT NULL,
    "formatVersion" INTEGER NOT NULL,
    "lichessDumpDate" DATE NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "validRows" INTEGER NOT NULL,
    "qualityGateRows" INTEGER NOT NULL,
    "loadStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loadCompletedAt" TIMESTAMP(3),

    CONSTRAINT "lichess_catalogue_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lichess_puzzles_walk_idx" ON "lichess_puzzles"("ratingBand", "randKey", "id");

-- CreateIndex
CREATE INDEX "lichess_puzzles_themes_gin" ON "lichess_puzzles" USING GIN ("themes");

-- CreateIndex
CREATE INDEX "lichess_puzzles_opening_gin" ON "lichess_puzzles" USING GIN ("openingTags");

-- CreateIndex
CREATE INDEX "puzzle_attempts_studentId_completedAt_idx" ON "puzzle_attempts"("studentId", "completedAt");

-- CreateIndex
CREATE INDEX "puzzles_contentHash_idx" ON "puzzles"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "puzzles_source_sourceId_key" ON "puzzles"("source", "sourceId");


-- ── Hand-written data backfills (schema-neutral, so CI's migrate diff is unaffected) ──

-- Attempts started from a live-class share.
UPDATE "puzzle_attempts" SET "context" = 'LIVE_CLASS' WHERE "liveClassId" IS NOT NULL;

-- contentHash = first 16 hex of sha256(puzzleContentKey(fen, solution UCIs)):
-- the first four FEN fields + '|' + the solution UCIs, lowercased, space
-- separated. Must match apps/api/src/puzzle/puzzle-content-hash.ts
-- (puzzle-content-hash.int-spec.ts). Covers soft-deleted rows too.
UPDATE "puzzles" p
SET "contentHash" = left(encode(sha256(convert_to(
  array_to_string((regexp_split_to_array(btrim(p."fen"), '\s+'))[1:4], ' ')
  || '|'
  || coalesce((
    SELECT string_agg(lower(btrim(e.m ->> 'uci')), ' ' ORDER BY e.ord)
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p."solutionMovesJson") = 'array' THEN p."solutionMovesJson" ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(m, ord)
  ), ''),
  'UTF8')), 'hex'), 16);
