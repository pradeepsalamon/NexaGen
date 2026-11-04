-- SaaS Phase 3 slice 7 (docs/SAAS_MULTI_TENANCY.md § "Phase 3 plan"): the
-- hand-written partial unique indexes D4 missed get a per-academy twin, with
-- "tenantId" as the leading column (§D). The global ones are dropped in §D5.
-- Small tables; additive.

CREATE UNIQUE INDEX "puzzle_topics_tenantId_name_key" ON "puzzle_topics"("tenantId", "name") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "puzzle_topics_tenantId_slug_key" ON "puzzle_topics"("tenantId", "slug") WHERE "isDeleted" = false;
CREATE UNIQUE INDEX "referral_stages_tenantId_trigger_automatic_key" ON "referral_stages"("tenantId", "trigger") WHERE "trigger" <> 'MANUAL';
CREATE UNIQUE INDEX "external_chess_accounts_tenantId_verified_username_key" ON "external_chess_accounts"("tenantId", "provider", "usernameKey") WHERE "verifiedAt" IS NOT NULL;
