-- Coach login is now gated on `coach_profiles.approvalStatus = 'ACTIVE'`
-- (AUDIT H9). Coaches created before this change kept the column's PENDING
-- default even though their account was fully active, so grandfather every
-- coach whose user record is already ACTIVE — otherwise the new gate would
-- lock out working accounts on deploy.
UPDATE "coach_profiles" AS cp
SET
  "approvalStatus" = 'ACTIVE',
  "approvedAt"     = COALESCE(cp."approvedAt", NOW())
FROM "users" AS u
WHERE
  cp."userId" = u."id"
  AND u."role" = 'COACH'
  AND u."status" = 'ACTIVE'
  AND cp."approvalStatus" <> 'ACTIVE'
  AND cp."isDeleted" = false;
