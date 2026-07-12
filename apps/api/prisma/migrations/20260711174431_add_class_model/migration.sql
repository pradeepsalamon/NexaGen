-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "title" TEXT,
    "topic" TEXT,
    "description" TEXT,
    "objectives" TEXT,
    "homework" TEXT,
    "notes" TEXT,
    "status" "ClassStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "meetingRoomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "classes_batchId_idx" ON "classes"("batchId");

-- CreateIndex
CREATE INDEX "classes_coachId_idx" ON "classes"("coachId");

-- CreateIndex
CREATE INDEX "classes_status_idx" ON "classes"("status");

-- CreateIndex
CREATE INDEX "classes_startsAt_idx" ON "classes"("startsAt");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
