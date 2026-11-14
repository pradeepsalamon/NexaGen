import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { missingContextError, tenantScopeMode } from "../prisma/tenant-scope.extension";
import { reportTenantGap } from "./tenant-audit";
import { getTenantContext } from "./tenant-context";

/**
 * The context's academy, for a place the tenant-scope extension can't reach:
 * raw SQL, or a per-academy key the caller builds itself (`tenantId_email`, a
 * settings row looked up by `tenantId`). No academy in context: refused under
 * `enforce` (a 400 inside an HTTP request, else a 500); under `audit` logged (as `what`) and Nexa's, the only academy
 * until then.
 */
export function requireTenantId(what: string): string {
  const context = getTenantContext();
  const tenantId = context?.tenantId;
  if (tenantId) return tenantId;
  const scope = !context ? "background" : context.origin === "webhook" ? "webhook" : "request";
  const at = context?.label ?? "background";
  if (tenantScopeMode() === "enforce") {
    throw missingContextError(context, what);
  }
  reportTenantGap(
    { at, detail: { model: what, operation: "query" }, kind: "missing_context", scope },
    `missing_context|${scope}|${at}|${what}`
  );
  return DEFAULT_TENANT_ID;
}

/**
 * The academy a raw query must be limited to (docs/SAAS_MULTI_TENANCY.md §E,
 * "Raw SQL"). Raw SQL never passes through the tenant-scope extension, so every
 * `$queryRaw`/`$executeRaw` on academy-owned tables carries this explicitly.
 */
export function sqlTenantId(): string {
  return requireTenantId("raw-sql");
}

/**
 * The id of an academy's row in a one-row-per-academy settings table (slice 5).
 * Nexa's row predates academies and keeps `"default"`; every other academy's row
 * is keyed by its academy id, so ids never collide. Look rows up by `tenantId`.
 */
export function singletonRowId(tenantId: string): string {
  return tenantId === DEFAULT_TENANT_ID ? "default" : tenantId;
}

/**
 * `"<alias>"."tenantId" = <academy>` for a raw query's driving table (or bare
 * `"tenantId" = …` with no alias). Put it on the table the query is about; a
 * joined child row can't belong to another academy.
 */
export function tenantFilter(alias?: string): Prisma.Sql {
  if (alias !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error(`tenantFilter: bad alias ${alias}`);
  }
  const column = Prisma.raw(alias ? `"${alias}"."tenantId"` : `"tenantId"`);
  return Prisma.sql`${column} = ${sqlTenantId()}`;
}
