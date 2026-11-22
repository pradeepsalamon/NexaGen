import { Prisma } from "@prisma/client";
import { TENANT_TABLES } from "../tenancy/tenant-models";

/**
 * What the academy export and the purge need to know about the schema
 * (docs/ACADEMY_CLOSURE.md). Table and column names come from the Prisma
 * schema and `pg_catalog`, never from a request, and are always quoted.
 */

/**
 * Financial and tax records kept when an academy's data is deleted, because
 * the law requires them (GST invoices, payments, refunds, payroll and TDS,
 * cash payouts). Everything they point at stays too (the purge only deletes a
 * row nothing points at), and the people they name are anonymised.
 */
export const RETAINED_MODELS = [
  "CoachPayrollRecord",
  "CreditNote",
  "Invoice",
  "InvoiceAuditLog",
  "ManualPaymentRecord",
  "Order",
  "Payment",
  "PayrollAdjustment",
  "Payslip",
  "Refund",
  "ReferralWithdrawal"
] as const satisfies readonly Prisma.ModelName[];

function tableOf(model: string): string {
  const found = Prisma.dmmf.datamodel.models.find((entry) => entry.name === model);
  if (!found) throw new Error(`Unknown model ${model}`);
  return found.dbName ?? found.name;
}

export const RETAINED_TABLES: ReadonlySet<string> = new Set(RETAINED_MODELS.map(tableOf));

/** Academy tables the purge deletes from: every academy-owned table except the retained ones. */
export const PURGEABLE_TABLES: readonly string[] = [...TENANT_TABLES].filter((table) => !RETAINED_TABLES.has(table)).sort();

/**
 * Columns never written to an export: password hashes, tokens, keys, MFA and
 * encrypted secrets (CLAUDE.md "secrets never leave an export"). Matched on the
 * column name, so a new secret column named like one of these is covered.
 */
const SECRET_COLUMN = /(password|secret|token|hash|encrypt|cipher|otp|recovery|apikey|privatekey|webhookkey|signature|mfa)/i;

export function isSecretColumn(column: string): boolean {
  return SECRET_COLUMN.test(column);
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Every foreign key in the schema (single- or multi-column), with the action on delete. */
export type ForeignKey = {
  constraint: string;
  table: string;
  columns: string[];
  parentTable: string;
  parentColumns: string[];
  /** Every column of the key may be NULL. */
  nullable: boolean;
};

export const DISCOVER_FOREIGN_KEYS_SQL = `
SELECT c.conname::text AS "constraint",
       ch.relname::text AS "table",
       pr.relname::text AS "parentTable",
       (SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS "columns",
       (SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS "parentColumns",
       (SELECT bool_and(NOT a.attnotnull)
          FROM unnest(c.conkey) AS k(attnum)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS "nullable"
FROM pg_constraint c
JOIN pg_class ch ON ch.oid = c.conrelid
JOIN pg_namespace n ON n.oid = ch.relnamespace AND n.nspname = current_schema()
JOIN pg_class pr ON pr.oid = c.confrelid
WHERE c.contype = 'f'
ORDER BY ch.relname, c.conname`;

/** Columns of every table, for the export's redaction and key choice. */
export const DISCOVER_COLUMNS_SQL = `
SELECT table_name::text AS "table", column_name::text AS "column"
FROM information_schema.columns
WHERE table_schema = current_schema()
ORDER BY table_name, ordinal_position`;

export type ColumnRow = { table: string; column: string };

/**
 * `DELETE` of one table's rows of the academy that no row anywhere points at.
 * Rows still referenced (by a kept financial record, or by a row a later pass
 * deletes) stay; the purge repeats until a pass deletes nothing. Because a row
 * is only deleted once nothing references it, no `ON DELETE CASCADE` ever fires
 * into a kept table.
 */
export function deleteUnreferencedSql(table: string, incoming: ForeignKey[]): string {
  const guards = incoming.map((fk, index) => {
    const alias = `r${index}`;
    const match = fk.columns
      .map((column, at) => `${alias}.${quoteIdent(column)} = p.${quoteIdent(fk.parentColumns[at])}`)
      .join(" AND ");
    // A row pointing at itself doesn't keep itself alive.
    const self = fk.table === table ? ` AND ${alias}.ctid <> p.ctid` : "";
    return `NOT EXISTS (SELECT 1 FROM ${quoteIdent(fk.table)} ${alias} WHERE ${match}${self})`;
  });
  return [`DELETE FROM ${quoteIdent(table)} p WHERE p."tenantId" = $1`, ...guards].join("\n  AND ");
}

/** Clears one nullable reference of the academy's rows, so cycles and self-links can't keep rows alive. */
export function clearReferenceSql(fk: ForeignKey): string {
  const set = fk.columns.map((column) => `${quoteIdent(column)} = NULL`).join(", ");
  const notNull = fk.columns.map((column) => `${quoteIdent(column)} IS NOT NULL`).join(" OR ");
  return `UPDATE ${quoteIdent(fk.table)} SET ${set} WHERE "tenantId" = $1 AND (${notNull})`;
}

/** Rows of another academy pointing at this academy's rows through `fk` (both tables carry tenantId). */
export function crossAcademySql(fk: ForeignKey): string {
  const match = fk.columns.map((column, at) => `c.${quoteIdent(column)} = p.${quoteIdent(fk.parentColumns[at])}`).join(" AND ");
  return `SELECT count(*)::int AS count FROM ${quoteIdent(fk.table)} c JOIN ${quoteIdent(fk.parentTable)} p ON ${match}
WHERE p."tenantId" = $1 AND c."tenantId" <> $1`;
}

/**
 * Personal columns of a `users` row kept because a financial record points at
 * it. Every `User` field is either here or in `KEPT_USER_FIELDS`
 * (`academy-data.catalogue.spec.ts` fails a new field in neither).
 */
export const ANONYMISED_USER_FIELDS = [
  "acquisitionDetail",
  "avatarUrl",
  "email",
  "emailUnsubscribeToken",
  "extraRoles",
  "firstName",
  "isDeleted",
  "deletedAt",
  "landingReferrer",
  "lastName",
  "password",
  "phoneNumber",
  "status",
  "username",
  "utmCampaign",
  "utmContent",
  "utmMedium",
  "utmSource",
  "utmTerm"
] as const;

/** Not personal (or already cleared as a reference), so left as they are. */
export const KEPT_USER_FIELDS = [
  "acquisitionSource",
  "createdAt",
  "createdById",
  "deleteGroupId",
  "deletedById",
  "emailOptOutCategories",
  "emailVerifiedAt",
  "failedLoginAttempts",
  "id",
  "isEmailVerified",
  "isPlatformSupport",
  "lastActiveAt",
  "lastLoginAt",
  "lastSeenAt",
  "loginLockedUntil",
  "notificationEmailOptOutAt",
  "role",
  "tenantId",
  "termsAcceptedAt",
  "termsVersion",
  "timezone",
  "updatedAt"
] as const;

/** `$2` = now as an ISO string (timestamp WITHOUT time zone, CLAUDE.md §3.4). */
// Not a credential: this SQL blanks "username" and sets an unusable password.
// nosemgrep: ajinabraham.njsscan.generic.hardcoded_secrets.node_username
export const ANONYMISE_USERS_SQL = `
UPDATE "users" SET
  "acquisitionDetail" = NULL,
  "avatarUrl" = NULL,
  "email" = 'deleted-' || "id" || '@deleted.invalid',
  "emailUnsubscribeToken" = NULL,
  "extraRoles" = '{}',
  "firstName" = 'Deleted',
  "isDeleted" = true,
  "deletedAt" = COALESCE("deletedAt", $2::timestamp),
  "landingReferrer" = NULL,
  "lastName" = 'user',
  "password" = '!purged',
  "phoneNumber" = NULL,
  "status" = 'DELETED',
  "username" = NULL,
  "utmCampaign" = NULL,
  "utmContent" = NULL,
  "utmMedium" = NULL,
  "utmSource" = NULL,
  "utmTerm" = NULL
WHERE "tenantId" = $1 AND "email" NOT LIKE 'deleted-%@deleted.invalid'`;
