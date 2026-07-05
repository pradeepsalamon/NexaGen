-- Add soft-delete fields to trashable domain tables.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

ALTER TABLE "student_profiles" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "student_profiles" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "student_profiles" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

ALTER TABLE "batch_coaches" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "batch_coaches" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "batch_coaches" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

ALTER TABLE "batch_students" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "batch_students" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "batch_students" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

CREATE TABLE IF NOT EXISTS "trash_audit_logs" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trash_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "users_isDeleted_idx" ON "users"("isDeleted");
CREATE INDEX IF NOT EXISTS "users_deletedAt_idx" ON "users"("deletedAt");
CREATE INDEX IF NOT EXISTS "users_deletedById_idx" ON "users"("deletedById");

CREATE INDEX IF NOT EXISTS "student_profiles_isDeleted_idx" ON "student_profiles"("isDeleted");
CREATE INDEX IF NOT EXISTS "student_profiles_deletedAt_idx" ON "student_profiles"("deletedAt");
CREATE INDEX IF NOT EXISTS "student_profiles_deletedById_idx" ON "student_profiles"("deletedById");

CREATE INDEX IF NOT EXISTS "coach_profiles_isDeleted_idx" ON "coach_profiles"("isDeleted");
CREATE INDEX IF NOT EXISTS "coach_profiles_deletedAt_idx" ON "coach_profiles"("deletedAt");
CREATE INDEX IF NOT EXISTS "coach_profiles_deletedById_idx" ON "coach_profiles"("deletedById");

CREATE INDEX IF NOT EXISTS "batches_isDeleted_idx" ON "batches"("isDeleted");
CREATE INDEX IF NOT EXISTS "batches_deletedAt_idx" ON "batches"("deletedAt");
CREATE INDEX IF NOT EXISTS "batches_deletedById_idx" ON "batches"("deletedById");

CREATE INDEX IF NOT EXISTS "batch_coaches_isDeleted_idx" ON "batch_coaches"("isDeleted");
CREATE INDEX IF NOT EXISTS "batch_coaches_deletedAt_idx" ON "batch_coaches"("deletedAt");
CREATE INDEX IF NOT EXISTS "batch_coaches_deletedById_idx" ON "batch_coaches"("deletedById");

CREATE INDEX IF NOT EXISTS "batch_students_isDeleted_idx" ON "batch_students"("isDeleted");
CREATE INDEX IF NOT EXISTS "batch_students_deletedAt_idx" ON "batch_students"("deletedAt");
CREATE INDEX IF NOT EXISTS "batch_students_deletedById_idx" ON "batch_students"("deletedById");

CREATE INDEX IF NOT EXISTS "trash_audit_logs_entity_idx" ON "trash_audit_logs"("entity");
CREATE INDEX IF NOT EXISTS "trash_audit_logs_entityId_idx" ON "trash_audit_logs"("entityId");
CREATE INDEX IF NOT EXISTS "trash_audit_logs_action_idx" ON "trash_audit_logs"("action");
CREATE INDEX IF NOT EXISTS "trash_audit_logs_createdAt_idx" ON "trash_audit_logs"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_deletedById_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_profiles_deletedById_fkey') THEN
    ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coach_profiles_deletedById_fkey') THEN
    ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_deletedById_fkey') THEN
    ALTER TABLE "batches" ADD CONSTRAINT "batches_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batch_coaches_deletedById_fkey') THEN
    ALTER TABLE "batch_coaches" ADD CONSTRAINT "batch_coaches_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batch_students_deletedById_fkey') THEN
    ALTER TABLE "batch_students" ADD CONSTRAINT "batch_students_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trash_audit_logs_userId_fkey') THEN
    ALTER TABLE "trash_audit_logs" ADD CONSTRAINT "trash_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
