-- AlterTable
ALTER TABLE "puzzle_topics" ADD COLUMN     "homeworkApprovedAt" TIMESTAMP(3),
ADD COLUMN     "homeworkApprovedById" TEXT;

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "sourceTopicId" TEXT;

-- CreateIndex
CREATE INDEX "puzzle_topics_homeworkApprovedById_idx" ON "puzzle_topics"("homeworkApprovedById");

-- CreateIndex
CREATE INDEX "assignments_sourceTopicId_idx" ON "assignments"("sourceTopicId");

-- AddForeignKey
ALTER TABLE "puzzle_topics" ADD CONSTRAINT "puzzle_topics_homeworkApprovedById_fkey" FOREIGN KEY ("homeworkApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_sourceTopicId_fkey" FOREIGN KEY ("sourceTopicId") REFERENCES "puzzle_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
