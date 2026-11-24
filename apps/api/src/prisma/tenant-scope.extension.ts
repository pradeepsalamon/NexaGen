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
 * Nested writes (`members: { create: [...] }`, `createMany`, `connectOrCreate`,
 * nested `upsert`) are stamped too, walking `data` with the schema's relations
 * (`stampNested`): before §D5 a nested row without `tenantId` silently took
 * Nexa's column default, and after D5 that default raises. Nested reads and
 * `include`d relations still don't pass through here.
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

/**
 * `npm run test:integration:d5` only (docs/SAAS_CUTOVER_RUNBOOK.md C.2): a
 * write made with no context at all is stamped with this academy, as the old
 * `'tenant_nexa'` column default did, so the suite's own fixtures keep working
 * on a contracted database. Reads stay unfiltered. A write inside a request,
 * a `runInTenant` or an `asPlatform` is left alone, so what still fails is the
 * app's. (A job the test calls with no context is filled too: this run doesn't
 * prove jobs set their academy; `tenant-audit` lines in audit mode do.)
 */
let missingContextWriteTenant: string | null = null;
export function setMissingContextWriteTenantForTesting(tenantId: string | null): void {
  missingContextWriteTenant = tenantId;
}
/** Marks the testing fill above: its stamping never reports a gap. */
const QUIET = Object.freeze({ label: "test: legacy default" }) as unknown as TenantContextStore;

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
  if (row.tenantId !== tenantId && context !== QUIET) {
    gap("cross_tenant", context, { contextTenantId: tenantId, model, rowTenantId: String(row.tenantId) });
  }
  return data;
}

/** Relation fields per model → the related model (from the Prisma schema). */
const RELATIONS: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    new Map(model.fields.filter((field) => field.kind === "object").map((field) => [field.name, field.type]))
  ])
);

const each = (value: unknown, fn: (item: Row) => unknown): unknown =>
  Array.isArray(value) ? value.map((item) => fn(item as Row)) : value && typeof value === "object" ? fn(value as Row) : value;

/**
 * Walks a write's `data` and stamps every nested row created for an academy
 * model: `create`, `createMany.data`, `connectOrCreate[].create`,
 * `upsert[].create`, and recurses into nested `update`/`updateMany`/`upsert`
 * data, which may hold creates of their own.
 */
function stampNested(data: unknown, tenantId: string, model: string, context: TenantContextStore): unknown {
  const relations = RELATIONS.get(model);
  if (!relations || !data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((row) => stampNested(row, tenantId, model, context));
  const row = { ...(data as Row) };
  for (const [field, target] of relations) {
    const ops = row[field];
    if (!ops || typeof ops !== "object" || Array.isArray(ops)) continue;
    const tenantTarget = TENANT_MODELS.has(target);
    const created = (value: unknown) =>
      stampNested(tenantTarget ? stamp(value, tenantId, target, context) : value, tenantId, target, context);
    const next = { ...(ops as Row) };
    if (next.create !== undefined) next.create = each(next.create, (item) => created(item));
    if (next.createMany && typeof next.createMany === "object") {
      const many = next.createMany as Row;
      next.createMany = { ...many, data: tenantTarget ? stamp(many.data, tenantId, target, context) : many.data };
    }
    if (next.connectOrCreate !== undefined) {
      next.connectOrCreate = each(next.connectOrCreate, (item) => ({ ...item, create: created(item.create) }));
    }
    if (next.upsert !== undefined) {
      next.upsert = each(next.upsert, (item) => ({
        ...item,
        create: created(item.create),
        update: stampNested(item.update, tenantId, target, context)
      }));
    }
    for (const key of ["update", "updateMany"] as const) {
      if (next[key] === undefined) continue;
      next[key] = each(next[key], (item) =>
        // A to-many nested update is { where, data }; a to-one update is the data itself.
        "data" in item && "where" in item
          ? { ...item, data: stampNested(item.data, tenantId, target, context) }
          : stampNested(item, tenantId, target, context)
      );
    }
    row[field] = next;
  }
  return row;
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
    if (!missingContextWriteTenant || !args || context) return args;
    // Nested rows follow their parent's academy when the fixture names one.
    const own = (args as Row).data ?? (args as Row).create;
    const fill = own && !Array.isArray(own) && typeof (own as Row).tenantId === "string" ? String((own as Row).tenantId) : missingContextWriteTenant;
    return stampWrite({ ...(args as Row) }, operation, fill, model, QUIET);
  }
  const next = { ...((args ?? {}) as Row) };
  if (WHERE_OPERATIONS.has(operation)) next.where = narrow(next.where, tenantId, model, context);
  return stampWrite(next, operation, tenantId, model, context);
}

function stampWrite(next: Row, operation: string, tenantId: string, model: string, context: TenantContextStore): Row {
  switch (operation) {
    case "create":
      next = { ...next, data: stampNested(stamp(next.data, tenantId, model, context), tenantId, model, context) };
      break;
    case "createMany":
    case "createManyAndReturn":
      next = { ...next, data: stamp(next.data, tenantId, model, context) };
      break;
    case "upsert":
      next = {
        ...next,
        create: stampNested(stamp(next.create, tenantId, model, context), tenantId, model, context),
        update: stampNested(next.update, tenantId, model, context)
      };
      break;
    case "update":
    case "updateMany":
      next = { ...next, data: stampNested(next.data, tenantId, model, context) };
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
