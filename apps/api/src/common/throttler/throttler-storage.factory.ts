import { Logger } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  buildRequestPathConnection,
  isRedisConfigured
} from "../../redis/redis.config";

/**
 * Rate-limit counters. Backed by Redis when REDIS_URL is set, so they survive a
 * restart — in-memory counters reset on every deploy, which hands an attacker a
 * fresh allowance against the login and password-reset limits.
 *
 * Returns undefined without Redis, leaving ThrottlerModule on its in-memory
 * default.
 */
export function createThrottlerStorage(): ThrottlerStorage | undefined {
  const env = getApiEnv();
  const logger = new Logger("ThrottlerStorage");

  if (!isRedisConfigured(env)) {
    logger.warn(
      "REDIS_URL is unset — rate limits are counted in-process and reset on every restart."
    );
    return undefined;
  }

  return new ThrottlerStorageRedisService(
    buildRequestPathConnection(env, "throttle")
  );
}
