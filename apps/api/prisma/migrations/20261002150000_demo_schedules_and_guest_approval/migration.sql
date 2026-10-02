-- CreateEnum
CREATE TYPE "DemoGuestApproval" AS ENUM ('APPROVED', 'PENDING', 'DENIED');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "demoScheduleId" TEXT;

-- AlterTable
ALTER TABLE "demo_class_registrations" ADD COLUMN     "approval" "DemoGuestApproval" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvalAt" TIMESTAMP(3),
ADD COLUMN     "inviteToken" TEXT;

-- CreateTable
CREATE TABLE "demo_schedules" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "description" TEXT,
    "coachId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "slots" JSONB NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "accessMode" "DemoClassAccessMode" NOT NULL DEFAULT 'PUBLIC',
    "passcode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_schedules_slug_key" ON "demo_schedules"("slug");

-- CreateIndex
CREATE INDEX "demo_schedules_isActive_idx" ON "demo_schedules"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "classes_demoScheduleId_startsAt_key" ON "classes"("demoScheduleId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "demo_class_registrations_inviteToken_key" ON "demo_class_registrations"("inviteToken");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_demoScheduleId_fkey" FOREIGN KEY ("demoScheduleId") REFERENCES "demo_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_schedules" ADD CONSTRAINT "demo_schedules_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_schedules" ADD CONSTRAINT "demo_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

