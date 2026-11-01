-- AlterTable
ALTER TABLE "invoice_settings" ALTER COLUMN "invoicePrefix" SET DEFAULT 'INV',
ALTER COLUMN "creditNotePrefix" SET DEFAULT 'CN';

-- GST Rule 46 caps a document number at 16 characters; the new format
-- (PREFIX/26-27/00001) needs a prefix of at most 4 letters, digits or hyphens.
-- Saved prefixes that no longer fit fall back to the defaults. Issued numbers
-- are never touched.
UPDATE "invoice_settings" SET "invoicePrefix" = 'INV'
WHERE "invoicePrefix" !~ '^[A-Za-z0-9-]{1,4}$';
UPDATE "invoice_settings" SET "creditNotePrefix" = 'CN'
WHERE "creditNotePrefix" !~ '^[A-Za-z0-9-]{1,4}$';
