-- CreateEnum
CREATE TYPE "EmailVerificationPolicy" AS ENUM ('OFF', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "DirectEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "email_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "verificationPolicy" "EmailVerificationPolicy" NOT NULL DEFAULT 'OFF',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_emails" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "senderId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "DirectEmailStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "direct_emails_recipientId_idx" ON "direct_emails"("recipientId");

-- CreateIndex
CREATE INDEX "direct_emails_senderId_idx" ON "direct_emails"("senderId");

-- CreateIndex
CREATE INDEX "direct_emails_createdAt_idx" ON "direct_emails"("createdAt");

-- AddForeignKey
ALTER TABLE "direct_emails" ADD CONSTRAINT "direct_emails_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_emails" ADD CONSTRAINT "direct_emails_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
