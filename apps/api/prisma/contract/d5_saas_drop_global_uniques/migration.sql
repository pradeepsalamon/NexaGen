-- SaaS §D5 contract (docs/SAAS_MULTI_TENANCY.md §D, §J-10/11): the point of no return.
--
-- NOT a migration yet. It lives outside prisma/migrations/ so CI, the drift
-- check and deploy-production.sh never apply it. Promote it only after the
-- rehearsal on a restored production backup passes (scripts/saas/rehearse-d5.sh)
-- and the owner approves, following README.md in this folder.
--
-- What it does, in one transaction (Prisma sends a migration as one query):
--  1. Drops the 23 global unique indexes that D4 gave a per-academy twin
--     ("tenantId", …): emails, usernames, codes, numbers, gateway ids.
--  2. Number sequences (invoice, credit note, payslip): primary key
--     "year" -> ("tenantId", "year"); the (tenantId, year) unique it replaces
--     is dropped. System message templates the same: "key" ->
--     ("tenantId", "key") (added 2026-11-06).
--  3. Replaces the 'tenant_nexa' default of every "tenantId" column with
--     nexa_tenant_required(), which raises: a row written without an academy
--     is an error from now on, never Nexa's. (A default is kept, rather than
--     none, so Prisma's create types don't change: the tenant-scope extension
--     fills tenantId at runtime and 483 call sites would otherwise need it.)
--  4. Drops the four hand-written global partial uniques that have a
--     per-academy twin (puzzle folder name/slug, automatic referral stage,
--     verified chess username).
--
-- Rollback: none by migration. Restore the backup taken right before (§J-11).

-- A tenantId default that refuses: see 3.
CREATE OR REPLACE FUNCTION nexa_tenant_required() RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tenantId is required (SaaS D5): a row was written without an academy'
    USING ERRCODE = 'not_null_violation';
END
$$;

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "users_username_key";

-- DropIndex
DROP INDEX "demo_schedules_slug_key";

-- DropIndex
DROP INDEX "storage_snapshots_capturedDate_key";

-- DropIndex
DROP INDEX "puzzles_source_sourceId_key";

-- DropIndex
DROP INDEX "messaging_rules_event_key";

-- DropIndex
DROP INDEX "plans_code_key";

-- DropIndex
DROP INDEX "orders_orderNumber_key";

-- DropIndex
DROP INDEX "payments_provider_providerPaymentId_key";

-- DropIndex
DROP INDEX "payment_webhook_events_provider_eventId_key";

-- DropIndex
DROP INDEX "refunds_provider_providerRefundId_key";

-- DropIndex
DROP INDEX "subscriptions_provider_providerSubscriptionId_key";

-- DropIndex
DROP INDEX "invoices_number_key";

-- DropIndex
DROP INDEX "credit_notes_number_key";

-- DropIndex
DROP INDEX "credit_note_sequences_tenantId_year_key";

-- DropIndex
DROP INDEX "invoice_sequences_tenantId_year_key";

-- DropIndex
DROP INDEX "offline_payment_methods_key_key";

-- DropIndex
DROP INDEX "discounts_code_key";

-- DropIndex
DROP INDEX "payroll_periods_periodType_startDate_endDate_key";

-- DropIndex
DROP INDEX "payslips_documentNumber_key";

-- DropIndex
DROP INDEX "payslip_sequences_tenantId_year_key";

-- DropIndex
DROP INDEX "system_message_templates_tenantId_key_key";

-- DropIndex
DROP INDEX "chess_games_sourceKey_key";

-- DropIndex
DROP INDEX "knowledge_categories_name_key";

-- DropIndex
DROP INDEX "knowledge_articles_slug_key";

-- DropIndex
DROP INDEX "retention_policies_category_key";

-- DropIndex
DROP INDEX "referral_codes_code_key";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "student_profiles" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "coach_profiles" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "auth_sessions" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "user_mfa" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "password_reset_tokens" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "email_verification_tokens" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "tenant_brandings" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "whatsapp_settings" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "email_settings" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "direct_emails" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "batches" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "batch_coaches" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "batch_students" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "trash_audit_logs" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "classes" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "demo_schedules" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "demo_class_registrations" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "visitor_sessions" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "lead_activities" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "lead_notes" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "batch_class_schedules" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "batch_class_schedule_rules" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "batch_schedule_exceptions" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "class_attendance" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "attendance_logs" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "coach_attendance" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "coach_attendance_logs" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "attendance_policies" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_sessions" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_pulls" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_waiting_participants" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_screen_share_requests" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_chat_messages" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_policies" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_presets" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "chess_appearance_settings" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "user_chess_appearance_preferences" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "typography_settings" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "user_typography_preferences" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "courses" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "course_modules" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "student_course_progress" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "student_module_progress" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "Practice" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "student_practices" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "assignments" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "assignment_batches" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "student_assignments" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "student_assignment_attempts" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "assignment_puzzles" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "student_activities" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "announcements" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "recording_watch_progress" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "analytics_events" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "storage_snapshots" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "puzzle_topics" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "puzzles" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "puzzle_attempts" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_puzzle_assignments" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_leaderboard_adjustments" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_simuls" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_simul_games" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_match_rounds" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_match_games" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_match_challenges" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_move_polls" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_move_poll_answers" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_puzzle_rushes" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_puzzle_rush_entries" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_tool_states" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_chapters" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "puzzle_scoring_settings" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "messaging_rules" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "message_deliveries" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "system_message_templates" DROP CONSTRAINT "system_message_templates_pkey",
ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required(),
ADD CONSTRAINT "system_message_templates_pkey" PRIMARY KEY ("tenantId", "key");

-- AlterTable
ALTER TABLE "plans" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "payment_attempts" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "payment_webhook_events" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "refunds" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "credit_notes" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "billing_profiles" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "credit_note_sequences" DROP CONSTRAINT "credit_note_sequences_pkey",
ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required(),
ADD CONSTRAINT "credit_note_sequences_pkey" PRIMARY KEY ("tenantId", "year");

-- AlterTable
ALTER TABLE "invoice_settings" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "invoice_audit_logs" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "invoice_sequences" DROP CONSTRAINT "invoice_sequences_pkey",
ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required(),
ADD CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("tenantId", "year");

-- AlterTable
ALTER TABLE "entitlements" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "offline_payment_methods" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "manual_payment_records" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "payment_provider_events" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "payment_settings" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "discounts" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "discount_redemptions" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "coach_compensation_profiles" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "coach_compensation_rates" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "payroll_rules" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "payroll_periods" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "coach_payroll_records" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "payroll_adjustments" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "coach_payouts" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "payslips" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "payslip_sequences" DROP CONSTRAINT "payslip_sequences_pkey",
ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required(),
ADD CONSTRAINT "payslip_sequences_pkey" PRIMARY KEY ("tenantId", "year");

-- AlterTable
ALTER TABLE "feedback_forms" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "feedback_responses" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "feedback_answers" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "approval_requests" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "approval_events" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "class_change_requests" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "student_progress" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "puzzle_rating_changes" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "chess_games" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "game_source_settings" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "external_chess_accounts" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "game_analyses" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "game_analysis_sides" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "conversation_members" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "chat_messages" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_activity_queues" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_activity_queue_items" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "library_activities" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_activity_runs" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_mcq_attempts" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "live_class_playout_games" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "revision_items" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "revision_reviews" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "account_deletion_requests" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "tenant_payment_credentials" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "knowledge_categories" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "knowledge_articles" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "knowledge_article_batches" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "knowledge_article_versions" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "knowledge_article_events" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "knowledge_feedback" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "knowledge_search_logs" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "retention_policies" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_stages" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_codes" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_visits" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referrals" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_stage_reaches" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_stage_events" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_reward_rules" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_rewards" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_credit_entries" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_points_transfers" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_points_conversions" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_withdrawals" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();

-- AlterTable
ALTER TABLE "referral_settings" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();


-- Hand-written global partial uniques (not in schema.prisma) with per-academy twins.
DROP INDEX IF EXISTS "puzzle_topics_name_key";
DROP INDEX IF EXISTS "puzzle_topics_slug_key";
DROP INDEX IF EXISTS "referral_stages_trigger_automatic_key";
DROP INDEX IF EXISTS "external_chess_accounts_verified_username_key";
