import { Prisma } from "@prisma/client";

/**
 * Models with no academy (docs/SAAS_MULTI_TENANCY.md §C, class P). Every other
 * model is academy-owned and carries `tenantId`; `tenant-models.spec.ts` fails
 * a model that is in neither group. **New models are academy-owned by default**:
 * making one platform-wide needs an entry here with its reason, reviewed like
 * the raw-SQL list.
 */
export const PLATFORM_MODELS = {
  ContentPack: "Nexa content the owner publishes to academies (§I), platform-wide",
  ContentPackItem: "An item of a content pack (points at a Nexa folder)",
  JobLock: "Cron single-runner locks for the whole process",
  LichessCatalogueRelease: "Shared read-only Lichess catalogue",
  LichessPuzzle: "Shared read-only Lichess catalogue (a built-in content pack)",
  PlatformAuditLog: "Platform-console audit log (§I), across academies",
  PlatformCheckout: "An academy paying the platform (§G), keyed by tenantId (with FK)",
  PlatformInvoice: "The owner's GST invoices to academies (§G), keyed by tenantId (with FK)",
  PlatformInvoiceCounter: "The owner's invoice number series, one per financial year",
  PlatformPayment: "What academies paid the platform (§G), keyed by tenantId (with FK)",
  PlatformPlan: "SaaS tiers, the same for every academy",
  PlatformPlanVersion: "Frozen plan versions (§G)",
  PlatformSellerSettings: "The owner's company details on platform invoices (singleton)",
  PlatformStaff: "Retired: platform powers are Nexa's SUPER_ADMINs (§E); table kept, unused",
  PlatformSupportSession: "Support visits by Nexa staff (§I), keyed by tenantId (with FK)",
  PlatformWebhookEvent: "Webhooks from the owner's gateway account (§G), across academies",
  ProcessedWebhookEvent: "LiveKit event ids are globally unique",
  Tenant: "The academies themselves",
  TenantDomain: "Host → academy map, read before any academy is known",
  TenantIntegrityRun: "Nightly cross-academy integrity check results, across academies by design",
  TenantSubscription: "Platform billing state, keyed by tenantId (with FK)",
  TenantSubscriptionEvent: "Platform billing log, keyed by tenantId (with FK)",
  TenantUsage: "Nightly usage counts per academy for the console (§G), keyed by tenantId (with FK)",
  TenantUsageDay: "Daily usage history per academy for the console, keyed by tenantId (with FK)"
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
