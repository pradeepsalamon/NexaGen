-- CreateEnum
CREATE TYPE "AcquisitionSource" AS ENUM ('WEBSITE', 'GOOGLE', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'WHATSAPP', 'REFERRAL', 'SCHOOL', 'COACH_REFERRAL', 'ADVERTISEMENT', 'OTHER', 'UNKNOWN');

-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "recordingBytes" BIGINT,
ADD COLUMN     "recordingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "recordingDurationSeconds" INTEGER,
ADD COLUMN     "recordingStartedAt" TIMESTAMP(3),
ADD COLUMN     "recordingStatus" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "acquisitionDetail" TEXT,
ADD COLUMN     "acquisitionSource" "AcquisitionSource" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "landingReferrer" TEXT,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmTerm" TEXT;

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_snapshots" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedDate" DATE NOT NULL,
    "recordingBytes" BIGINT NOT NULL,
    "recordingCount" INTEGER NOT NULL,
    "limitBytes" BIGINT NOT NULL,

    CONSTRAINT "storage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_userId_occurredAt_idx" ON "analytics_events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_type_occurredAt_idx" ON "analytics_events"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "analytics_events_occurredAt_idx" ON "analytics_events"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "storage_snapshots_capturedDate_key" ON "storage_snapshots"("capturedDate");

-- CreateIndex
CREATE INDEX "storage_snapshots_capturedAt_idx" ON "storage_snapshots"("capturedAt");

-- CreateIndex
CREATE INDEX "class_attendance_createdAt_idx" ON "class_attendance"("createdAt");

-- CreateIndex
CREATE INDEX "classes_batchId_startsAt_idx" ON "classes"("batchId", "startsAt");

-- CreateIndex
CREATE INDEX "live_sessions_startedAt_idx" ON "live_sessions"("startedAt");

-- CreateIndex
CREATE INDEX "live_sessions_endedAt_idx" ON "live_sessions"("endedAt");

-- CreateIndex
CREATE INDEX "student_assignments_completed_at_idx" ON "student_assignments"("completed_at");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_lastActiveAt_idx" ON "users"("lastActiveAt");

-- CreateIndex
CREATE INDEX "users_acquisitionSource_idx" ON "users"("acquisitionSource");

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill acquisitionSource from the legacy StudentProfile.referralSource (students only).
-- Everyone else (coaches, admins, students who never answered) stays UNKNOWN.
UPDATE "users" u
SET "acquisitionSource" = CASE sp."referralSource"
    WHEN 'ADS' THEN 'ADVERTISEMENT'::"AcquisitionSource"
    WHEN 'FRIEND' THEN 'REFERRAL'::"AcquisitionSource"
    WHEN 'SCHOOL' THEN 'SCHOOL'::"AcquisitionSource"
    ELSE 'OTHER'::"AcquisitionSource"
  END
FROM "student_profiles" sp
WHERE sp."userId" = u."id";
