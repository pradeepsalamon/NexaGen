-- One open reschedule request per class at a time (Prisma can't express a
-- partial unique index, so it lives here).
CREATE UNIQUE INDEX "class_change_requests_pending_class_unique"
  ON "class_change_requests" ("classId")
  WHERE "status" = 'PENDING' AND "classId" IS NOT NULL;
