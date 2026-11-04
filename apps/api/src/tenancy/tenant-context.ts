import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Where the current academy came from (docs/SAAS_MULTI_TENANCY.md §B, §E):
 * - `host`: a `tenant_domains` row matched the request's host.
 * - `config`: the host is one of this deployment's configured web origins
 *   (`FRONTEND_URL` / `CORS_ORIGIN`), which all belong to Nexa until Phase 5.
 * - `user`: no host matched; `authenticateUser` took the signed-in user's academy.
 * - `job`: background work entered it with `runInTenant`.
 * - `platform`: `asPlatform` — deliberately no academy, every academy's rows.
 */
export type TenantContextSource = "config" | "host" | "job" | "platform" | "user";

export type TenantContextStore = {
  /** Normalised host the academy was resolved from, if any. */
  host: string | null;
  /** `METHOD /path` without the query string, or the job label, for audit logs. */
  label: string;
  /**
   * `webhook`: a provider callback (LiveKit, payment gateways), which names no
   * academy by design; Phase 3 takes it from the row the event is about.
   */
  origin?: "request" | "webhook";
  /** Set only by `asPlatform`: the tenant-scope extension leaves queries unscoped. */
  platformReason?: string;
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
 * Runs background work (a cron row, a queue job, a webhook's row) as one
 * academy, so the tenant-scope extension and per-academy settings resolve for
 * it (§E "Asynchronous and realtime paths").
 *
 * `fn` is awaited **inside** the context: Prisma runs a query only when it is
 * awaited, so a query returned unawaited would otherwise run outside it.
 */
export function runInTenant<T>(tenantId: string, label: string, fn: () => Promise<T> | T): Promise<T> {
  return storage.run({ host: null, label, source: "job", tenantId }, async () => await fn());
}

/**
 * The one bypass of academy scoping: queries inside `fn` see every academy's
 * rows. Only for platform-wide work (the Platform section, global sweeps that
 * then `runInTenant` per row). Grep-able by design; `reason` is logged with
 * any audit hit and shows in review. Awaits inside the context, like
 * `runInTenant`.
 */
export function asPlatform<T>(reason: string, fn: () => Promise<T> | T): Promise<T> {
  const parent = storage.getStore();
  return storage.run(
    { host: parent?.host ?? null, label: parent?.label ?? reason, platformReason: reason, source: "platform", tenantId: null },
    async () => await fn()
  );
}
