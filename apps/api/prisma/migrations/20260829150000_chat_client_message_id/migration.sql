-- AUDIT M24: dedupe chat history by LiveKit message id.
ALTER TABLE "live_chat_messages" ADD COLUMN "clientMessageId" TEXT;
CREATE INDEX "live_chat_messages_clientMessageId_idx" ON "live_chat_messages"("clientMessageId");
