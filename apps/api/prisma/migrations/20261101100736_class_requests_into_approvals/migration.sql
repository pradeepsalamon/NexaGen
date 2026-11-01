-- Stage 5 of docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md: coach extra-class
-- and reschedule requests move into the approval engine as the CLASS_EXTRA and
-- CLASS_RESCHEDULE actions. Data only, no schema change, additive:
--   1. every class_change_requests row is copied into approval_requests under
--      the SAME id, with its history as approval_events;
--   2. the old PENDING rows are marked WITHDRAWN with a note pointing at their
--      copy (the copy is the live one and is decided in the inbox);
--   3. class_change_requests becomes read-only history (trigger below).
--
-- Timestamps are UTC `timestamp WITHOUT time zone` (CLAUDE.md §3.4): columns
-- are copied as they are, and "now" is NOW() AT TIME ZONE 'UTC', never
-- CURRENT_TIMESTAMP (the session may be in another zone).
--
-- The strings below must match the API exactly:
--   dedupe keys  apps/api/src/approval/handlers/class-change.handler.ts
--   ISO times    JS Date#toISOString(), e.g. 2026-11-05T10:00:00.000Z
--   JSON shapes  @nexa-chess/types class-requests.ts (ClassTimeValue)

-- An API still on the old code must not add a row after the copy.
LOCK TABLE "class_change_requests" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMPORARY TABLE "_ported_class_requests" ON COMMIT DROP AS
WITH src AS (
  SELECT
    r.*,
    to_char(r."startsAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsIso",
    to_char(r."endsAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsIso",
    to_char(r."originalStartsAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "originalStartsIso",
    to_char(r."originalEndsAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "originalEndsIso",
    CASE
      WHEN r."type" = 'EXTRA_CLASS' THEN
        'CLASS_EXTRA:' || r."coachId" || ':' || r."batchId" || ':' ||
        to_char(r."startsAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      -- A reschedule whose class was since hard-deleted keeps a key of its own.
      ELSE 'CLASS_RESCHEDULE:' || COALESCE(r."classId", 'missing-' || r."id")
    END AS "dedupeKey"
  FROM "class_change_requests" r
),
ranked AS (
  SELECT
    src.*,
    -- The engine allows one PENDING request per key; any older duplicate keeps
    -- it and the rest are ported as CANCELLED.
    CASE
      WHEN src."status" = 'PENDING' THEN
        ROW_NUMBER() OVER (
          PARTITION BY src."dedupeKey", (src."status" = 'PENDING')
          ORDER BY src."createdAt", src."id"
        )
      ELSE 1
    END AS "pendingRank"
  FROM src
)
SELECT
  ranked.*,
  CASE
    WHEN ranked."status" = 'PENDING' AND ranked."pendingRank" = 1 THEN 'PENDING'
    WHEN ranked."status" IN ('PENDING', 'WITHDRAWN') THEN 'CANCELLED'
    ELSE ranked."status"::text
  END AS "newStatus"
FROM ranked;

-- 1. The requests.
INSERT INTO "approval_requests" (
  "id", "category", "actionType", "status",
  "requesterId", "requesterRole", "batchId", "classId", "subjectUserId",
  "currentValue", "requestedValue", "reason", "details", "urgent",
  "dedupeKey", "expiresAt",
  "reviewerId", "decidedAt", "rejectionReason", "executionResult",
  "createdAt", "updatedAt"
)
SELECT
  p."id",
  'SCHEDULING',
  CASE WHEN p."type" = 'EXTRA_CLASS' THEN 'CLASS_EXTRA' ELSE 'CLASS_RESCHEDULE' END,
  p."newStatus"::"ApprovalStatus",
  p."coachId",
  'COACH'::"UserRole",
  p."batchId",
  p."classId",
  NULL,
  CASE
    WHEN p."type" = 'RESCHEDULE' AND p."originalStartsAt" IS NOT NULL THEN
      jsonb_build_object('startsAt', p."originalStartsIso", 'endsAt', p."originalEndsIso", 'status', 'SCHEDULED')
    ELSE NULL
  END,
  CASE
    WHEN p."type" = 'EXTRA_CLASS' THEN
      jsonb_build_object('startsAt', p."startsIso", 'endsAt', p."endsIso", 'topic', p."topic")
    ELSE jsonb_build_object('startsAt', p."startsIso", 'endsAt', p."endsIso")
  END,
  -- The engine requires a reason; the old form didn't always.
  COALESCE(NULLIF(btrim(p."reason"), ''), 'No reason given.'),
  jsonb_build_object('migratedFrom', 'class_change_requests'),
  false,
  p."dedupeKey",
  CASE
    -- Still waiting: the plan's D2 default (72 h from now), and never past the
    -- class start (for a reschedule, whichever start comes first). One already
    -- past is expired by the next cron run, which tells the coach.
    WHEN p."newStatus" = 'PENDING' THEN
      LEAST(
        p."startsAt",
        COALESCE(p."originalStartsAt", p."startsAt"),
        (NOW() AT TIME ZONE 'UTC') + INTERVAL '72 hours'
      )
    ELSE COALESCE(p."reviewedAt", p."updatedAt")
  END,
  CASE WHEN p."status" IN ('APPROVED', 'REJECTED') THEN p."reviewedById" ELSE NULL END,
  CASE
    WHEN p."newStatus" = 'PENDING' THEN NULL
    WHEN p."status" IN ('APPROVED', 'REJECTED') THEN COALESCE(p."reviewedAt", p."updatedAt")
    WHEN p."status" = 'PENDING' THEN (NOW() AT TIME ZONE 'UTC')
    ELSE p."updatedAt"
  END,
  CASE
    WHEN p."status" = 'REJECTED' THEN COALESCE(NULLIF(btrim(p."reviewNote"), ''), 'No reason recorded.')
    ELSE NULL
  END,
  CASE
    WHEN p."status" = 'APPROVED' AND p."type" = 'EXTRA_CLASS' AND p."classId" IS NOT NULL THEN
      jsonb_build_object('createdClassId', p."classId")
    WHEN p."status" = 'APPROVED' AND p."type" = 'RESCHEDULE' AND p."classId" IS NOT NULL THEN
      jsonb_build_object('movedClassId', p."classId", 'startsAt', p."startsIso")
    ELSE NULL
  END,
  p."createdAt",
  (NOW() AT TIME ZONE 'UTC')
FROM "_ported_class_requests" p;

-- 2. Their history, as the engine would have written it.
INSERT INTO "approval_events" ("id", "requestId", "type", "actorId", "metadata", "createdAt")
SELECT gen_random_uuid()::text, p."id", 'CREATED'::"ApprovalEventType", p."coachId",
       jsonb_build_object('migratedFrom', 'class_change_requests'), p."createdAt"
FROM "_ported_class_requests" p;

INSERT INTO "approval_events" ("id", "requestId", "type", "actorId", "metadata", "createdAt")
SELECT gen_random_uuid()::text, p."id", 'APPROVED'::"ApprovalEventType", p."reviewedById",
       CASE WHEN NULLIF(btrim(p."reviewNote"), '') IS NULL THEN NULL
            ELSE jsonb_build_object('note', p."reviewNote") END,
       COALESCE(p."reviewedAt", p."updatedAt")
FROM "_ported_class_requests" p
WHERE p."status" = 'APPROVED';

INSERT INTO "approval_events" ("id", "requestId", "type", "actorId", "metadata", "createdAt")
SELECT gen_random_uuid()::text, p."id", 'REJECTED'::"ApprovalEventType", p."reviewedById",
       jsonb_build_object('reason', COALESCE(NULLIF(btrim(p."reviewNote"), ''), 'No reason recorded.')),
       COALESCE(p."reviewedAt", p."updatedAt")
FROM "_ported_class_requests" p
WHERE p."status" = 'REJECTED';

INSERT INTO "approval_events" ("id", "requestId", "type", "actorId", "metadata", "createdAt")
SELECT gen_random_uuid()::text, p."id", 'CANCELLED'::"ApprovalEventType",
       CASE WHEN p."status" = 'WITHDRAWN' THEN p."coachId" ELSE NULL END,
       CASE WHEN p."status" = 'PENDING'
            THEN jsonb_build_object('message', 'Duplicate of an earlier pending request; closed when requests moved to the inbox.')
            ELSE NULL END,
       CASE WHEN p."status" = 'PENDING' THEN (NOW() AT TIME ZONE 'UTC') ELSE p."updatedAt" END
FROM "_ported_class_requests" p
WHERE p."newStatus" = 'CANCELLED';

-- 3. The old rows that were still waiting now point at their copy.
UPDATE "class_change_requests"
   SET "status" = 'WITHDRAWN',
       "reviewNote" = 'Moved to the requests inbox (approval request ' || "id" || ') and decided there.',
       "updatedAt" = (NOW() AT TIME ZONE 'UTC')
 WHERE "status" = 'PENDING';

-- 4. Read-only from here on. A user or batch hard purge still cascades (DELETE)
--    and a class hard delete still nulls `classId` (UPDATE): those referential
--    actions run nested in the FK's own trigger (pg_trigger_depth() > 1). A
--    direct INSERT, UPDATE or DELETE runs at depth 1 and is refused.
CREATE OR REPLACE FUNCTION "nexa_read_only_history"() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is read-only history: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "class_change_requests_read_only"
  BEFORE INSERT OR UPDATE OR DELETE ON "class_change_requests"
  FOR EACH ROW EXECUTE FUNCTION "nexa_read_only_history"();

COMMENT ON TABLE "class_change_requests" IS
  'Read-only history since migration 20261101100736: every row was copied into approval_requests (same id). New class requests are CLASS_EXTRA / CLASS_RESCHEDULE approvals.';
