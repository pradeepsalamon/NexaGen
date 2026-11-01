-- 1. Append-only audit: the `userId`/`actorId` → NULL exception exists only so
--    the foreign key's ON DELETE SET NULL can run when a user is hard-purged.
--    That referential action runs nested inside the FK's own trigger
--    (pg_trigger_depth() > 1); a direct UPDATE runs at depth 1 and is refused,
--    so nobody can strip the actor off an audit row by hand.
CREATE OR REPLACE FUNCTION "nexa_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND pg_trigger_depth() > 1
     AND (to_jsonb(NEW) ->> TG_ARGV[0]) IS NULL
     AND (to_jsonb(NEW) - TG_ARGV[0]) = (to_jsonb(OLD) - TG_ARGV[0]) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

-- 2. One open extra-class request per coach, batch and start time. The
--    service's duplicate check is a read-then-insert, so two concurrent submits
--    could both pass it; this index makes the second insert a P2002 (→ 409).
--    Pre-existing duplicates would block the index, so all but the oldest are
--    withdrawn first (timestamps are UTC, `timestamp WITHOUT time zone`).
UPDATE "class_change_requests" AS dup
   SET "status" = 'WITHDRAWN',
       "reviewNote" = 'Withdrawn automatically: duplicate of an earlier pending request for the same extra class.',
       "updatedAt" = (NOW() AT TIME ZONE 'UTC')
 WHERE dup."status" = 'PENDING'
   AND dup."type" = 'EXTRA_CLASS'
   AND EXISTS (
     SELECT 1 FROM "class_change_requests" AS keep
      WHERE keep."status" = 'PENDING'
        AND keep."type" = 'EXTRA_CLASS'
        AND keep."batchId" = dup."batchId"
        AND keep."coachId" = dup."coachId"
        AND keep."startsAt" = dup."startsAt"
        AND (keep."createdAt", keep."id") < (dup."createdAt", dup."id")
   );

CREATE UNIQUE INDEX "class_change_requests_pending_extra_class_unique"
  ON "class_change_requests" ("batchId", "coachId", "startsAt")
  WHERE "status" = 'PENDING' AND "type" = 'EXTRA_CLASS';
