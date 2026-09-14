-- CreateEnum
CREATE TYPE "ScreenShareRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'REVOKED');

-- CreateTable
CREATE TABLE "live_class_screen_share_requests" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "ScreenShareRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_screen_share_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_screen_share_requests_liveSessionId_status_idx" ON "live_class_screen_share_requests"("liveSessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_screen_share_requests_liveSessionId_studentId_key" ON "live_class_screen_share_requests"("liveSessionId", "studentId");

-- AddForeignKey
ALTER TABLE "live_class_screen_share_requests" ADD CONSTRAINT "live_class_screen_share_requests_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_screen_share_requests" ADD CONSTRAINT "live_class_screen_share_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_screen_share_requests" ADD CONSTRAINT "live_class_screen_share_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
