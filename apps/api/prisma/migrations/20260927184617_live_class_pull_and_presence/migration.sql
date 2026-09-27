-- CreateEnum
CREATE TYPE "LiveClassPullStatus" AS ENUM ('PENDING', 'JOINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "live_class_pulls" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "LiveClassPullStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_pulls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_pulls_studentId_status_idx" ON "live_class_pulls"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_pulls_liveSessionId_studentId_key" ON "live_class_pulls"("liveSessionId", "studentId");

-- AddForeignKey
ALTER TABLE "live_class_pulls" ADD CONSTRAINT "live_class_pulls_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_pulls" ADD CONSTRAINT "live_class_pulls_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_pulls" ADD CONSTRAINT "live_class_pulls_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
