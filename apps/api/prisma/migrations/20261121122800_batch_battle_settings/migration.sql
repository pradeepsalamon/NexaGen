-- Batch Battles settings (docs/PUZZLE_RUSH_SOLO.md): null = automatic (group batches take part).
ALTER TABLE "batches" ADD COLUMN     "battlesEnabled" BOOLEAN,
ADD COLUMN     "battlesShowNames" BOOLEAN NOT NULL DEFAULT false;
