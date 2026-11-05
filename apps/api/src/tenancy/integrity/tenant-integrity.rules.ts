import {
  TENANT_INTEGRITY_SAMPLE_LIMIT,
  type TenantIntegrityLinkError,
  type TenantIntegrityViolation
} from "@nexa-chess/types";

/**
 * Nightly tenant integrity monitoring (docs/SAAS_MULTI_TENANCY.md "Tenant
 * integrity monitoring"). **Monitoring, not enforcement**: nothing here blocks
 * a write; no foreign key or trigger is added. Application-level isolation
 * (the tenant-scope extension, `authenticateUser`, the two-academy suites)
 * stays the guard; this finds a row that slipped past it.
 *
 * A "link" is a single-column foreign key between two tables that both carry
 * `tenantId` (found from the database catalogue, so a new relation is covered
 * without code). A row whose `tenantId` differs from its parent's is a
 * violation, unless the link is listed below.
 */

/** One foreign key the check walks. Names come from `pg_catalog`, never from a request. */
export type TenantLink = {
  constraint: string;
  table: string;
  column: string;
  parentTable: string;
  parentColumn: string;
  /** The child's primary-key columns, reported as the row id. */
  keyColumns: string[];
};

/**
 * Links where a row may point at a user of another academy **only if that user
 * is a platform operator** (Nexa's SUPER_ADMIN, `isPlatformOperator`): the
 * platform console acting on an academy. Anyone else across academies is still
 * a violation. Adding an entry is a security review, like the raw-SQL list.
 */
export const PLATFORM_OPERATOR_LINKS: readonly { table: string; column: string; why: string }[] = [
  {
    column: "actorUserId",
    table: "tenant_subscription_events",
    why: "An operator creates the academy, changes its plan or suspends it from the console"
  },
  { column: "recordedById", table: "platform_payments", why: "An operator records an academy's offline payment" },
  { column: "staffUserId", table: "platform_support_sessions", why: "An operator's support visit to the academy" }
];

export function isPlatformOperatorLink(link: Pick<TenantLink, "table" | "column" | "parentTable">): boolean {
  return (
    link.parentTable === "users" &&
    PLATFORM_OPERATOR_LINKS.some((entry) => entry.table === link.table && entry.column === link.column)
  );
}

/** Every single-column FK between two `tenantId` tables in the current schema. */
export const DISCOVER_LINKS_SQL = `
SELECT c.conname::text AS "constraint",
       ch.relname::text AS "table",
       ca.attname::text AS "column",
       pr.relname::text AS "parentTable",
       pa.attname::text AS "parentColumn",
       COALESCE((
         SELECT array_agg(a.attname::text ORDER BY k.ord)
         FROM pg_index i
         CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
         WHERE i.indrelid = c.conrelid AND i.indisprimary
       ), ARRAY[]::text[]) AS "keyColumns"
FROM pg_constraint c
JOIN pg_class ch ON ch.oid = c.conrelid
JOIN pg_namespace n ON n.oid = ch.relnamespace AND n.nspname = current_schema()
JOIN pg_class pr ON pr.oid = c.confrelid
JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
WHERE c.contype = 'f'
  AND cardinality(c.conkey) = 1
  AND ca.attname <> 'tenantId'
  AND EXISTS (SELECT 1 FROM pg_attribute t WHERE t.attrelid = c.conrelid AND t.attname = 'tenantId' AND NOT t.attisdropped)
  AND EXISTS (SELECT 1 FROM pg_attribute t WHERE t.attrelid = c.confrelid AND t.attname = 'tenantId' AND NOT t.attisdropped)
ORDER BY ch.relname, ca.attname`;

/** A Postgres identifier, quoted. The names come from the catalogue, but quote anyway. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * `$1` = Nexa's academy id (used only for a platform-operator link). Joins the
 * child to its parent and keeps rows whose academies differ.
 */
function mismatchFrom(link: TenantLink): string {
  const child = quoteIdent(link.table);
  const parent = quoteIdent(link.parentTable);
  const operatorExemption = isPlatformOperatorLink(link)
    ? ` AND NOT (p."role" = 'SUPER_ADMIN' AND p."tenantId" = $1)`
    : "";
  return (
    `FROM ${child} ch JOIN ${parent} p ON p.${quoteIdent(link.parentColumn)} = ch.${quoteIdent(link.column)} ` +
    `WHERE ch."tenantId" IS DISTINCT FROM p."tenantId"${operatorExemption}`
  );
}

/** Up to the sample limit of offending rows: the child's key, both academies and the parent id. */
export function sampleSql(link: TenantLink): string {
  const keys = link.keyColumns.length ? link.keyColumns : [link.column];
  const rowKey = `json_build_object(${keys.map((k) => `'${k.replace(/'/g, "''")}', ch.${quoteIdent(k)}::text`).join(", ")})`;
  return (
    `SELECT ${rowKey} AS "rowKey", ch."tenantId" AS "tenantId", ch.${quoteIdent(link.column)}::text AS "parentId", ` +
    `p."tenantId" AS "parentTenantId" ${mismatchFrom(link)} LIMIT ${TENANT_INTEGRITY_SAMPLE_LIMIT}`
  );
}

export function countSql(link: TenantLink): string {
  return `SELECT count(*)::int AS "count" ${mismatchFrom(link)}`;
}

/** The email's plain summary: one line per relationship, the first example row on each. */
export function summarizeFindings(violations: TenantIntegrityViolation[], errors: TenantIntegrityLinkError[]): string {
  const lines = violations.map((v) => {
    const first = v.samples[0];
    const example = first
      ? ` (e.g. row ${Object.entries(first.rowKey).map(([k, value]) => `${k}=${value}`).join(", ")} in ${first.tenantId ?? "no academy"} points at ${first.parentId} in ${first.parentTenantId ?? "no academy"})`
      : "";
    return `- ${v.table}.${v.column} → ${v.parentTable}: ${v.count} row${v.count === 1 ? "" : "s"}${example}`;
  });
  if (errors.length) {
    lines.push(`- Could not check ${errors.length} relationship${errors.length === 1 ? "" : "s"}: ${errors.map((e) => `${e.table}.${e.column}`).join(", ")}`);
  }
  return lines.join("\n") || "- Nothing found.";
}
