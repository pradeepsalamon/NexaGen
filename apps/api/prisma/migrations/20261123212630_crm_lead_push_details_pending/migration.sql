-- A chat lead's child details that arrive after the lead was copied to Frappe CRM (review Part 1 #1).
ALTER TABLE "crm_lead_pushes" ADD COLUMN "detailsPending" BOOLEAN NOT NULL DEFAULT false;
