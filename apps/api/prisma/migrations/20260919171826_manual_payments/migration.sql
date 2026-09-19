-- CreateEnum
CREATE TYPE "OfflinePaymentReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'MANUAL';

-- CreateTable
CREATE TABLE "offline_payment_methods" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_payment_records" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "reference" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "recordedByRole" "UserRole" NOT NULL,
    "status" "OfflinePaymentReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "attachmentKey" TEXT,
    "attachmentFileName" TEXT,
    "attachmentMimeType" TEXT,
    "attachmentSizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offline_payment_methods_key_key" ON "offline_payment_methods"("key");

-- CreateIndex
CREATE INDEX "offline_payment_methods_isActive_idx" ON "offline_payment_methods"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "manual_payment_records_paymentId_key" ON "manual_payment_records"("paymentId");

-- CreateIndex
CREATE INDEX "manual_payment_records_status_idx" ON "manual_payment_records"("status");

-- CreateIndex
CREATE INDEX "manual_payment_records_recordedByUserId_idx" ON "manual_payment_records"("recordedByUserId");

-- AddForeignKey
ALTER TABLE "manual_payment_records" ADD CONSTRAINT "manual_payment_records_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_records" ADD CONSTRAINT "manual_payment_records_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "offline_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_records" ADD CONSTRAINT "manual_payment_records_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_payment_records" ADD CONSTRAINT "manual_payment_records_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
