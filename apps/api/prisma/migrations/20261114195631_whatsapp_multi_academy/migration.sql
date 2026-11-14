-- AlterTable
ALTER TABLE "whatsapp_settings" ADD COLUMN     "appSecretEncrypted" TEXT,
ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "verifyTokenEncrypted" TEXT,
ADD COLUMN     "wabaId" TEXT,
ADD COLUMN     "webhookKey" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_webhook_events" ADD COLUMN     "phoneNumberId" TEXT;

-- CreateTable
CREATE TABLE "support_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'tenant_nexa',
    "botEnabled" BOOLEAN NOT NULL DEFAULT false,
    "testNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "staffReminderMinutes" INTEGER NOT NULL DEFAULT 15,
    "leadNudgeHours" INTEGER NOT NULL DEFAULT 20,
    "agentReplyTemplate" TEXT,
    "agentReplyTemplateLanguage" TEXT NOT NULL DEFAULT 'en',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_settings_tenantId_key" ON "support_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_settings_phoneNumberId_key" ON "whatsapp_settings"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_settings_webhookKey_key" ON "whatsapp_settings"("webhookKey");

-- AddForeignKey
ALTER TABLE "support_settings" ADD CONSTRAINT "support_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- New plan feature (docs/SAAS_PLANS.md § "Adding a feature"): the WhatsApp
-- support bot and inbox, in the Business and Enterprise tiers (Nexa's academy is Enterprise).
UPDATE "platform_plans" SET "features" = array_append("features", 'whatsappSupport') WHERE "id" IN ('plan_business', 'plan_enterprise') AND NOT ('whatsappSupport' = ANY("features"));
