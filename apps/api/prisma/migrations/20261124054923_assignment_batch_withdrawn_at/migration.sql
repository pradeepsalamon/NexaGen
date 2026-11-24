-- Owner 2026-11-24 (review S8, option b): withdrawing assigned work no longer
-- deletes it. The deployment is hidden (every read filters `withdrawnAt IS NULL`
-- through the soft-delete extension) and each student's copy and attempts stay.
-- Assigning the same work to the batch again clears it and brings them back.
ALTER TABLE "assignment_batches" ADD COLUMN "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "assignment_batches" ADD COLUMN "withdrawnById" TEXT;
