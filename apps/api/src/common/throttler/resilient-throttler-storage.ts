import { Logger, type OnModuleDestroy } from "@nestjs/common";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";

type ThrottlerRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

/** How long to stop asking Redis after a failure, so an outage costs one timeout. */
const COOLDOWN_MS = 10_000;

/**
 * Redis-backed throttling that survives Redis being down.
 *
 * ThrottlerGuard is a global APP_GUARD, so a storage that throws would turn a
 * Redis blip into a 500 on every route — worse than the rate limits it
 * protects. This counts in-process instead while Redis is unreachable: limits
 * stop being shared and reset, but the API stays up.
 */
export class ResilientThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(ResilientThrottlerStorage.name);
  private cooldownUntil = 0;
  private degraded = false;
  /** Built on first use — its expiry timers are not unref'd, so we skip them entirely while healthy. */
  private fallback?: ThrottlerStorageService;

  constructor(private readonly primary: ThrottlerStorage) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerRecord> {
    const args = [key, ttl, limit, blockDuration, throttlerName] as const;

    if (Date.now() < this.cooldownUntil) {
      return this.inProcess().increment(...args);
    }

    try {
      const record = await this.primary.increment(...args);
      if (this.degraded) {
        this.degraded = false;
        this.logger.log("Redis throttler storage recovered — limits are shared again.");
      }
      return record;
    } catch (error) {
      this.cooldownUntil = Date.now() + COOLDOWN_MS;
      if (!this.degraded) {
        this.degraded = true;
        this.logger.error(
          `Redis throttler storage is unavailable — counting rate limits in-process until it returns. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      return this.inProcess().increment(...args);
    }
  }

  /** Nest only sees this wrapper, so the wrapped client's teardown runs here. */
  onModuleDestroy(): void {
    (this.primary as Partial<OnModuleDestroy>).onModuleDestroy?.();
    this.fallback?.onApplicationShutdown();
  }

  private inProcess(): ThrottlerStorageService {
    this.fallback ??= new ThrottlerStorageService();
    return this.fallback;
  }
}
