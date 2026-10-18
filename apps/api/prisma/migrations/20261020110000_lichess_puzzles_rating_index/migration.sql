-- Catalogue browse by exact rating (sort rating_asc / rating_desc), id as the
-- keyset tiebreak. The walk index (ratingBand, randKey, id) only orders by
-- 50-point band; sorting a band per page measured 6 s cold on 6.15M rows.
-- A plain CREATE INDEX: it blocks writes to lichess_puzzles (only the catalogue
-- loader writes there) for the build, never reads.

-- CreateIndex
CREATE INDEX "lichess_puzzles_rating_idx" ON "lichess_puzzles"("rating", "id");
