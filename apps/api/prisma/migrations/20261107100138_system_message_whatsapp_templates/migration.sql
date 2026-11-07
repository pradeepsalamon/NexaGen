-- Approved WhatsApp templates for system messages (docs/MESSAGING.md "WhatsApp templates").
-- Additive: existing rows keep sending free text (no template name).
-- AlterTable
ALTER TABLE "system_message_templates" ADD COLUMN     "whatsappTemplateLanguage" TEXT,
ADD COLUMN     "whatsappTemplateName" TEXT,
ADD COLUMN     "whatsappTemplateParams" TEXT[] DEFAULT ARRAY[]::TEXT[];

