-- CreateEnum
CREATE TYPE "PlatformBillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "PlatformCheckoutStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "platform_payments" ADD COLUMN     "checkoutId" TEXT,
ADD COLUMN     "gatewayPaymentId" TEXT;

-- CreateTable
CREATE TABLE "platform_checkouts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "period" "PlatformBillingPeriod" NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "taxBreakdown" JSONB NOT NULL DEFAULT '{}',
    "status" "PlatformCheckoutStatus" NOT NULL DEFAULT 'CREATED',
    "providerOrderId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdByPlatform" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "note" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "platform_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "financialYear" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',

    CONSTRAINT "platform_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoice_counters" (
    "financialYear" INTEGER NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platform_invoice_counters_pkey" PRIMARY KEY ("financialYear")
);

-- CreateTable
CREATE TABLE "platform_seller_settings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "details" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_seller_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_usage" (
    "tenantId" TEXT NOT NULL,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_usage_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "tenant_payment_credentials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "provider" "PaymentProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publicKey" TEXT NOT NULL,
    "secretsEncrypted" TEXT NOT NULL,
    "webhookKey" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_payment_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_checkouts_providerOrderId_key" ON "platform_checkouts"("providerOrderId");

-- CreateIndex
CREATE INDEX "platform_checkouts_tenantId_status_idx" ON "platform_checkouts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "platform_webhook_events_receivedAt_idx" ON "platform_webhook_events"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_webhook_events_provider_eventId_key" ON "platform_webhook_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_paymentId_key" ON "platform_invoices"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_number_key" ON "platform_invoices"("number");

-- CreateIndex
CREATE INDEX "platform_invoices_tenantId_issuedAt_idx" ON "platform_invoices"("tenantId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_financialYear_sequence_key" ON "platform_invoices"("financialYear", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payment_credentials_webhookKey_key" ON "tenant_payment_credentials"("webhookKey");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_payment_credentials_tenantId_provider_key" ON "tenant_payment_credentials"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "platform_payments_gatewayPaymentId_key" ON "platform_payments"("gatewayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_payments_checkoutId_key" ON "platform_payments"("checkoutId");

-- AddForeignKey
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "platform_checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_checkouts" ADD CONSTRAINT "platform_checkouts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_checkouts" ADD CONSTRAINT "platform_checkouts_planId_fkey" FOREIGN KEY ("planId") REFERENCES "platform_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "platform_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_usage" ADD CONSTRAINT "tenant_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

