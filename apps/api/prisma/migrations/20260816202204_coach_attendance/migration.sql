-- CreateTable
CREATE TABLE "coach_attendance" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "joinedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "totalDuration" INTEGER,
    "boardDuration" INTEGER,
    "reconnectCount" INTEGER NOT NULL DEFAULT 0,
    "lastActivity" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_attendance_logs" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionStart" TIMESTAMP(3),
    "sessionEnd" TIMESTAMP(3),
    "sessionDuration" INTEGER,
    "reason" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "source" TEXT NOT NULL DEFAULT 'LIVEKIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_attendance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coach_attendance_classId_key" ON "coach_attendance"("classId");

-- CreateIndex
CREATE INDEX "coach_attendance_coachId_idx" ON "coach_attendance"("coachId");

-- CreateIndex
CREATE INDEX "coach_attendance_status_idx" ON "coach_attendance"("status");

-- CreateIndex
CREATE INDEX "coach_attendance_logs_attendanceId_idx" ON "coach_attendance_logs"("attendanceId");

-- CreateIndex
CREATE INDEX "coach_attendance_logs_userId_idx" ON "coach_attendance_logs"("userId");

-- CreateIndex
CREATE INDEX "coach_attendance_logs_timestamp_idx" ON "coach_attendance_logs"("timestamp");

-- CreateIndex
CREATE INDEX "coach_attendance_logs_eventType_idx" ON "coach_attendance_logs"("eventType");

-- AddForeignKey
ALTER TABLE "coach_attendance" ADD CONSTRAINT "coach_attendance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_attendance" ADD CONSTRAINT "coach_attendance_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_attendance_logs" ADD CONSTRAINT "coach_attendance_logs_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "coach_attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_attendance_logs" ADD CONSTRAINT "coach_attendance_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
