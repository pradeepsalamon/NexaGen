/**
 * Tenant-scope query extension (docs/SAAS_MULTI_TENANCY.md §D3–D4, §E).
 *
 * For every model in `TENANT_MODELS`, with an academy in context:
 * - reads, updates, deletes, counts and upserts get `tenantId` added to `where`
 *   (Prisma accepts extra fields beside the unique key of `findUnique`/`update`);
 * - creates, createMany rows and upsert creates get `tenantId` when unset;
 * - an explicit `tenantId` naming another academy is a cross-academy access:
 *   refused in `enforce` mode, logged in `audit` mode.
 *
 * With no academy in context the query is refused (`enforce`) or runs
 * unscoped and is logged (`audit`, the default until Phase 3 is complete).
 * `asPlatform(reason, fn)` is the only bypass.
 *
 * Known Prisma limit: nested writes and `include`d relations don't pass
 * through here; the NOT NULL column and composite FKs (D4) cover them.
 */
import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import { Prisma } from "@prisma/client";
import { reportTenantGap, type TenantAuditEvent } from "../tenancy/tenant-audit";
import { getTenantContext, type TenantContextStore } from "../tenancy/tenant-context";
import { TENANT_MODELS } from "../tenancy/tenant-models";

type Row = Record<string, unknown>;
export type TenantScopeMode = "audit" | "enforce";

let modeOverride: TenantScopeMode | null = null;
let cachedMode: TenantScopeMode | null = null;

export function tenantScopeMode(): TenantScopeMode {
  if (modeOverride) return modeOverride;
  cachedMode ??= getApiEnv().TENANT_SCOPE_MODE;
  return cachedMode;
}

export function setTenantScopeModeForTesting(mode: TenantScopeMode | null): void {
  modeOverride = mode;
}

/** Operations whose `where` is narrowed to the context's academy. */
const WHERE_OPERATIONS = new Set([
  "aggregate",
  "count",
  "delete",
  "deleteMany",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert"
]);

/** Thrown in enforce mode; a 500, because it is always a code bug, never the caller's. */
export class TenantScopeViolation extends InternalServerErrorException {
  constructor(detail: string) {
    super(`Tenant scope violation: ${detail}`);
  }
}

/**
 * Enforce mode, an HTTP request whose academy is still unknown when it queries:
 * no academy host, Origin or Referer, and no signed-in user (curl, scripts,
 * uptime checks). That's the caller's to fix, so a 400 rather than a 500. A
 * missing academy in a background job or a webhook stays a 500 (a code bug).
 */
export class AcademyNotResolved extends BadRequestException {
  constructor() {
    super(
      "This request doesn't say which academy it is for. Call the API from the academy's own web address (the browser sends its Origin), or sign in first."
    );
  }
}

/** The enforce-mode refusal for an academy-scoped query with no academy in context. */
export function missingContextError(context: TenantContextStore | undefined, detail: string): Error {
  return scopeOf(context) === "request"
    ? new AcademyNotResolved()
    : new TenantScopeViolation(`missing_context at ${context?.label ?? "background"} (${detail})`);
}

function scopeOf(context: TenantContextStore | undefined): TenantAuditEvent["scope"] {
  if (!context) return "background";
  return context.origin === "webhook" ? "webhook" : "request";
}

function gap(
  kind: TenantAuditEvent["kind"],
  context: TenantContextStore | undefined,
  detail: Record<string, string | null | undefined>
): void {
  const scope = scopeOf(context);
  const at = context?.label ?? "background";
  if (tenantScopeMode() === "enforce") {
    if (kind === "missing_context") throw missingContextError(context, Object.values(detail).join(" "));
    throw new TenantScopeViolation(`${kind} at ${at} (${Object.values(detail).join(" ")})`);
  }
  reportTenantGap({ at, detail, kind, scope }, `${kind}|${scope}|${at}|${Object.values(detail).join("|")}`);
}

function stamp(data: unknown, tenantId: string, model: string, context: TenantContextStore): unknown {
  if (Array.isArray(data)) return data.map((row) => stamp(row, tenantId, model, context));
  if (!data || typeof data !== "object") return data;
  const row = data as Row;
  if (row.tenantId === undefined) return { ...row, tenantId };
  if (row.tenantId !== tenantId) {
    gap("cross_tenant", context, { contextTenantId: tenantId, model, rowTenantId: String(row.tenantId) });
  }
  return data;
}

function narrow(where: unknown, tenantId: string, model: string, context: TenantContextStore): Row {
  const current = (where ?? {}) as Row;
  if (current.tenantId === undefined) return { ...current, tenantId };
  if (typeof current.tenantId === "string" && current.tenantId !== tenantId) {
    gap("cross_tenant", context, { contextTenantId: tenantId, model, rowTenantId: current.tenantId });
  }
  return current;
}

/** Exported for the unit spec; the extension below is a thin wrapper. */
export function applyTenantScope(model: string, operation: string, args: unknown): unknown {
  if (!TENANT_MODELS.has(model)) return args;
  const context = getTenantContext();
  if (context?.platformReason) return args;
  const tenantId = context?.tenantId;
  if (!tenantId) {
    gap("missing_context", context, { model, operation });
    return args;
  }
  let next = { ...((args ?? {}) as Row) };
  if (WHERE_OPERATIONS.has(operation)) next.where = narrow(next.where, tenantId, model, context);
  switch (operation) {
    case "create":
    case "createMany":
    case "createManyAndReturn":
      next = { ...next, data: stamp(next.data, tenantId, model, context) };
      break;
    case "upsert":
      next = { ...next, create: stamp(next.create, tenantId, model, context) };
      break;
    default:
      break;
  }
  return next;
}

export const tenantScopeExtension = Prisma.defineExtension({
  name: "tenantScope",
  query: {
    $allModels: {
      $allOperations({ args, model, operation, query }) {
        return query(applyTenantScope(model, operation, args) as typeof args);
      }
    }
  }
});
