import { Injectable } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import { requireTenantId } from "../tenancy/tenant-sql";

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * A tiny in-process TTL cache for the heavier analytics sections (overview,
 * engagement, storage). Deliberately in-process, not Redis: with one API
 * container a shared cache buys nothing, and a few minutes of staleness per
 * instance is an acceptable trade for not re-running ~15 aggregate queries on
 * every dashboard poll. `?fresh=1` bypasses it.
 *
 * Every key is prefixed with the context's academy here, so a caller can't
 * forget it (docs/SAAS_MULTI_TENANCY.md § "Asynchronous and realtime paths").
 */
@Injectable()
export class AnalyticsCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttlMs = getApiEnv().ANALYTICS_CACHE_TTL_SECONDS * 1000;

  async wrap<T>(
    key: string,
    fresh: boolean | undefined,
    produce: () => Promise<T>
  ): Promise<{ value: T; cached: boolean }> {
    if (this.ttlMs <= 0) {
      return { value: await produce(), cached: false };
    }
    const now = Date.now();
    const scopedKey = `${requireTenantId("analyticsCache")}|${key}`;
    if (!fresh) {
      const hit = this.store.get(scopedKey);
      if (hit && hit.expiresAt > now) {
        return { value: hit.value as T, cached: true };
      }
    }
    const value = await produce();
    this.store.set(scopedKey, { value, expiresAt: now + this.ttlMs });
    if (this.store.size > 200) this.evictExpired(now);
    return { value, cached: false };
  }

  private evictExpired(now: number): void {
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }
}
