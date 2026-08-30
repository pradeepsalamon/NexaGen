-- CreateEnum
CREATE TYPE "BatchScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "occurrenceDate" DATE,
ADD COLUMN     "scheduleId" TEXT,
ADD COLUMN     "scheduleRuleId" TEXT,
ADD COLUMN     "sessionNumber" INTEGER;

-- CreateTable
CREATE TABLE "batch_class_schedules" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "BatchScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_class_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_class_schedule_rules" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_class_schedule_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_schedule_exceptions" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batch_class_schedules_batchId_idx" ON "batch_class_schedules"("batchId");

-- CreateIndex
CREATE INDEX "batch_class_schedules_status_idx" ON "batch_class_schedules"("status");

-- CreateIndex
CREATE INDEX "batch_class_schedule_rules_scheduleId_idx" ON "batch_class_schedule_rules"("scheduleId");

-- CreateIndex
CREATE INDEX "batch_class_schedule_rules_coachId_idx" ON "batch_class_schedule_rules"("coachId");

-- CreateIndex
CREATE INDEX "batch_schedule_exceptions_scheduleId_idx" ON "batch_schedule_exceptions"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "batch_schedule_exceptions_scheduleId_date_key" ON "batch_schedule_exceptions"("scheduleId", "date");

-- CreateIndex
CREATE INDEX "classes_scheduleId_idx" ON "classes"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "classes_schedule_occurrence_unique" ON "classes"("scheduleId", "occurrenceDate", "scheduleRuleId");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "batch_class_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_scheduleRuleId_fkey" FOREIGN KEY ("scheduleRuleId") REFERENCES "batch_class_schedule_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_class_schedules" ADD CONSTRAINT "batch_class_schedules_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_class_schedules" ADD CONSTRAINT "batch_class_schedules_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_class_schedules" ADD CONSTRAINT "batch_class_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_class_schedule_rules" ADD CONSTRAINT "batch_class_schedule_rules_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "batch_class_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_class_schedule_rules" ADD CONSTRAINT "batch_class_schedule_rules_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_schedule_exceptions" ADD CONSTRAINT "batch_schedule_exceptions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "batch_class_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

