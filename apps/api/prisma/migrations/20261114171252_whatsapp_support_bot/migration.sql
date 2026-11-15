-- CreateEnum
CREATE TYPE "SupportConversationStatus" AS ENUM ('BOT', 'WAITING_AGENT', 'AGENT', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "SupportMessageAuthor" AS ENUM ('CUSTOMER', 'BOT', 'AGENT');

-- CreateEnum
CREATE TYPE "SupportMessageStatus" AS ENUM ('RECEIVED', 'PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('COURSE', 'REFUND', 'CLASS', 'PAYMENT', 'TECH', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SupportTicketEventKind" AS ENUM ('CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'NOTE', 'HANDOFF', 'TAKEN_OVER', 'RETURNED_TO_BOT');

-- CreateTable
CREATE TABLE "whatsapp_webhook_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "messageType" TEXT,
    "text" TEXT,
    "replyId" TEXT,
    "status" TEXT,
    "statusError" TEXT,
    "profileName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "ignoredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_contacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "waId" TEXT NOT NULL,
    "profileName" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "contactId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'START',
    "flowVersion" INTEGER NOT NULL DEFAULT 1,
    "draft" JSONB NOT NULL DEFAULT '{}',
    "status" "SupportConversationStatus" NOT NULL DEFAULT 'BOT',
    "lastInboundAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "conversationId" TEXT NOT NULL,
    "direction" "SupportMessageDirection" NOT NULL,
    "author" "SupportMessageAuthor" NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "interactiveId" TEXT,
    "providerMessageId" TEXT,
    "clientKey" TEXT,
    "status" "SupportMessageStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "error" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "reference" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "category" "SupportCategory" NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "handoff" BOOLEAN NOT NULL DEFAULT false,
    "studentName" TEXT,
    "details" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "assignedToId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "ticketId" TEXT NOT NULL,
    "kind" "SupportTicketEventKind" NOT NULL,
    "body" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_webhook_events_dedupeKey_key" ON "whatsapp_webhook_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_processedAt_ignoredAt_receivedAt_idx" ON "whatsapp_webhook_events"("processedAt", "ignoredAt", "receivedAt");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_receivedAt_idx" ON "whatsapp_webhook_events"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contacts_tenantId_waId_key" ON "whatsapp_contacts"("tenantId", "waId");

-- CreateIndex
CREATE INDEX "support_conversations_contactId_status_idx" ON "support_conversations"("contactId", "status");

-- CreateIndex
CREATE INDEX "support_conversations_status_lastInboundAt_idx" ON "support_conversations"("status", "lastInboundAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_messages_providerMessageId_key" ON "support_messages"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "support_messages_clientKey_key" ON "support_messages"("clientKey");

-- CreateIndex
CREATE INDEX "support_messages_conversationId_createdAt_idx" ON "support_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "support_messages_status_nextAttemptAt_idx" ON "support_messages"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "support_messages_createdAt_idx" ON "support_messages"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_reference_key" ON "support_tickets"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_dedupeKey_key" ON "support_tickets"("dedupeKey");

-- CreateIndex
CREATE INDEX "support_tickets_status_updatedAt_idx" ON "support_tickets"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "support_tickets_contactId_createdAt_idx" ON "support_tickets"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_assignedToId_status_idx" ON "support_tickets"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "support_ticket_events_ticketId_createdAt_idx" ON "support_ticket_events"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one conversation that isn't CLOSED per contact (docs/WHATSAPP_SUPPORT.md §5).
CREATE UNIQUE INDEX "support_conversations_one_open_per_contact" ON "support_conversations"("contactId") WHERE "status" <> 'CLOSED';

-- Ticket references: NXS-<year>-<6 digits>.
CREATE SEQUENCE "support_ticket_reference_seq";
