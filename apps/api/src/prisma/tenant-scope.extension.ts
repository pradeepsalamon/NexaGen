/**
 * Tenant-scope query extension, **audit mode** (docs/SAAS_MULTI_TENANCY.md §D3, §E).
 *
 * For every model in `TENANT_MODELS`:
 * - with an academy in context, creates and upserts get `tenantId` from it
 *   when the caller didn't set one (nested creates still rely on the column's
 *   'tenant_nexa' default until D4);
 * - with no academy in context, the query runs unchanged and the gap is logged
 *   (`reportTenantGap`), so Phase 2 changes nothing users see.
 *
 * Reads are not filtered yet. Phase 3 switches this to enforce mode: filter
 * every read/update/delete by the context's academy and throw without one,
 * with `asPlatform` as the only bypass.
 */
import { Prisma } from "@prisma/client";
import { callerFrame, reportTenantGap } from "../tenancy/tenant-audit";
import { getTenantContext } from "../tenancy/tenant-context";
import { TENANT_MODELS } from "../tenancy/tenant-models";

type Row = Record<string, unknown>;

function withTenant(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) return data.map((row) => withTenant(row, tenantId));
  if (data && typeof data === "object" && (data as Row).tenantId === undefined) {
    return { ...(data as Row), tenantId };
  }
  return data;
}

/** Exported for the unit spec; the extension below is a thin wrapper. */
export function applyTenantScope(model: string, operation: string, args: unknown): unknown {
  if (!TENANT_MODELS.has(model)) return args;
  const context = getTenantContext();
  const tenantId = context?.tenantId;
  if (!tenantId) {
    const scope = !context ? "background" : context.origin === "webhook" ? "webhook" : "request";
    const at = context?.label ?? callerFrame();
    reportTenantGap(
      { at, detail: { model, operation }, kind: "missing_context", scope },
      `missing_context|${scope}|${at}|${model}|${operation}`
    );
    return args;
  }
  const next = args as Row | undefined;
  if (!next) return args;
  switch (operation) {
    case "create":
    case "createMany":
    case "createManyAndReturn":
      return { ...next, data: withTenant(next.data, tenantId) };
    case "upsert":
      return { ...next, create: withTenant(next.create, tenantId) };
    default:
      return args;
  }
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
