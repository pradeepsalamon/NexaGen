-- SaaS multi-tenancy Phase 2, steps D1 + D2 (docs/SAAS_MULTI_TENANCY.md §D).
--
-- D1: tenant_domains + new tenants columns; Nexa's production web hosts become
--     ACTIVE domains of tenant_nexa.
-- D2: a nullable "tenantId" with DEFAULT 'tenant_nexa' on every academy-owned
--     table (every model not in PLATFORM_MODELS, apps/api/src/tenancy/tenant-models.ts).
--     A constant default is metadata-only on Postgres 11+: no table rewrite, and
--     existing rows read 'tenant_nexa' at once, so no batched backfill is needed.
--     Old images keep inserting without "tenantId" and the default covers them.
-- Purely additive. No FK or index on "tenantId" yet: those come with NOT NULL in D4.

-- CreateEnum
CREATE TYPE "TenantDomainKind" AS ENUM ('SUBDOMAIN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TenantDomainStatus" AS ENUM ('PENDING', 'ACTIVE', 'REMOVED');

-- AlterTable
ALTER TABLE "Practice" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "account_deletion_requests" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "analytics_events" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "approval_events" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "approval_requests" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "assignment_batches" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "assignment_puzzles" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "attendance_logs" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "attendance_policies" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "batch_class_schedule_rules" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "batch_class_schedules" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "batch_coaches" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "batch_schedule_exceptions" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "batch_students" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "batches" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "billing_profiles" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "chess_appearance_settings" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "chess_games" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "class_attendance" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "class_change_requests" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "coach_attendance" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "coach_attendance_logs" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "coach_compensation_profiles" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "coach_compensation_rates" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "coach_payouts" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "coach_payroll_records" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "coach_profiles" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "course_modules" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "credit_note_sequences" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "demo_class_registrations" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "demo_schedules" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "direct_emails" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "discount_redemptions" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "discounts" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "email_settings" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "email_verification_tokens" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "entitlements" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "external_chess_accounts" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "feedback_answers" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "feedback_forms" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "feedback_responses" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "game_analyses" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "game_analysis_sides" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "game_source_settings" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "invoice_audit_logs" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "invoice_sequences" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "invoice_settings" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "knowledge_article_batches" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "knowledge_article_events" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "knowledge_article_versions" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "knowledge_articles" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "knowledge_categories" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "knowledge_feedback" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "knowledge_search_logs" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "lead_activities" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "lead_notes" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "library_activities" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_chat_messages" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_activity_queue_items" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_activity_queues" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_activity_runs" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_chapters" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_leaderboard_adjustments" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_match_challenges" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_match_games" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_match_rounds" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_mcq_attempts" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_move_poll_answers" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_move_polls" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_playout_games" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_policies" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_presets" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_pulls" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_puzzle_assignments" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_puzzle_rush_entries" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_puzzle_rushes" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_screen_share_requests" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_simul_games" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_simuls" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_tool_states" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_class_waiting_participants" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "live_sessions" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "manual_payment_records" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "message_deliveries" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "messaging_rules" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "offline_payment_methods" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "payment_attempts" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "payment_provider_events" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "payment_settings" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "payment_webhook_events" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "payroll_adjustments" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "payroll_periods" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "payroll_rules" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "payslip_sequences" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "puzzle_attempts" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "puzzle_rating_changes" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "puzzle_scoring_settings" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "puzzle_topics" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "puzzles" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "recording_watch_progress" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_codes" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_credit_entries" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_points_conversions" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_points_transfers" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_reward_rules" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_rewards" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_settings" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_stage_events" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_stage_reaches" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_stages" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_visits" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referral_withdrawals" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "referrals" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "retention_policies" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "revision_items" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "revision_reviews" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "storage_snapshots" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "student_activities" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "student_assignment_attempts" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "student_assignments" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "student_course_progress" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "student_module_progress" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "student_practices" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "student_progress" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "system_message_templates" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- AlterTable
ALTER TABLE "trash_audit_logs" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "typography_settings" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "user_chess_appearance_preferences" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "user_mfa" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "user_typography_preferences" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- AlterTable
ALTER TABLE "visitor_sessions" ADD COLUMN     "tenantId" TEXT DEFAULT 'tenant_nexa';

-- CreateTable
CREATE TABLE "tenant_domains" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "kind" "TenantDomainKind" NOT NULL,
    "status" "TenantDomainStatus" NOT NULL DEFAULT 'PENDING',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_domains_hostname_key" ON "tenant_domains"("hostname");

-- CreateIndex
CREATE INDEX "tenant_domains_tenantId_status_idx" ON "tenant_domains"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- D1: Nexa's production web hosts. Other environments (staging, local) map
-- their configured hosts at runtime (TenantResolver, config hosts).
INSERT INTO "tenant_domains" ("id", "tenantId", "hostname", "kind", "status", "isPrimary", "updatedAt")
SELECT v.id, 'tenant_nexa', v.hostname, 'CUSTOM'::"TenantDomainKind", 'ACTIVE'::"TenantDomainStatus", v.is_primary, CURRENT_TIMESTAMP
FROM (VALUES
  ('tdom_nexa_apex', 'nexachess.in', true),
  ('tdom_nexa_www', 'www.nexachess.in', false)
) AS v(id, hostname, is_primary)
WHERE EXISTS (SELECT 1 FROM "tenants" WHERE "id" = 'tenant_nexa')
ON CONFLICT ("hostname") DO NOTHING;
