import { Logger } from "@nestjs/common";

/**
 * Phase 2 runs tenant scoping in **audit mode** (docs/SAAS_MULTI_TENANCY.md §D3):
 * a gap is logged, never thrown. Phase 2 is done when a full release shows no
 * `scope: "request"` hits; `background` hits (crons, queues, boot) and `webhook`
 * hits (provider callbacks) are Phase 3's worklist.
 *
 * Each distinct gap is logged on its 1st, 10th, 100th, … occurrence in this
 * process, so a hot path can't flood the log but its volume stays visible.
 */
export type TenantAuditKind =
  /** A query on an academy-owned model ran with no academy in context. */
  | "missing_context"
  /** The signed-in user's academy differs from the one the host resolved to. */
  | "user_mismatch"
  /** The session row's academy differs from its user's. */
  | "session_mismatch";

export type TenantAuditEvent = {
  /** Where it happened: `METHOD /path` for a request, a caller frame otherwise. */
  at: string;
  detail?: Record<string, string | null | undefined>;
  kind: TenantAuditKind;
  scope: "background" | "request" | "webhook";
};

const logger = new Logger("TenantAudit");
const counts = new Map<string, number>();
const MAX_KEYS = 5_000;

function shouldLog(count: number): boolean {
  return /^10*$/.test(String(count));
}

export function reportTenantGap(event: TenantAuditEvent, key: string): void {
  const count = (counts.get(key) ?? 0) + 1;
  if (counts.size < MAX_KEYS || counts.has(key)) counts.set(key, count);
  if (!shouldLog(count)) return;
  logger.warn({ msg: "tenant-audit", count, ...event });
}

/** First stack frame outside node_modules and this folder, for background hits. */
export function callerFrame(): string {
  const lines = (new Error().stack ?? "").split("\n").slice(1);
  const frame = lines.find(
    (line) => !line.includes("node_modules") && !line.includes("/tenancy/") && !line.includes("node:")
  );
  return frame?.trim().replace(/^at /, "") ?? "unknown";
}

export function tenantAuditCountsForTesting(): ReadonlyMap<string, number> {
  return counts;
}

export function resetTenantAuditForTesting(): void {
  counts.clear();
}
