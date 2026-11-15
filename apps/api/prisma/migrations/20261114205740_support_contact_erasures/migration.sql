-- CreateTable
CREATE TABLE "support_contact_erasures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "contactId" TEXT NOT NULL,
    "erasedById" TEXT,
    "conversations" INTEGER NOT NULL,
    "messages" INTEGER NOT NULL,
    "tickets" INTEGER NOT NULL,
    "keptOptOut" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_contact_erasures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_contact_erasures_tenantId_createdAt_idx" ON "support_contact_erasures"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "support_contact_erasures" ADD CONSTRAINT "support_contact_erasures_erasedById_fkey" FOREIGN KEY ("erasedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

