-- AlterEnum
ALTER TYPE "MessageChannel" ADD VALUE 'EMAIL';

-- AlterTable
ALTER TABLE "messaging_rules" ADD COLUMN     "emailEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "system_message_templates" (
    "key" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "actionLabel" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_message_templates_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "system_message_templates" ADD CONSTRAINT "system_message_templates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
