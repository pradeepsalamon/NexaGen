// Nightly tenant integrity monitoring (docs/SAAS_MULTI_TENANCY.md "Tenant
// integrity monitoring"). Monitoring only: it finds a row that points at
// another academy's row; it never blocks a write. Platform console only.

export type TenantIntegrityRunStatus = "OK" | "VIOLATIONS" | "FAILED";
export type TenantIntegrityRunTrigger = "cron" | "manual";

/** At most this many example rows are kept per relationship; `count` is the full number. */
export const TENANT_INTEGRITY_SAMPLE_LIMIT = 20;

export type TenantIntegrityViolationSample = {
  /** The child row's primary key (column → value). */
  rowKey: Record<string, string>;
  /** The academy the child row belongs to. */
  tenantId: string | null;
  /** The parent row the child points at, and the academy it belongs to. */
  parentId: string;
  parentTenantId: string | null;
};

export type TenantIntegrityViolation = {
  table: string;
  column: string;
  parentTable: string;
  count: number;
  samples: TenantIntegrityViolationSample[];
};

export type TenantIntegrityLinkError = { table: string; column: string; message: string };

export type TenantIntegrityRunSummary = {
  id: string;
  status: TenantIntegrityRunStatus;
  trigger: TenantIntegrityRunTrigger;
  linksChecked: number;
  violationCount: number;
  violations: TenantIntegrityViolation[];
  errors: TenantIntegrityLinkError[];
  startedAt: string;
  finishedAt: string | null;
};

export type TenantIntegrityRunsResponse = { runs: TenantIntegrityRunSummary[] };
