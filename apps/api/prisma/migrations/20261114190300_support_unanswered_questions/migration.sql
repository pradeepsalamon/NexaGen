-- CreateTable
CREATE TABLE "support_unanswered_questions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "normalized" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "timesAsked" INTEGER NOT NULL DEFAULT 1,
    "firstAskedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAskedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,

    CONSTRAINT "support_unanswered_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_unanswered_questions_tenantId_dismissedAt_timesAske_idx" ON "support_unanswered_questions"("tenantId", "dismissedAt", "timesAsked");

-- CreateIndex
CREATE INDEX "support_unanswered_questions_lastAskedAt_idx" ON "support_unanswered_questions"("lastAskedAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_unanswered_questions_tenantId_normalized_key" ON "support_unanswered_questions"("tenantId", "normalized");

-- AddForeignKey
ALTER TABLE "support_unanswered_questions" ADD CONSTRAINT "support_unanswered_questions_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

