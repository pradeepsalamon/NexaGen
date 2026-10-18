import type { ApiEnv } from "@nexa-chess/config/api";
import type { RedisOptions } from "ioredis";

export type RedisEnv = Pick<ApiEnv, "QUEUE_PREFIX" | "REDIS_URL">;

/** Redis is optional everywhere: unset REDIS_URL degrades, never breaks. */
export function isRedisConfigured(env: RedisEnv): boolean {
  return Boolean(env.REDIS_URL);
}

/**
 * Address and credentials only — each caller adds its own retry policy, because
 * a queue worker and a request-path client want opposite behaviour when Redis
 * goes away (block and wait vs. fail immediately).
 */
export function parseRedisUrl(env: RedisEnv): RedisOptions {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is required to build a Redis connection.");
  }

  const url = new URL(env.REDIS_URL);
  const database = url.pathname.replace("/", "");

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: database ? Number(database) : 0,
    ...(url.protocol === "rediss:" ? { tls: {} } : {})
  };
}

/**
 * A client for work that happens inside a request. It must fail fast rather
 * than queue commands while Redis is unreachable — a hung Redis would otherwise
 * stall every request instead of the caller falling back.
 *
 * `keyPrefix` namespaces the keys under QUEUE_PREFIX; ioredis applies it to
 * `eval` KEYS too, which is how the throttler's Lua script is called.
 */
export function buildRequestPathConnection(
  env: RedisEnv,
  namespace: string
): RedisOptions {
  return {
    ...parseRedisUrl(env),
    keyPrefix: `${env.QUEUE_PREFIX}:${namespace}:`,
    commandTimeout: 1000,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1
  };
}
