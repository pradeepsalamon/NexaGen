-- SaaS multi-tenancy Phase 3, step D4 (docs/SAAS_MULTI_TENANCY.md §D, "Phase 3 plan" slice 3).
--
-- 1. "tenantId" becomes NOT NULL on all 152 academy-owned tables. Every row
--    already holds a value (the D2 default 'tenant_nexa'); the DEFAULT stays
--    until D5 so images built before this step keep inserting.
-- 2. A per-academy unique next to each global business key (email, username,
--    invoice/credit-note/payslip/order numbers, codes, slugs, gateway ids,
--    per-academy singletons). The global uniques still hold, so nothing new
--    can be refused; D5 drops them once a second academy is allowed.
--
-- Additive for old images. Prisma runs the file as one transaction, so each
-- SET NOT NULL scans its table under an exclusive lock: time it on a copy of
-- production before deploying (plan §L Phase 3 "done when").

-- AlterTable
ALTER TABLE "Practice" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "account_deletion_requests" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "analytics_events" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "announcements" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "approval_events" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "approval_requests" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "assignment_batches" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "assignment_puzzles" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "assignments" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "attendance_logs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "attendance_policies" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "auth_sessions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "batch_class_schedule_rules" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "batch_class_schedules" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "batch_coaches" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "batch_schedule_exceptions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "batch_students" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "batches" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "billing_profiles" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "chat_messages" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "chess_appearance_settings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "chess_games" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "class_attendance" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "class_change_requests" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "classes" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "coach_attendance" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "coach_attendance_logs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "coach_compensation_profiles" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "coach_compensation_rates" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "coach_payouts" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "coach_payroll_records" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "coach_profiles" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "conversation_members" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "course_modules" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "courses" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "credit_note_sequences" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "credit_notes" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "demo_class_registrations" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "demo_schedules" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "direct_emails" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "discount_redemptions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "discounts" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "email_settings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "email_verification_tokens" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "entitlements" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "external_chess_accounts" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "feedback_answers" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "feedback_forms" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "feedback_responses" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "game_analyses" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "game_analysis_sides" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "game_source_settings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "invoice_audit_logs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "invoice_sequences" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "invoice_settings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "knowledge_article_batches" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "knowledge_article_events" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "knowledge_article_versions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "knowledge_articles" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "knowledge_categories" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "knowledge_feedback" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "knowledge_search_logs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "lead_activities" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "lead_notes" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "library_activities" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_chat_messages" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_activity_queue_items" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_activity_queues" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_activity_runs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_chapters" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_leaderboard_adjustments" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_match_challenges" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_match_games" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_match_rounds" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_mcq_attempts" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_move_poll_answers" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_move_polls" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_playout_games" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_policies" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_presets" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_pulls" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_puzzle_assignments" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_puzzle_rush_entries" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_puzzle_rushes" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_screen_share_requests" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_simul_games" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_simuls" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_tool_states" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_class_waiting_participants" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "live_sessions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "manual_payment_records" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "message_deliveries" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "messaging_rules" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "offline_payment_methods" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "password_reset_tokens" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payment_attempts" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payment_provider_events" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payment_settings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payment_webhook_events" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payroll_adjustments" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payroll_periods" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payroll_rules" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payslip_sequences" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "payslips" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "plans" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "puzzle_attempts" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "puzzle_rating_changes" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "puzzle_scoring_settings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "puzzle_topics" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "puzzles" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "recording_watch_progress" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_codes" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_credit_entries" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_points_conversions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_points_transfers" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_reward_rules" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_rewards" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_settings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_stage_events" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_stage_reaches" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_stages" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_visits" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referral_withdrawals" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "referrals" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "refunds" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "retention_policies" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "revision_items" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "revision_reviews" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "storage_snapshots" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_activities" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_assignment_attempts" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_assignments" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_course_progress" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_module_progress" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_practices" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_profiles" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "student_progress" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "system_message_templates" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "trash_audit_logs" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "typography_settings" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_chess_appearance_preferences" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_mfa" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_typography_preferences" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "visitor_sessions" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "chess_games_tenantId_sourceKey_key" ON "chess_games"("tenantId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_tenantId_number_key" ON "credit_notes"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "demo_schedules_tenantId_slug_key" ON "demo_schedules"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_tenantId_code_key" ON "discounts"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_number_key" ON "invoices"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_tenantId_slug_key" ON "knowledge_articles"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_categories_tenantId_name_key" ON "knowledge_categories"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_rules_tenantId_event_key" ON "messaging_rules"("tenantId", "event");

-- CreateIndex
CREATE UNIQUE INDEX "offline_payment_methods_tenantId_key_key" ON "offline_payment_methods"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenantId_orderNumber_key" ON "orders"("tenantId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_tenantId_provider_eventId_key" ON "payment_webhook_events"("tenantId", "provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_provider_providerPaymentId_key" ON "payments"("tenantId", "provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_tenantId_periodType_startDate_endDate_key" ON "payroll_periods"("tenantId", "periodType", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_tenantId_documentNumber_key" ON "payslips"("tenantId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "plans_tenantId_code_key" ON "plans"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "puzzles_tenantId_source_sourceId_key" ON "puzzles"("tenantId", "source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_tenantId_code_key" ON "referral_codes"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_tenantId_provider_providerRefundId_key" ON "refunds"("tenantId", "provider", "providerRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_tenantId_category_key" ON "retention_policies"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "storage_snapshots_tenantId_capturedDate_key" ON "storage_snapshots"("tenantId", "capturedDate");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_provider_providerSubscriptionId_key" ON "subscriptions"("tenantId", "provider", "providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_username_key" ON "users"("tenantId", "username");

