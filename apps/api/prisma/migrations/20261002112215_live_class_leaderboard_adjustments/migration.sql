-- CreateTable
CREATE TABLE "live_class_leaderboard_adjustments" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_class_leaderboard_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_class_leaderboard_adjustments_studentId_idx" ON "live_class_leaderboard_adjustments"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "live_class_leaderboard_adjustments_liveClassId_studentId_key" ON "live_class_leaderboard_adjustments"("liveClassId", "studentId");

-- AddForeignKey
ALTER TABLE "live_class_leaderboard_adjustments" ADD CONSTRAINT "live_class_leaderboard_adjustments_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_class_leaderboard_adjustments" ADD CONSTRAINT "live_class_leaderboard_adjustments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
