import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Where the current academy came from (docs/SAAS_MULTI_TENANCY.md §B, §E):
 * - `host`: a `tenant_domains` row matched the request's host.
 * - `config`: the host is one of this deployment's configured web origins
 *   (`FRONTEND_URL` / `CORS_ORIGIN`), which all belong to Nexa until Phase 5.
 * - `user`: no host matched; `authenticateUser` took the signed-in user's academy.
 * - `job`: a background job entered it with `runInTenant`.
 */
export type TenantContextSource = "config" | "host" | "job" | "user";

export type TenantContextStore = {
  /** Normalised host the academy was resolved from, if any. */
  host: string | null;
  /** `METHOD /path` without the query string, for audit logs. */
  label: string;
  /**
   * `webhook`: a provider callback (LiveKit, payment gateways), which names no
   * academy by design; Phase 3 takes it from the row the event is about.
   */
  origin?: "request" | "webhook";
  role?: string;
  source: TenantContextSource | null;
  tenantId: string | null;
  userId?: string;
};

const storage = new AsyncLocalStorage<TenantContextStore>();

export function getTenantContext(): TenantContextStore | undefined {
  return storage.getStore();
}

/** The current academy, or null when none is known (yet). */
export function currentTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null;
}

export function runWithTenantContext<T>(store: TenantContextStore, fn: () => T): T {
  return storage.run(store, fn);
}

/**
 * Runs background work (a cron row, a queue job) as one academy, so the
 * tenant-scope extension and per-academy settings resolve for it. Phase 3
 * wraps every sweep in this (§E "Asynchronous and realtime paths").
 */
export function runInTenant<T>(tenantId: string, label: string, fn: () => T): T {
  return storage.run({ host: null, label, source: "job", tenantId }, fn);
}
