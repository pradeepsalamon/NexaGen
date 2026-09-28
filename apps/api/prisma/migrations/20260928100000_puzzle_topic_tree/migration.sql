-- AlterTable
ALTER TABLE "puzzle_topics" ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "puzzle_topics_parentId_idx" ON "puzzle_topics"("parentId");

-- AddForeignKey
ALTER TABLE "puzzle_topics" ADD CONSTRAINT "puzzle_topics_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "puzzle_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
