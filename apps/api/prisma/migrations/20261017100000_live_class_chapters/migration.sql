-- CreateTable
CREATE TABLE "live_class_chapters" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "batchId" TEXT,
    "liveClassId" TEXT,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "puzzleId" TEXT,
    "clientId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_chapters_scopeKey_position_idx" ON "live_class_chapters"("scopeKey", "position");

-- CreateIndex
CREATE INDEX "live_class_chapters_batchId_idx" ON "live_class_chapters"("batchId");

-- CreateIndex
CREATE INDEX "live_class_chapters_liveClassId_idx" ON "live_class_chapters"("liveClassId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_chapters_scopeKey_clientId_key" ON "live_class_chapters"("scopeKey", "clientId");

-- AddForeignKey
ALTER TABLE "live_class_chapters" ADD CONSTRAINT "live_class_chapters_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_chapters" ADD CONSTRAINT "live_class_chapters_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

