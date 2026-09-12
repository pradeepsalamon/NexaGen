import type { ApiEnv } from "@nexa-chess/config/api";
import type { ConnectionOptions, JobsOptions } from "bullmq";
import { isRedisConfigured, parseRedisUrl } from "../redis/redis.config";

export type QueueEnv = Pick<
  ApiEnv,
  "QUEUE_CONCURRENCY" | "QUEUE_PREFIX" | "REDIS_URL"
>;

/**
 * Retry/retention policy every queue inherits. A job that still fails after
 * `attempts` stays in the failed set for a week so it can be inspected and
 * replayed; successes are trimmed aggressively because Redis is memory.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 }
};

/** Queues exist only when a Redis URL is configured. See QueueModule. */
export function isQueueEnabled(env: QueueEnv): boolean {
  return isRedisConfigured(env);
}

/**
 * ioredis options for BullMQ. `maxRetriesPerRequest: null` is mandatory —
 * workers block on commands and ioredis' default retry cap kills them.
 */
export function buildQueueConnection(env: QueueEnv): ConnectionOptions {
  return {
    ...parseRedisUrl(env),
    enableReadyCheck: false,
    maxRetriesPerRequest: null
  };
}

/**
 * Worker options for a `@Processor()`. Decorators evaluate at import time, so
 * pass `getApiEnv()` straight in:
 * `@Processor(WHATSAPP_QUEUE, buildWorkerOptions(getApiEnv()))`.
 */
export function buildWorkerOptions(env: QueueEnv) {
  return { concurrency: env.QUEUE_CONCURRENCY };
}
