-- AUDIT M13/M14: group a cascading soft-delete (a parent row plus the child
-- rows retired alongside it) under one id so restore can bring the whole group
-- back together. Nullable; only set while a row sits in the trash as part of a
-- cascade. Written by TrashRepository.cascadeSoftDelete, cleared by restore.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleteGroupId" TEXT;
ALTER TABLE "student_profiles" ADD COLUMN IF NOT EXISTS "deleteGroupId" TEXT;
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "deleteGroupId" TEXT;
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "deleteGroupId" TEXT;
ALTER TABLE "batch_coaches" ADD COLUMN IF NOT EXISTS "deleteGroupId" TEXT;
ALTER TABLE "batch_students" ADD COLUMN IF NOT EXISTS "deleteGroupId" TEXT;

CREATE INDEX IF NOT EXISTS "users_deleteGroupId_idx" ON "users" ("deleteGroupId");
CREATE INDEX IF NOT EXISTS "student_profiles_deleteGroupId_idx" ON "student_profiles" ("deleteGroupId");
CREATE INDEX IF NOT EXISTS "coach_profiles_deleteGroupId_idx" ON "coach_profiles" ("deleteGroupId");
CREATE INDEX IF NOT EXISTS "batches_deleteGroupId_idx" ON "batches" ("deleteGroupId");
CREATE INDEX IF NOT EXISTS "batch_coaches_deleteGroupId_idx" ON "batch_coaches" ("deleteGroupId");
CREATE INDEX IF NOT EXISTS "batch_students_deleteGroupId_idx" ON "batch_students" ("deleteGroupId");
