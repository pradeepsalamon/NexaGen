-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "familyId" TEXT,
ADD COLUMN     "rotatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "auth_sessions_familyId_idx" ON "auth_sessions"("familyId");
