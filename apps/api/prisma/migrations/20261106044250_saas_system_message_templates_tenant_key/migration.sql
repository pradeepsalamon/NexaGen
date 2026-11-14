-- Per-academy twin of the global `key` primary key (docs/SAAS_MULTI_TENANCY.md §D).
-- Additive: every key is unique today, so (tenantId, key) is too. The §D5
-- contract then makes (tenantId, key) the primary key and drops this index.
CREATE UNIQUE INDEX "system_message_templates_tenantId_key_key" ON "system_message_templates"("tenantId", "key");
