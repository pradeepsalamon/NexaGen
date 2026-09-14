-- CreateEnum
CREATE TYPE "InvoicePdfStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "TaxTreatment" AS ENUM ('NONE', 'INTRA_STATE', 'INTER_STATE', 'EXPORT', 'REVERSE_CHARGE');

-- CreateEnum
CREATE TYPE "CreditNoteReason" AS ENUM ('REFUND', 'CANCELLATION', 'CORRECTION', 'WRITE_OFF', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceEventType" AS ENUM ('PAYMENT_CONFIRMED', 'INVOICE_GENERATION_REQUESTED', 'INVOICE_GENERATED', 'INVOICE_GENERATION_FAILED', 'INVOICE_EMAIL_REQUESTED', 'INVOICE_EMAIL_SENT', 'INVOICE_EMAIL_FAILED', 'INVOICE_DOWNLOADED', 'INVOICE_VIEWED', 'REFUND_COMPLETED', 'CREDIT_NOTE_CREATED', 'INVOICE_SETTINGS_UPDATED');

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- ─────────────────────────────────────────────────────────────
-- invoices: widen in place.
--
-- Prisma's default diff drops issuedAt / taxAmount / taxPercent / seller* and
-- adds three NOT NULL columns with no default, which would fail (or silently
-- lose receipts) on any database that already has invoices. An issued invoice
-- is a financial record, so this is rewritten to add nullable, backfill from
-- the old columns and the rows they were derived from, constrain, and only
-- then drop.
-- ─────────────────────────────────────────────────────────────

-- 1. New columns, all nullable or defaulted so the ALTER never fails.
ALTER TABLE "invoices"
ADD COLUMN     "billingCity" TEXT,
ADD COLUMN     "billingCountry" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "billingLine1" TEXT,
ADD COLUMN     "billingLine2" TEXT,
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "billingPhone" TEXT,
ADD COLUMN     "billingPostalCode" TEXT,
ADD COLUMN     "billingState" TEXT,
ADD COLUMN     "billingStateCode" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "cgstAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "customerGstin" TEXT,
ADD COLUMN     "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountCode" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "emailSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailSentAt" TIMESTAMP(3),
ADD COLUMN     "footer" TEXT,
ADD COLUMN     "igstAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "methodDetail" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethodKind",
ADD COLUMN     "paymentProvider" "PaymentProvider",
ADD COLUMN     "pdfAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pdfBytes" INTEGER,
ADD COLUMN     "pdfError" TEXT,
ADD COLUMN     "pdfGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "pdfStatus" "InvoicePdfStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "pdfStorageKey" TEXT,
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "seller" JSONB,
ADD COLUMN     "sgstAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "taxTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxTreatment" "TaxTreatment" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "taxableAmount" INTEGER,
ADD COLUMN     "terms" TEXT,
ADD COLUMN     "transactionId" TEXT;

-- 2. Carry the old scalar columns across.
--    Legacy rows recorded a single tax figure at one percent, which is exactly
--    how IGST prints (one line), so that is the faithful mapping. CGST/SGST
--    stay zero rather than inventing a split we never recorded.
UPDATE "invoices" SET
  "invoiceDate"    = "issuedAt",
  "taxTotal"       = "taxAmount",
  "igstAmount"     = "taxAmount",
  "taxRatePercent" = "taxPercent",
  "taxTreatment"   = CASE WHEN "taxAmount" > 0 THEN 'INTER_STATE'::"TaxTreatment"
                          ELSE 'NONE'::"TaxTreatment" END;

-- 3. Seller identity was three loose columns; it is now one snapshot object.
UPDATE "invoices" SET "seller" = jsonb_build_object(
  'legalName',    COALESCE("sellerName", 'NexaChess'),
  'tradeName',    NULL,
  'addressLine1', "sellerAddress",
  'addressLine2', NULL,
  'city',         NULL,
  'state',        NULL,
  'stateCode',    NULL,
  'postalCode',   NULL,
  'country',      'IN',
  'email',        NULL,
  'phone',        NULL,
  'website',      NULL,
  'gstin',        "sellerTaxId",
  'pan',          NULL,
  'logoUrl',      NULL
);

-- 4. Buyer identity comes from the account the invoice already points at.
UPDATE "invoices" i SET
  "billingName"  = COALESCE(NULLIF(TRIM(u."firstName" || ' ' || COALESCE(u."lastName", '')), ''), u."email"),
  "billingEmail" = u."email"
FROM "users" u
WHERE u."id" = i."userId";

-- 5. Discount figures live on the order; the invoice only had a negative line.
UPDATE "invoices" i SET
  "discountAmount" = o."discountAmount",
  "discountCode"   = o."discountCode"
FROM "orders" o
WHERE o."id" = i."orderId";

-- 6. Payment facts, copied so the receipt no longer depends on a live join.
UPDATE "invoices" i SET
  "paymentProvider" = p."provider",
  "paymentMethod"   = p."paymentMethod",
  "methodDetail"    = p."methodDetail",
  "transactionId"   = p."providerPaymentId"
FROM "payments" p
WHERE p."id" = i."paymentId";

-- 7. Tax is charged on the discounted subtotal, never the list price.
UPDATE "invoices" SET "taxableAmount" = "subtotal" - "discountAmount";

-- 8. Backfilled, so the NOT NULLs can be applied.
UPDATE "invoices" SET "billingName" = 'Customer' WHERE "billingName" IS NULL;
ALTER TABLE "invoices" ALTER COLUMN "billingName" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "seller" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "taxableAmount" SET NOT NULL;

-- 9. Only now are the superseded columns removed.
DROP INDEX "invoices_userId_issuedAt_idx";
ALTER TABLE "invoices"
DROP COLUMN "issuedAt",
DROP COLUMN "sellerAddress",
DROP COLUMN "sellerName",
DROP COLUMN "sellerTaxId",
DROP COLUMN "taxAmount",
DROP COLUMN "taxPercent";

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refundId" TEXT,
    "reason" "CreditNoteReason" NOT NULL DEFAULT 'REFUND',
    "note" TEXT,
    "subtotal" INTEGER NOT NULL,
    "cgstAmount" INTEGER NOT NULL DEFAULT 0,
    "sgstAmount" INTEGER NOT NULL DEFAULT 0,
    "igstAmount" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isFullCredit" BOOLEAN NOT NULL DEFAULT false,
    "lines" JSONB NOT NULL,
    "billing" JSONB NOT NULL,
    "seller" JSONB NOT NULL,
    "pdfStatus" "InvoicePdfStatus" NOT NULL DEFAULT 'PENDING',
    "pdfStorageKey" TEXT,
    "pdfBytes" INTEGER,
    "pdfGeneratedAt" TIMESTAMP(3),
    "pdfAttempts" INTEGER NOT NULL DEFAULT 0,
    "pdfError" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_sequences" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_note_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "invoice_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "legalName" TEXT NOT NULL DEFAULT 'NexaChess',
    "tradeName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "logoUrl" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'NEXA-INV',
    "creditNotePrefix" TEXT NOT NULL DEFAULT 'NEXA-CN',
    "defaultTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxLabel" TEXT NOT NULL DEFAULT 'GST',
    "footerText" TEXT,
    "termsText" TEXT,
    "supportEmail" TEXT,
    "emailOnIssue" BOOLEAN NOT NULL DEFAULT true,
    "attachPdfToEmail" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_audit_logs" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "creditNoteId" TEXT,
    "event" "InvoiceEventType" NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_number_key" ON "credit_notes"("number");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_refundId_key" ON "credit_notes"("refundId");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_userId_issuedAt_idx" ON "credit_notes"("userId", "issuedAt");

-- CreateIndex
CREATE INDEX "credit_notes_issuedAt_idx" ON "credit_notes"("issuedAt");

-- CreateIndex
CREATE INDEX "invoice_audit_logs_invoiceId_createdAt_idx" ON "invoice_audit_logs"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "invoice_audit_logs_creditNoteId_createdAt_idx" ON "invoice_audit_logs"("creditNoteId", "createdAt");

-- CreateIndex
CREATE INDEX "invoice_audit_logs_event_createdAt_idx" ON "invoice_audit_logs"("event", "createdAt");

-- CreateIndex
CREATE INDEX "invoices_userId_invoiceDate_idx" ON "invoices"("userId", "invoiceDate");

-- CreateIndex
CREATE INDEX "invoices_pdfStatus_idx" ON "invoices"("pdfStatus");

-- CreateIndex
CREATE INDEX "invoices_paymentProvider_idx" ON "invoices"("paymentProvider");

-- CreateIndex
CREATE INDEX "invoices_paymentMethod_idx" ON "invoices"("paymentMethod");

-- CreateIndex
CREATE INDEX "invoices_currency_idx" ON "invoices"("currency");

-- CreateIndex
CREATE INDEX "invoices_invoiceDate_idx" ON "invoices"("invoiceDate");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_settings" ADD CONSTRAINT "invoice_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_audit_logs" ADD CONSTRAINT "invoice_audit_logs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_audit_logs" ADD CONSTRAINT "invoice_audit_logs_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_audit_logs" ADD CONSTRAINT "invoice_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
