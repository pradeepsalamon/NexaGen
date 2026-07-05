-- Allow soft-deleted rows to stop blocking reuse of unique values.
-- Prisma schema keeps the logical unique fields; PostgreSQL enforces uniqueness
-- only for active rows.

DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email") WHERE "isDeleted" = false;

DROP INDEX IF EXISTS "users_username_key";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username") WHERE "isDeleted" = false;

DROP INDEX IF EXISTS "student_profiles_userId_key";
CREATE UNIQUE INDEX "student_profiles_userId_key" ON "student_profiles"("userId") WHERE "isDeleted" = false;

DROP INDEX IF EXISTS "coach_profiles_userId_key";
CREATE UNIQUE INDEX "coach_profiles_userId_key" ON "coach_profiles"("userId") WHERE "isDeleted" = false;

DROP INDEX IF EXISTS "batch_coaches_batchId_coachId_key";
CREATE UNIQUE INDEX "batch_coaches_batchId_coachId_key" ON "batch_coaches"("batchId", "coachId") WHERE "isDeleted" = false;

DROP INDEX IF EXISTS "batch_students_batchId_studentId_key";
CREATE UNIQUE INDEX "batch_students_batchId_studentId_key" ON "batch_students"("batchId", "studentId") WHERE "isDeleted" = false;
