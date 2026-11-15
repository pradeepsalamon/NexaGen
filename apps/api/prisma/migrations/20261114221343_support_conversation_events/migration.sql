-- CreateEnum
CREATE TYPE "SupportOwnerChangeReason" AS ENUM ('HANDOFF', 'CUSTOMER_MENU', 'STAFF_REPLY', 'STAFF_TAKE_OVER', 'STAFF_RETURN', 'DEMO_BOOKED', 'TICKET_RESOLVED', 'BOT_IDLE');

-- CreateTable
CREATE TABLE "support_conversation_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "conversationId" TEXT NOT NULL,
    "fromStatus" "SupportConversationStatus" NOT NULL,
    "toStatus" "SupportConversationStatus" NOT NULL,
    "reason" "SupportOwnerChangeReason" NOT NULL,
    "actorId" TEXT,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_conversation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_conversation_events_conversationId_createdAt_idx" ON "support_conversation_events"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "support_conversation_events_createdAt_toStatus_idx" ON "support_conversation_events"("createdAt", "toStatus");

-- CreateIndex
CREATE INDEX "support_conversation_events_actorId_idx" ON "support_conversation_events"("actorId");

-- AddForeignKey
ALTER TABLE "support_conversation_events" ADD CONSTRAINT "support_conversation_events_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_conversation_events" ADD CONSTRAINT "support_conversation_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

