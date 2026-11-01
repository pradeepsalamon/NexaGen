-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ApprovalEventType" AS ENUM ('CREATED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REVALIDATION_FAILED');

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT,
    "requesterRole" "UserRole" NOT NULL,
    "batchId" TEXT,
    "classId" TEXT,
    "subjectUserId" TEXT,
    "currentValue" JSONB,
    "requestedValue" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewerId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "executionResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" "ApprovalEventType" NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_requests_status_createdAt_idx" ON "approval_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "approval_requests_requesterId_idx" ON "approval_requests"("requesterId");

-- CreateIndex
CREATE INDEX "approval_requests_batchId_idx" ON "approval_requests"("batchId");

-- CreateIndex
CREATE INDEX "approval_requests_classId_idx" ON "approval_requests"("classId");

-- CreateIndex
CREATE INDEX "approval_requests_actionType_idx" ON "approval_requests"("actionType");

-- CreateIndex
CREATE INDEX "approval_events_requestId_createdAt_idx" ON "approval_events"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Hand-written (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §2.3, §2.6) ───

-- One PENDING request per operation: a duplicate ask is a unique violation (409).
CREATE UNIQUE INDEX "approval_requests_pending_dedupe_key"
  ON "approval_requests"("dedupeKey")
  WHERE "status" = 'PENDING';

-- Nobody reviews their own request.
ALTER TABLE "approval_requests"
  ADD CONSTRAINT "approval_requests_no_self_review"
  CHECK ("reviewerId" IS NULL OR "requesterId" IS NULL OR "reviewerId" <> "requesterId");

-- Append-only audit tables (V9). DELETE is refused; UPDATE is refused except
-- the one the foreign key itself performs when a user is hard-purged: the user
-- column (TG_ARGV[0]) going to NULL with every other column unchanged.
-- TRUNCATE (test cleanup) does not fire row triggers.
CREATE OR REPLACE FUNCTION "nexa_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) ->> TG_ARGV[0]) IS NULL
     AND (to_jsonb(NEW) - TG_ARGV[0]) = (to_jsonb(OLD) - TG_ARGV[0]) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trash_audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "trash_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "nexa_append_only"('userId');

CREATE TRIGGER "approval_events_append_only"
  BEFORE UPDATE OR DELETE ON "approval_events"
  FOR EACH ROW EXECUTE FUNCTION "nexa_append_only"('actorId');
