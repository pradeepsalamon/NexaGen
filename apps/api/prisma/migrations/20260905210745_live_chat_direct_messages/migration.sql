-- AlterTable
ALTER TABLE "live_chat_messages" ADD COLUMN     "recipientId" TEXT;

-- CreateIndex
CREATE INDEX "live_chat_messages_recipientId_idx" ON "live_chat_messages"("recipientId");

-- AddForeignKey
ALTER TABLE "live_chat_messages" ADD CONSTRAINT "live_chat_messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
