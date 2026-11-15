-- System messages on email, WhatsApp and in-app (docs/MESSAGING.md "System messages").
-- Additive: channel switches and WhatsApp wording on the saved row (null = the catalogue
-- default), an in-app notification type, and the old per-channel pairs merged into one key.
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SYSTEM_MESSAGE';

-- AlterTable
ALTER TABLE "system_message_templates" ADD COLUMN     "emailEnabled" BOOLEAN,
ADD COLUMN     "inAppEnabled" BOOLEAN,
ADD COLUMN     "whatsappBody" TEXT,
ADD COLUMN     "whatsappEnabled" BOOLEAN,
ALTER COLUMN "body" DROP NOT NULL;


-- Merge each <X>_EMAIL / <X>_WHATSAPP pair into <X>: the email row is renamed, and the WhatsApp
-- row's wording becomes that row's whatsappBody (or a row of its own when only WhatsApp was
-- edited). A WhatsApp row saved by a different academy than the email row can't share its key
-- yet (`key` is still the primary key, §D5) and is dropped; its academy gets the default.
DO $$
DECLARE
  pair TEXT;
BEGIN
  FOREACH pair IN ARRAY ARRAY['ACCOUNT_ACCESS', 'DEMO_BOOKING', 'DEMO_REGISTRATION', 'DEMO_INVITATION'] LOOP
    UPDATE "system_message_templates" SET "key" = pair WHERE "key" = pair || '_EMAIL';

    UPDATE "system_message_templates" AS merged
       SET "whatsappBody" = w."body", "updatedAt" = GREATEST(merged."updatedAt", w."updatedAt")
      FROM "system_message_templates" AS w
     WHERE merged."key" = pair AND w."key" = pair || '_WHATSAPP' AND w."tenantId" = merged."tenantId";

    INSERT INTO "system_message_templates" ("key", "tenantId", "whatsappBody", "updatedById", "createdAt", "updatedAt")
    SELECT pair, w."tenantId", w."body", w."updatedById", w."createdAt", w."updatedAt"
      FROM "system_message_templates" AS w
     WHERE w."key" = pair || '_WHATSAPP'
       AND NOT EXISTS (SELECT 1 FROM "system_message_templates" WHERE "key" = pair);

    DELETE FROM "system_message_templates" WHERE "key" = pair || '_WHATSAPP';
  END LOOP;
END $$;
