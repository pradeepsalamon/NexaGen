-- Supporting indexes only.
--
-- NOTE: the unique constraints on soft-deletable tables are deliberately left
-- as plain uniques. A deleted user's email/username stays permanently reserved.
-- The duplicate-detection reads use `prisma.withDeleted` so they can see
-- soft-deleted rows and return a 409 instead of hitting a P2002 -> 500.
-- See AUDIT.md C3 for the alternative (partial unique indexes) and why it was
-- not taken: Prisma cannot express a partial unique index in schema.prisma, so
-- it would require dropping @unique and converting every findUnique to
-- findFirst, and would leave `prisma migrate dev` reporting permanent drift.

-- The two admin class lists filter exclusively on isDemo.
CREATE INDEX IF NOT EXISTS "classes_isDemo_idx" ON "classes" ("isDemo");

-- "Find the open session" runs on every LiveKit join/leave webhook.
CREATE INDEX IF NOT EXISTS "attendance_logs_open_session_idx"
  ON "attendance_logs" ("attendanceId", "eventType", "sessionEnd");
