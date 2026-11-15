-- SaaS Phase 3 slice 5 (docs/SAAS_MULTI_TENANCY.md § "Phase 3 plan").
-- Additive: settings tables get one row per academy (looked up by "tenantId";
-- Nexa's row keeps id 'default'), and number sequences get an academy key next
-- to the old "year" primary key, which §D5 replaces with ("tenantId", "year").
-- Each table holds at most a handful of rows, so the indexes build instantly.

-- CreateIndex
CREATE UNIQUE INDEX "credit_note_sequences_tenantId_year_key" ON "credit_note_sequences"("tenantId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "email_settings_tenantId_key" ON "email_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "game_source_settings_tenantId_key" ON "game_source_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_sequences_tenantId_year_key" ON "invoice_sequences"("tenantId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_settings_tenantId_key" ON "invoice_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_sequences_tenantId_year_key" ON "payslip_sequences"("tenantId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_scoring_settings_tenantId_key" ON "puzzle_scoring_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_settings_tenantId_key" ON "referral_settings"("tenantId");

