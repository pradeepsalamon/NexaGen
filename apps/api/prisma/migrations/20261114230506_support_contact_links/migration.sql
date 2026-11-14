-- AlterTable
ALTER TABLE "support_settings" ADD COLUMN     "accountAnswers" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "linkFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "linkFailuresFrom" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "support_contact_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "contactId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "codeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_contact_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_link_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "studentId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByContactId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_contact_links_studentId_idx" ON "support_contact_links"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "support_contact_links_contactId_studentId_key" ON "support_contact_links"("contactId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "support_link_codes_codeHash_key" ON "support_link_codes"("codeHash");

-- CreateIndex
CREATE INDEX "support_link_codes_studentId_idx" ON "support_link_codes"("studentId");

-- CreateIndex
CREATE INDEX "support_link_codes_createdById_idx" ON "support_link_codes"("createdById");

-- CreateIndex
CREATE INDEX "support_link_codes_expiresAt_idx" ON "support_link_codes"("expiresAt");

-- AddForeignKey
ALTER TABLE "support_contact_links" ADD CONSTRAINT "support_contact_links_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_contact_links" ADD CONSTRAINT "support_contact_links_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_link_codes" ADD CONSTRAINT "support_link_codes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_link_codes" ADD CONSTRAINT "support_link_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

