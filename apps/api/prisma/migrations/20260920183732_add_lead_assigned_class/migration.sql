-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "assignedClassId" TEXT;

-- CreateIndex
CREATE INDEX "leads_assignedClassId_idx" ON "leads"("assignedClassId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedClassId_fkey" FOREIGN KEY ("assignedClassId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
