-- One open attempt per student per puzzle of a PUZZLE_SET assignment.
-- Two starts racing (a double click, a retried request, React StrictMode's
-- double effect) could each miss the other's open attempt and create a second
-- one, spending a try the student never used. With this index the loser's
-- insert collides (P2002) and PuzzleAttemptService.start resumes the winner.

-- Close any duplicate already there (keep the newest open attempt).
UPDATE "puzzle_attempts" AS a
SET "status" = 'ABANDONED', "updatedAt" = CURRENT_TIMESTAMP
WHERE a."studentAssignmentId" IS NOT NULL
  AND a."status" = 'IN_PROGRESS'
  AND EXISTS (
    SELECT 1 FROM "puzzle_attempts" AS b
    WHERE b."studentAssignmentId" = a."studentAssignmentId"
      AND b."puzzleId" = a."puzzleId"
      AND b."status" = 'IN_PROGRESS'
      AND b."attemptNumber" > a."attemptNumber"
  );

CREATE UNIQUE INDEX "puzzle_attempts_one_open_per_assignment_puzzle"
  ON "puzzle_attempts"("studentAssignmentId", "puzzleId")
  WHERE "status" = 'IN_PROGRESS' AND "studentAssignmentId" IS NOT NULL;
