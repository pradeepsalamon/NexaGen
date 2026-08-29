-- AUDIT M1: dedupe key for LiveKit webhook retries.
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "processed_webhook_events_processedAt_idx" ON "processed_webhook_events"("processedAt");
