/*
  Warnings:

  - You are about to drop the `live_classes` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'PARTIAL', 'ABSENT');

-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM ('JOIN', 'LEAVE', 'DISCONNECT', 'RECONNECT');

-- AlterEnum
ALTER TYPE "ClassStatus" ADD VALUE 'LIVE';

-- DropForeignKey
ALTER TABLE "live_classes" DROP CONSTRAINT "live_classes_batchId_fkey";

-- DropForeignKey
ALTER TABLE "live_classes" DROP CONSTRAINT "live_classes_coachId_fkey";

-- DropForeignKey
ALTER TABLE "live_classes" DROP CONSTRAINT "live_classes_scheduleId_fkey";

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "batchId" DROP NOT NULL;

-- DropTable
DROP TABLE "live_classes";

-- CreateTable
CREATE TABLE "class_attendance" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "joinedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "totalDuration" INTEGER,
    "attendancePercent" DOUBLE PRECISION,
    "reconnectCount" INTEGER NOT NULL DEFAULT 0,
    "lastActivity" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_logs" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "AttendanceEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionStart" TIMESTAMP(3),
    "sessionEnd" TIMESTAMP(3),
    "sessionDuration" INTEGER,
    "reason" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "source" TEXT NOT NULL DEFAULT 'LIVEKIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default Policy',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "presentThreshold" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "lateThreshold" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "partialThreshold" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 5,
    "minDurationMinutes" INTEGER NOT NULL DEFAULT 5,
    "reconnectTolerance" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_sessions" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "coachId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "livekitRoomName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "recordingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_chat_messages" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderRole" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_course_progress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_course_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Practice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_practices" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "student_practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_activities" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_attendance_studentId_idx" ON "class_attendance"("studentId");

-- CreateIndex
CREATE INDEX "class_attendance_status_idx" ON "class_attendance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "class_attendance_classId_studentId_key" ON "class_attendance"("classId", "studentId");

-- CreateIndex
CREATE INDEX "attendance_logs_attendanceId_idx" ON "attendance_logs"("attendanceId");

-- CreateIndex
CREATE INDEX "attendance_logs_userId_idx" ON "attendance_logs"("userId");

-- CreateIndex
CREATE INDEX "attendance_logs_timestamp_idx" ON "attendance_logs"("timestamp");

-- CreateIndex
CREATE INDEX "attendance_logs_eventType_idx" ON "attendance_logs"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "live_sessions_classId_key" ON "live_sessions"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "live_sessions_roomName_key" ON "live_sessions"("roomName");

-- CreateIndex
CREATE UNIQUE INDEX "live_sessions_livekitRoomName_key" ON "live_sessions"("livekitRoomName");

-- CreateIndex
CREATE INDEX "live_sessions_batchId_idx" ON "live_sessions"("batchId");

-- CreateIndex
CREATE INDEX "live_sessions_coachId_idx" ON "live_sessions"("coachId");

-- CreateIndex
CREATE INDEX "live_sessions_status_idx" ON "live_sessions"("status");

-- CreateIndex
CREATE INDEX "live_chat_messages_liveSessionId_idx" ON "live_chat_messages"("liveSessionId");

-- CreateIndex
CREATE INDEX "live_chat_messages_senderId_idx" ON "live_chat_messages"("senderId");

-- CreateIndex
CREATE INDEX "live_chat_messages_createdAt_idx" ON "live_chat_messages"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "student_course_progress_studentId_courseId_key" ON "student_course_progress"("studentId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "student_practices_studentId_practiceId_key" ON "student_practices"("studentId", "practiceId");

-- CreateIndex
CREATE INDEX "student_activities_studentId_idx" ON "student_activities"("studentId");

-- AddForeignKey
ALTER TABLE "class_attendance" ADD CONSTRAINT "class_attendance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_attendance" ADD CONSTRAINT "class_attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "class_attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_course_progress" ADD CONSTRAINT "student_course_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_course_progress" ADD CONSTRAINT "student_course_progress_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_practices" ADD CONSTRAINT "student_practices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_practices" ADD CONSTRAINT "student_practices_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_activities" ADD CONSTRAINT "student_activities_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
