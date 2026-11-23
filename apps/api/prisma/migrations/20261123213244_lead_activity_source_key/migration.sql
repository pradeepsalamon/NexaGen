-- A lead timeline entry that must happen once per source, e.g. one WhatsApp ad click per message (review Part 1 #2).
ALTER TABLE "lead_activities" ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "lead_activities_leadId_sourceKey_key" ON "lead_activities"("leadId", "sourceKey");
