-- P0 Classroom Reliability, Phase 1 (1/2).
--
-- Split from the schema-level migration into its own transaction because
-- PostgreSQL forbids using a newly-added enum value inside the same
-- transaction that added it. This migration only adds enum members and
-- purely-additive nullable columns/enums -- no existing column changes type,
-- so it is safe to run standalone against a database with production data.

-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('SCHEDULED', 'WAITING', 'LIVE', 'ENDED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AttendanceEventType" ADD VALUE 'BOARD_JOIN';
ALTER TYPE "AttendanceEventType" ADD VALUE 'BOARD_LEAVE';

-- AlterTable
ALTER TABLE "class_attendance" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "coach_attendance" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
