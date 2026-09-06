-- P0 Classroom Reliability, Phase 1 (2/2).
--
-- Converts two previously-untyped columns to the enums added in the prior
-- migration. Uses explicit `USING ... ::text::enum` casts instead of Prisma's
-- default drop-and-recreate so existing rows keep their values -- both
-- columns already only ever held values that are members of the target enum
-- (confirmed against vps_dev: live_sessions.status was 100% "ENDED"/
-- "SCHEDULED"-family values, coach_attendance_logs had 0 rows). If production
-- ever has a stray value outside the enum, this cast fails loudly and aborts
-- the deploy (scripts/deploy-production.sh runs `migrate deploy` before
-- swapping the running API), rather than silently dropping data.

-- AlterTable
ALTER TABLE "coach_attendance_logs"
  ALTER COLUMN "eventType" TYPE "AttendanceEventType" USING ("eventType"::text::"AttendanceEventType");

-- AlterTable
ALTER TABLE "live_sessions"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "LiveSessionStatus" USING ("status"::text::"LiveSessionStatus"),
  ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';

-- No CREATE INDEX here: both "coach_attendance_logs_eventType_idx" and
-- "live_sessions_status_idx" already exist (the pre-existing @@index([...])
-- on the string columns) and an in-place ALTER COLUMN TYPE keeps them,
-- unlike Prisma's default drop-and-recreate plan which would have dropped
-- and needed to remake them.
