import { Logger } from "@nestjs/common";
import type { Queue } from "bullmq";

/**
 * Stand-in bound to a queue's injection token when REDIS_URL is unset, so an
 * API without Redis still boots and every `@InjectQueue()` still resolves.
 *
 * It drops the job and logs it. Nothing processes work in this mode, so any
 * producer whose job must not be lost has to persist its own row first (a
 * status column it can re-drive) and treat the enqueue as best-effort.
 */
export function createDisabledQueue(name: string): Queue {
  const logger = new Logger(`DisabledQueue:${name}`);

  const drop = (jobName: string, count = 1) => {
    logger.error(
      `Dropped ${count} "${jobName}" job(s) — queues are disabled (REDIS_URL is unset).`
    );
  };

  const stub = {
    name,
    add: async (jobName: string) => {
      drop(jobName);
      return undefined;
    },
    addBulk: async (jobs: { name: string }[]) => {
      drop(jobs[0]?.name ?? "unknown", jobs.length);
      return [];
    },
    getJobCounts: async () => ({}),
    close: async () => undefined,
    on: () => stub,
    off: () => stub
  };

  // Deliberately partial: only the producer surface is implemented.
  return stub as unknown as Queue;
}
