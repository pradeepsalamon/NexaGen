-- Weak spots (docs/WEAK_SPOTS.md): the student's chances per motif on each play review.
-- AlterTable
ALTER TABLE "ai_play_reviews" ADD COLUMN     "tacticsJson" JSONB;
