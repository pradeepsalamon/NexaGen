-- Owner 2026-11-24 (review L6 follow-up): an invited demo guest who lost their
-- personal link can ask for it again from the join page. This records the last
-- re-send so one invitation is re-sent at most every 10 minutes.
ALTER TABLE "demo_class_registrations" ADD COLUMN "inviteResentAt" TIMESTAMP(3);
