-- CreateTable
CREATE TABLE "live_classes" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "roomSid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "live_classes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_classes_scheduleId_key" ON "live_classes"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "live_classes_roomName_key" ON "live_classes"("roomName");

-- CreateIndex
CREATE UNIQUE INDEX "live_classes_roomSid_key" ON "live_classes"("roomSid");

-- CreateIndex
CREATE INDEX "live_classes_batchId_idx" ON "live_classes"("batchId");

-- CreateIndex
CREATE INDEX "live_classes_coachId_idx" ON "live_classes"("coachId");

-- CreateIndex
CREATE INDEX "live_classes_status_idx" ON "live_classes"("status");

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_classes" ADD CONSTRAINT "live_classes_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
