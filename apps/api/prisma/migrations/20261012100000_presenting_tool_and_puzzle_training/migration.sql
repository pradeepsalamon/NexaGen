-- Interactives: which tool the coach is showing the class.
ALTER TYPE "LiveClassToolKind" ADD VALUE 'PRESENTING';

-- Rated puzzle training is on by default. Nothing has ever read or written
-- this column (it was dormant), so every existing batch is switched on too.
ALTER TABLE "batches" ALTER COLUMN "puzzleTrainingEnabled" SET DEFAULT true;
UPDATE "batches" SET "puzzleTrainingEnabled" = true;
