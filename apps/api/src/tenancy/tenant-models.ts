import { Prisma } from "@prisma/client";

/**
 * Models with no academy (docs/SAAS_MULTI_TENANCY.md §C, class P). Every other
 * model is academy-owned and carries `tenantId`; `tenant-models.spec.ts` fails
 * a model that is in neither group. **New models are academy-owned by default**:
 * making one platform-wide needs an entry here with its reason, reviewed like
 * the raw-SQL list.
 */
export const PLATFORM_MODELS = {
  JobLock: "Cron single-runner locks for the whole process",
  LichessCatalogueRelease: "Shared read-only Lichess catalogue",
  LichessPuzzle: "Shared read-only Lichess catalogue (a built-in content pack)",
  PlatformPlan: "SaaS tiers, the same for every academy",
  PlatformStaff: "Retired source of platform powers (§E); kept until Phase 4",
  ProcessedWebhookEvent: "LiveKit event ids are globally unique",
  Tenant: "The academies themselves",
  TenantDomain: "Host → academy map, read before any academy is known",
  TenantSubscription: "Platform billing state, keyed by tenantId (with FK)",
  TenantSubscriptionEvent: "Platform billing log, keyed by tenantId (with FK)"
} as const satisfies Partial<Record<Prisma.ModelName, string>>;

export type PlatformModel = keyof typeof PLATFORM_MODELS;

export function isPlatformModel(model: string): model is PlatformModel {
  return Object.prototype.hasOwnProperty.call(PLATFORM_MODELS, model);
}

/** Table names (`@@map`) of the academy-owned models, for raw SQL built from a table name. */
export const TENANT_TABLES: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models.filter((model) => !isPlatformModel(model.name)).map((model) => model.dbName ?? model.name)
);

/** Academy-owned models: every Prisma model not in `PLATFORM_MODELS`. */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.values(Prisma.ModelName).filter((model) => !isPlatformModel(model))
);
