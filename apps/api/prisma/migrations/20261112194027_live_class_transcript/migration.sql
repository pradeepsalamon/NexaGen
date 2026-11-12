-- AlterTable
ALTER TABLE "coach_profiles" ADD COLUMN     "transcriptConsentAt" TIMESTAMP(3),
ADD COLUMN     "transcriptConsentVersion" INTEGER;

-- CreateTable
CREATE TABLE "live_class_transcript_segments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "liveSessionId" TEXT NOT NULL,
    "speakerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "spokenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_class_transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_transcript_segments_liveSessionId_spokenAt_id_idx" ON "live_class_transcript_segments"("liveSessionId", "spokenAt", "id");

-- CreateIndex
CREATE INDEX "live_class_transcript_segments_speakerId_idx" ON "live_class_transcript_segments"("speakerId");

-- CreateIndex
CREATE INDEX "live_class_transcript_segments_tenantId_createdAt_idx" ON "live_class_transcript_segments"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_transcript_segments_liveSessionId_clientId_key" ON "live_class_transcript_segments"("liveSessionId", "clientId");

-- AddForeignKey
ALTER TABLE "live_class_transcript_segments" ADD CONSTRAINT "live_class_transcript_segments_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_transcript_segments" ADD CONSTRAINT "live_class_transcript_segments_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
