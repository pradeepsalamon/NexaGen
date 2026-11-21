-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "leads_userId_idx" ON "leads"("userId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
