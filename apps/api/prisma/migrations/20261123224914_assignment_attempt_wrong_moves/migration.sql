-- Review S4: a SOLVE_LINE attempt counts the wrong moves tried while saving
-- progress, so checking every move for free no longer earns a full score.
ALTER TABLE "student_assignment_attempts" ADD COLUMN "wrongMoves" INTEGER NOT NULL DEFAULT 0;
