-- CreateEnum
CREATE TYPE "RetentionCategory" AS ENUM ('CHAT_MESSAGES', 'LIVE_CHAT_MESSAGES', 'NOTIFICATIONS', 'MESSAGE_DELIVERIES', 'ANALYTICS_EVENTS');

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" TEXT NOT NULL,
    "category" "RetentionCategory" NOT NULL,
    "days" INTEGER,
    "updatedById" TEXT,
    "changedAt" TIMESTAMP(3),
    "lastSweptAt" TIMESTAMP(3),
    "lastDeletedCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_category_key" ON "retention_policies"("category");

-- CreateIndex
CREATE INDEX "chat_messages_createdAt_idx" ON "chat_messages"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- AddForeignKey
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
