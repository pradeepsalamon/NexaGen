import { z } from "zod";

/**
 * SaaS subscription plans: what an academy (tenant) pays NexaChess for, and
 * what it gets for it. Shared by the API (which enforces every feature and
 * limit — `FeatureGateGuard`, `EntitlementService`) and the web app (which
 * hides what the plan doesn't include and shows the upgrade path).
 *
 * Not to be confused with `Plan` / `Subscription` / `Entitlement` in
 * `payments.ts`: those are the academy billing *its students*. See
 * docs/SAAS_PLANS.md and docs/SAAS_MULTI_TENANCY.md §G.
 *
 * Rule: everything in these catalogues is enforced server-side. A capability
 * that isn't enforced yet (custom domain, white-label) is not listed here.
 */

/** Until the host → tenant resolver lands (SAAS_MULTI_TENANCY.md Phase 2), every request is this tenant. */
export const DEFAULT_TENANT_ID = "tenant_nexa";

// ──────────────────────────────────────────────
// Features
// ──────────────────────────────────────────────

export const PLAN_FEATURE_KEYS = [
  "advancedAnalytics",
  "brandIdentity",
  "classRecording",
  "coachFeedback",
  "coachPayroll",
  "courses",
  "customBranding",
  "customDomain",
  "demoClasses",
  "directChat",
  "gameAnalysis",
  "gameLibrary",
  "interactiveClassroom",
  "leadsCrm",
  "messagingAutomation",
  "referralProgram",
  "smartRevision",
  "studentPayments",
  "whiteLabel"
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];

export const planFeatureKeySchema = z.enum(PLAN_FEATURE_KEYS);

export type PlanFeatureCategory = "Teaching" | "Learning" | "Growth" | "Operations";

export type PlanFeatureDefinition = {
  key: PlanFeatureKey;
  label: string;
  description: string;
  category: PlanFeatureCategory;
};

/**
 * Batches, scheduling, live classes, attendance, assignments, the puzzle
 * library, announcements and notifications are the core product: every plan
 * has them, so they are not features here.
 */
export const PLAN_FEATURES: Record<PlanFeatureKey, PlanFeatureDefinition> = {
  advancedAnalytics: {
    category: "Operations",
    description: "Detailed analytics for users, coaches, classes, attendance, recordings and engagement, with exports.",
    key: "advancedAnalytics",
    label: "Advanced analytics"
  },
  brandIdentity: {
    category: "Growth",
    description: "The academy's own name, logo, colours, favicon, login image and email sender name.",
    key: "brandIdentity",
    label: "Logo and colours"
  },
  classRecording: {
    category: "Teaching",
    description: "Record live classes. Recordings already made stay watchable on every plan.",
    key: "classRecording",
    label: "Class recording"
  },
  coachFeedback: {
    category: "Operations",
    description: "Student feedback forms and coach ratings.",
    key: "coachFeedback",
    label: "Coach feedback & ratings"
  },
  coachPayroll: {
    category: "Operations",
    description: "Coach compensation, payroll periods, payouts and payslips.",
    key: "coachPayroll",
    label: "Coach payroll"
  },
  courses: {
    category: "Learning",
    description: "Structured courses with modules and student progress.",
    key: "courses",
    label: "Courses"
  },
  customBranding: {
    category: "Growth",
    description: "Academy-wide chessboard appearance and fonts.",
    key: "customBranding",
    label: "Custom branding"
  },
  customDomain: {
    category: "Growth",
    description: "The academy on its own web address (e.g. learn.example.com) instead of a NexaChess subdomain.",
    key: "customDomain",
    label: "Own domain"
  },
  demoClasses: {
    category: "Growth",
    description: "Demo classes with guest invites and recurring demo schedules.",
    key: "demoClasses",
    label: "Demo classes"
  },
  directChat: {
    category: "Teaching",
    description: "Persistent chat between coaches, students and staff outside live classes.",
    key: "directChat",
    label: "Direct messages"
  },
  gameAnalysis: {
    category: "Learning",
    description: "Engine game analysis, tactics detection, game imports and game insights.",
    key: "gameAnalysis",
    label: "Game analysis & insights"
  },
  gameLibrary: {
    category: "Learning",
    description: "A shared library of recorded and uploaded games.",
    key: "gameLibrary",
    label: "Game library"
  },
  interactiveClassroom: {
    category: "Teaching",
    description: "Simuls, student matches, move polls, puzzle rush, chapters and the activity queue in live classes.",
    key: "interactiveClassroom",
    label: "Interactive classroom"
  },
  leadsCrm: {
    category: "Growth",
    description: "Lead pipeline: track enquiries, notes and demo bookings.",
    key: "leadsCrm",
    label: "Leads CRM"
  },
  messagingAutomation: {
    category: "Operations",
    description: "Automatic email and WhatsApp messages on academy events.",
    key: "messagingAutomation",
    label: "Messaging automation"
  },
  referralProgram: {
    category: "Growth",
    description: "Referral links for students, coaches and sales staff, a tracked pipeline, reward rules and a credits wallet.",
    key: "referralProgram",
    label: "Referral program"
  },
  smartRevision: {
    category: "Learning",
    description: "Spaced-repetition revision of puzzles a student got wrong.",
    key: "smartRevision",
    label: "Smart revision"
  },
  studentPayments: {
    category: "Operations",
    description: "Sell plans to students: online payments, invoices, credit notes and manual payments.",
    key: "studentPayments",
    label: "Student payments & invoices"
  },
  whiteLabel: {
    category: "Growth",
    description: "No NexaChess name anywhere the academy's users see: no \"Powered by\" line, links or wording.",
    key: "whiteLabel",
    label: "White label"
  }
};

// ──────────────────────────────────────────────
// Limits
// ──────────────────────────────────────────────

export const PLAN_LIMIT_KEYS = ["maxBatches", "maxCoaches", "maxConcurrentLiveClasses", "maxStudents"] as const;

export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];

export const planLimitKeySchema = z.enum(PLAN_LIMIT_KEYS);

export type PlanLimitDefinition = {
  key: PlanLimitKey;
  label: string;
  description: string;
};

export const PLAN_LIMITS: Record<PlanLimitKey, PlanLimitDefinition> = {
  maxBatches: {
    description: "Batches that aren't deleted (archived ones count).",
    key: "maxBatches",
    label: "Batches"
  },
  maxCoaches: {
    description: "Active coach accounts. Pending applications don't count until approved.",
    key: "maxCoaches",
    label: "Coaches"
  },
  maxConcurrentLiveClasses: {
    description: "Live classes running at the same time.",
    key: "maxConcurrentLiveClasses",
    label: "Concurrent live classes"
  },
  maxStudents: {
    description: "Active student accounts. Pending sign-ups don't count until approved.",
    key: "maxStudents",
    label: "Students"
  }
};

/** `null` = unlimited. */
export type PlanLimits = Record<PlanLimitKey, number | null>;

const limitValueSchema = z.number().int().min(0).nullable();

export const planLimitsSchema = z.object({
  maxBatches: limitValueSchema,
  maxCoaches: limitValueSchema,
  maxConcurrentLiveClasses: limitValueSchema,
  maxStudents: limitValueSchema
});

/** Per-tenant overrides on top of the plan (negotiated deals, support exceptions). */
export const entitlementOverridesSchema = z.object({
  addFeatures: z.array(planFeatureKeySchema).default([]),
  removeFeatures: z.array(planFeatureKeySchema).default([]),
  limits: planLimitsSchema.partial().default({}),
  /** ContentPack ids a deal adds to, or removes from, the plan's packs (§I). */
  addContentPacks: z.array(z.string().min(1).max(100)).optional(),
  removeContentPacks: z.array(z.string().min(1).max(100)).optional()
});

export type EntitlementOverrides = z.infer<typeof entitlementOverridesSchema>;

// ──────────────────────────────────────────────
// Default plans (seed data — the database is the source once created)
// ──────────────────────────────────────────────

export type PlatformPlanCode = "STARTER" | "GROWTH" | "BUSINESS" | "ENTERPRISE";

export type PlatformPlanSeed = {
  id: string;
  code: PlatformPlanCode;
  name: string;
  description: string;
  sortOrder: number;
  features: PlanFeatureKey[];
  limits: PlanLimits;
  /** Integer minor units (paise), `null` = "contact us". */
  priceMonthlyMinor: number | null;
  priceYearlyMinor: number | null;
  currency: string;
  trialDays: number;
};

const STARTER_FEATURES: PlanFeatureKey[] = ["directChat", "gameLibrary"];
const GROWTH_FEATURES: PlanFeatureKey[] = [
  ...STARTER_FEATURES,
  "classRecording",
  "coachFeedback",
  "courses",
  "brandIdentity",
  "customBranding",
  "demoClasses",
  "interactiveClassroom",
  "leadsCrm",
  "referralProgram",
  "smartRevision",
  "studentPayments"
];
const BUSINESS_FEATURES: PlanFeatureKey[] = [
  ...GROWTH_FEATURES,
  "advancedAnalytics",
  "coachPayroll",
  "customDomain",
  "gameAnalysis",
  "messagingAutomation"
];

export const DEFAULT_PLATFORM_PLANS: PlatformPlanSeed[] = [
  {
    code: "STARTER",
    currency: "INR",
    description: "For a coach or a small academy getting started.",
    features: STARTER_FEATURES,
    id: "plan_starter",
    limits: { maxBatches: 10, maxCoaches: 3, maxConcurrentLiveClasses: 2, maxStudents: 50 },
    name: "Starter",
    priceMonthlyMinor: 249900,
    priceYearlyMinor: 2499000,
    sortOrder: 10,
    trialDays: 14
  },
  {
    code: "GROWTH",
    currency: "INR",
    description: "For growing academies that sell courses and run demo classes.",
    features: GROWTH_FEATURES,
    id: "plan_growth",
    limits: { maxBatches: 50, maxCoaches: 15, maxConcurrentLiveClasses: 5, maxStudents: 250 },
    name: "Growth",
    priceMonthlyMinor: 699900,
    priceYearlyMinor: 6999000,
    sortOrder: 20,
    trialDays: 14
  },
  {
    code: "BUSINESS",
    currency: "INR",
    description: "For established academies: payroll, analytics and automation.",
    features: BUSINESS_FEATURES,
    id: "plan_business",
    limits: { maxBatches: 200, maxCoaches: 50, maxConcurrentLiveClasses: 15, maxStudents: 1000 },
    name: "Business",
    priceMonthlyMinor: 1499900,
    priceYearlyMinor: 14999000,
    sortOrder: 30,
    trialDays: 14
  },
  {
    code: "ENTERPRISE",
    currency: "INR",
    description: "Everything, without limits.",
    features: [...PLAN_FEATURE_KEYS],
    id: "plan_enterprise",
    limits: { maxBatches: null, maxCoaches: null, maxConcurrentLiveClasses: null, maxStudents: null },
    name: "Enterprise",
    priceMonthlyMinor: null,
    priceYearlyMinor: null,
    sortOrder: 40,
    trialDays: 0
  }
];

// ──────────────────────────────────────────────
// Subscription status → access mode
// ──────────────────────────────────────────────

export const TENANT_STATUSES = ["ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export type TenantStatusType = (typeof TENANT_STATUSES)[number];

export const TENANT_SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "GRACE",
  "CANCEL_SCHEDULED",
  "EXPIRED",
  "CANCELLED"
] as const;
export type TenantSubscriptionStatusType = (typeof TENANT_SUBSCRIPTION_STATUSES)[number];

/**
 * FULL: everything the plan includes. READ_ONLY: sign in and view, no changes.
 * LOCKED: only sign-in, the subscription page and the privacy export.
 */
export type TenantAccessMode = "FULL" | "READ_ONLY" | "LOCKED";

export type TenantAccessInput = {
  tenantStatus: TenantStatusType;
  subscription: {
    status: TenantSubscriptionStatusType;
    trialEndsAt: string | Date | null;
    currentPeriodEnd: string | Date | null;
    graceEndsAt: string | Date | null;
  } | null;
};

const isPast = (value: string | Date | null, now: number) =>
  value !== null && new Date(value).getTime() <= now;

/**
 * The one rule for what a tenant may do given its subscription. Derived from
 * the stored dates on every call, so an ended trial locks on time without a
 * cron having to flip a status first.
 */
export function resolveTenantAccessMode(input: TenantAccessInput, now: Date | number = Date.now()): TenantAccessMode {
  if (input.tenantStatus !== "ACTIVE") return "LOCKED";
  const sub = input.subscription;
  if (!sub) return "LOCKED";
  const nowMs = typeof now === "number" ? now : now.getTime();
  switch (sub.status) {
    case "TRIALING":
      return isPast(sub.trialEndsAt, nowMs) ? "LOCKED" : "FULL";
    case "ACTIVE":
    case "PAST_DUE":
      return "FULL";
    case "CANCEL_SCHEDULED":
      return isPast(sub.currentPeriodEnd, nowMs) ? "LOCKED" : "FULL";
    case "GRACE":
      return isPast(sub.graceEndsAt, nowMs) ? "LOCKED" : "READ_ONLY";
    case "EXPIRED":
    case "CANCELLED":
      return "LOCKED";
  }
}

// ──────────────────────────────────────────────
// Effective entitlements
// ──────────────────────────────────────────────

export type ResolvedEntitlements = {
  features: PlanFeatureKey[];
  limits: PlanLimits;
};

/** Keeps only catalogue keys, so a stale key in the database never grants anything. */
export function sanitizePlanFeatures(value: unknown): PlanFeatureKey[] {
  if (!Array.isArray(value)) return [];
  return PLAN_FEATURE_KEYS.filter((key) => value.includes(key));
}

/** A missing or malformed limit is 0 (fail closed), never unlimited. */
export function sanitizePlanLimits(value: unknown): PlanLimits {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const limits = {} as PlanLimits;
  for (const key of PLAN_LIMIT_KEYS) {
    const raw = source[key];
    limits[key] = raw === null ? null : typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
  }
  return limits;
}

/** Plan features/limits with the tenant's overrides applied (remove wins over add). */
export function resolveEntitlements(
  plan: { features: unknown; limits: unknown },
  overrides?: unknown
): ResolvedEntitlements {
  const raw = overrides && typeof overrides === "object" ? (overrides as Record<string, unknown>) : {};
  const features = new Set([...sanitizePlanFeatures(plan.features), ...sanitizePlanFeatures(raw.addFeatures)]);
  for (const key of sanitizePlanFeatures(raw.removeFeatures)) features.delete(key);
  const limits = sanitizePlanLimits(plan.limits);
  const limitOverrides = raw.limits && typeof raw.limits === "object" ? (raw.limits as Record<string, unknown>) : {};
  for (const key of PLAN_LIMIT_KEYS) {
    const value = limitOverrides[key];
    if (value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0)) limits[key] = value;
  }
  return { features: PLAN_FEATURE_KEYS.filter((key) => features.has(key)), limits };
}

/** True when `used + adding` stays within the limit (`null` = unlimited). */
export function isWithinLimit(limit: number | null, used: number, adding = 1) {
  return limit === null || used + adding <= limit;
}

/** The cheapest plan (by sortOrder) that includes `feature`, for "upgrade to …" copy. */
export function cheapestPlanWithFeature<T extends { features: unknown; sortOrder: number }>(
  plans: T[],
  feature: PlanFeatureKey
): T | null {
  return (
    [...plans]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find((plan) => sanitizePlanFeatures(plan.features).includes(feature)) ?? null
  );
}

// ──────────────────────────────────────────────
// API shapes
// ──────────────────────────────────────────────

/** Error body of a 402 from a feature gate or a limit. */
export type PlanRestrictionError = {
  code: "PLAN_FEATURE_REQUIRED" | "PLAN_LIMIT_REACHED" | "SUBSCRIPTION_READ_ONLY" | "SUBSCRIPTION_LOCKED";
  message: string;
  feature?: PlanFeatureKey;
  limit?: PlanLimitKey;
  statusCode: 402;
};

export type PlatformPlanSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  features: PlanFeatureKey[];
  limits: PlanLimits;
  priceMonthlyMinor: number | null;
  priceYearlyMinor: number | null;
  currency: string;
  trialDays: number;
  isPublic: boolean;
  isActive: boolean;
  /** Bumped on every edit (§G); subscriptions keep the version they signed up on. */
  version: number;
  lapse: LapsePolicy;
  /** Content packs every academy on this plan can read (§I "Content packs"). */
  contentPackIds: string[];
};

/** `GET /subscription`: what any signed-in user's academy can use (drives the web's feature gating). */
export type CurrentEntitlementsResponse = {
  plan: { code: string; name: string } | null;
  status: TenantSubscriptionStatusType | null;
  accessMode: TenantAccessMode;
  features: PlanFeatureKey[];
  limits: PlanLimits;
};

export type PlanUsage = Record<PlanLimitKey, number>;

/** `GET /admin/subscription`: the academy admin's view, with usage and the plans to compare. */
export type AdminSubscriptionResponse = CurrentEntitlementsResponse & {
  tenant: { id: string; name: string };
  subscription: {
    status: TenantSubscriptionStatusType;
    trialEndsAt: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    graceEndsAt: string | null;
    overrides: EntitlementOverrides;
  } | null;
  usage: PlanUsage;
  plans: PlatformPlanSummary[];
};

export type PlatformPlansResponse = { plans: PlatformPlanSummary[] };

// ──────────────────────────────────────────────
// Lapse policy, grace allowances, subscription transitions (§G; Phase 4c/4d)
// ──────────────────────────────────────────────

/**
 * What still works while an academy is in GRACE (§G "Lapse policy"). Each is a
 * group of API prefixes whose writes stay open; reads always work in grace and
 * admin growth (new students, coaches, batches) is always blocked.
 * *(builder's call on the exact groups and prefixes)*
 */
export const GRACE_ALLOWANCES = {
  chat: { label: "Chat", prefixes: ["/chat"] },
  fees: { label: "Students paying fees", prefixes: ["/payments", "/invoices", "/billing"] },
  homework: { label: "Homework and puzzle attempts", prefixes: ["/assignments", "/puzzles", "/revision", "/puzzle-training"] },
  liveClasses: { label: "Live classes, joining them, attendance", prefixes: ["/live-class", "/attendance"] }
} as const;

export type GraceAllowance = keyof typeof GRACE_ALLOWANCES;
export const GRACE_ALLOWANCE_KEYS = Object.keys(GRACE_ALLOWANCES) as GraceAllowance[];
export const graceAllowanceSchema = z.enum(GRACE_ALLOWANCE_KEYS as [GraceAllowance, ...GraceAllowance[]]);

export type LapsePolicy = {
  /** Days after a missed payment with full access (banner + email). */
  pastDueDays: number;
  /** Days in grace after that; then locked. */
  graceDays: number;
  graceAllows: GraceAllowance[];
};

export const DEFAULT_LAPSE_POLICY: LapsePolicy = {
  graceAllows: [...GRACE_ALLOWANCE_KEYS],
  graceDays: 14,
  pastDueDays: 7
};

export const lapsePolicySchema = z.object({
  graceAllows: z.array(graceAllowanceSchema),
  graceDays: z.number().int().min(0).max(365),
  pastDueDays: z.number().int().min(0).max(365)
});

/** The plan's lapse policy with an academy's overrides on top. */
export function resolveLapsePolicy(plan: Partial<LapsePolicy> | null | undefined, overrides?: unknown): LapsePolicy {
  const raw = overrides && typeof overrides === "object" ? ((overrides as Record<string, unknown>).lapse ?? {}) : {};
  const merged = { ...DEFAULT_LAPSE_POLICY, ...(plan ?? {}), ...(raw as object) };
  const parsed = lapsePolicySchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_LAPSE_POLICY;
}

/** Whether a write to `path` stays open in grace under `allows`. */
export function isGraceAllowedPath(path: string, allows: readonly GraceAllowance[]): boolean {
  return allows.some((key) =>
    GRACE_ALLOWANCES[key].prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  );
}


export const updatePlatformPlanRequestSchema = z
  .object({
    currency: z.string().trim().length(3).toUpperCase(),
    description: z.string().trim().max(500).nullable(),
    features: z.array(planFeatureKeySchema),
    isActive: z.boolean(),
    isPublic: z.boolean(),
    limits: planLimitsSchema,
    name: z.string().trim().min(1).max(80),
    priceMonthlyMinor: z.number().int().min(0).nullable(),
    priceYearlyMinor: z.number().int().min(0).nullable(),
    sortOrder: z.number().int(),
    trialDays: z.number().int().min(0).max(365),
    lapse: lapsePolicySchema,
    contentPackIds: z.array(z.string().trim().min(1).max(100)).max(50)
  })
  .partial();

export type UpdatePlatformPlanRequest = z.infer<typeof updatePlatformPlanRequestSchema>;

const isoDate = z.string().datetime({ offset: true });

export const updateTenantSubscriptionRequestSchema = z
  .object({
    currentPeriodEnd: isoDate.nullable().optional(),
    currentPeriodStart: isoDate.nullable().optional(),
    graceEndsAt: isoDate.nullable().optional(),
    note: z.string().trim().max(500).optional(),
    overrides: entitlementOverridesSchema.optional(),
    planCode: z.string().trim().min(1).max(40).optional(),
    status: z.enum(TENANT_SUBSCRIPTION_STATUSES).optional(),
    trialEndsAt: isoDate.nullable().optional()
  })
  .refine((body) => Object.keys(body).some((key) => key !== "note"), {
    message: "Nothing to change."
  });

export type UpdateTenantSubscriptionRequest = z.infer<typeof updateTenantSubscriptionRequestSchema>;

export type TenantSubscriptionEventItem = {
  id: string;
  source: "ADMIN" | "SYSTEM" | "WEBHOOK";
  fromStatus: TenantSubscriptionStatusType | null;
  toStatus: TenantSubscriptionStatusType | null;
  fromPlanCode: string | null;
  toPlanCode: string | null;
  actorUserId: string | null;
  note: string | null;
  createdAt: string;
};

export type PlatformPaymentItem = {
  id: string;
  method: "MANUAL" | "RAZORPAY";
  amountMinor: number;
  currency: string;
  reference: string | null;
  periodEnd: string;
  note: string | null;
  createdAt: string;
};

export type PlatformTenantSubscriptionResponse = AdminSubscriptionResponse & {
  events: TenantSubscriptionEventItem[];
  /** Platform-only: the academy's deal and version (never shown to the academy). */
  deal: {
    customPriceMinor: number | null;
    note: string | null;
    planVersion: number | null;
    currentPlanVersion: number | null;
    pendingPlanCode: string | null;
    lapse: LapsePolicy;
  } | null;
  payments: PlatformPaymentItem[];
};

// ──────────────────────────────────────────────
// Platform console: academies (docs/SAAS_MULTI_TENANCY.md §H, §I; Phase 4b)
// ──────────────────────────────────────────────

/** Subdomain label: lowercase letters, digits and single hyphens, not at the ends. */
export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9]))*$/, "Use lowercase letters, digits and hyphens.");

/** Subdomains a new academy can never take. */
export const RESERVED_TENANT_SLUGS: ReadonlySet<string> = new Set([
  "admin", "api", "app", "crm", "dev", "docs", "help", "mail", "platform", "staging", "status", "support", "www"
]);

export const createPlatformTenantRequestSchema = z.object({
  country: z.string().trim().length(2).toUpperCase().default("IN"),
  /** A double submit with the same key returns the same academy. */
  idempotencyKey: z.string().trim().min(8).max(100),
  name: z.string().trim().min(2).max(120),
  planCode: z.string().trim().min(1).max(40),
  slug: tenantSlugSchema,
  superAdmin: z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().max(80).optional()
  }),
  timezone: z.string().trim().min(1).max(64).default("Asia/Kolkata")
});
export type CreatePlatformTenantRequest = z.infer<typeof createPlatformTenantRequestSchema>;

export const updatePlatformTenantRequestSchema = z
  .object({
    country: z.string().trim().length(2).toUpperCase(),
    name: z.string().trim().min(2).max(120),
    timezone: z.string().trim().min(1).max(64)
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to change." });
export type UpdatePlatformTenantRequest = z.infer<typeof updatePlatformTenantRequestSchema>;

/** Suspend / reactivate: the reason goes to the audit log. */
export const platformTenantStatusRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});
export type PlatformTenantStatusRequest = z.infer<typeof platformTenantStatusRequestSchema>;

export const addPlatformTenantDomainRequestSchema = z.object({
  hostname: z.string().trim().toLowerCase().min(3).max(253)
});
export type AddPlatformTenantDomainRequest = z.infer<typeof addPlatformTenantDomainRequestSchema>;

export type PlatformTenantDomainItem = {
  id: string;
  hostname: string;
  kind: "SUBDOMAIN" | "CUSTOM";
  status: "PENDING" | "ACTIVE" | "REMOVED";
  isPrimary: boolean;
  lastCheckedAt: string | null;
  lastCheckResult: string | null;
};

export type PlatformTenantSummary = {
  id: string;
  slug: string;
  name: string;
  status: TenantStatusType;
  timezone: string;
  country: string;
  createdAt: string;
  primaryHost: string | null;
  plan: { code: string; name: string } | null;
  subscriptionStatus: TenantSubscriptionStatusType | null;
  accessMode: TenantAccessMode;
  usage: PlanUsage;
};

export type PlatformTenantsResponse = {
  tenants: PlatformTenantSummary[];
  /** New academies get `<slug>.<rootDomain>` (env `PLATFORM_ROOT_DOMAIN`). */
  rootDomain: string;
};

export type PlatformTenantDetail = PlatformTenantSummary & {
  domains: PlatformTenantDomainItem[];
  limits: PlanLimits;
};

export type PlatformTenantResponse = { tenant: PlatformTenantDetail };

export type PlatformAuditItem = {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  targetTenantId: string | null;
  reason: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type PlatformAuditResponse = { entries: PlatformAuditItem[]; nextCursor: string | null };

/** The §G state machine: every allowed `from → to`. */
export const SUBSCRIPTION_TRANSITIONS: Record<TenantSubscriptionStatusType, readonly TenantSubscriptionStatusType[]> = {
  ACTIVE: ["PAST_DUE", "CANCEL_SCHEDULED"],
  CANCEL_SCHEDULED: ["ACTIVE", "EXPIRED"],
  CANCELLED: ["ACTIVE"],
  EXPIRED: ["ACTIVE"],
  GRACE: ["ACTIVE", "EXPIRED"],
  PAST_DUE: ["ACTIVE", "GRACE"],
  TRIALING: ["ACTIVE", "EXPIRED"]
};

export function isAllowedSubscriptionTransition(
  from: TenantSubscriptionStatusType,
  to: TenantSubscriptionStatusType
): boolean {
  return from === to || SUBSCRIPTION_TRANSITIONS[from].includes(to);
}

// ── Plans in the console: create, duplicate, retire, versions, deals ──

export const createPlatformPlanRequestSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9_]+$/, "Use A–Z, 0–9 and _."),
  contentPackIds: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  currency: z.string().trim().length(3).toUpperCase().default("INR"),
  description: z.string().trim().max(500).nullable().default(null),
  features: z.array(planFeatureKeySchema).default([]),
  isPublic: z.boolean().default(false),
  lapse: lapsePolicySchema.default(DEFAULT_LAPSE_POLICY),
  limits: planLimitsSchema,
  name: z.string().trim().min(1).max(80),
  priceMonthlyMinor: z.number().int().min(0).nullable().default(null),
  priceYearlyMinor: z.number().int().min(0).nullable().default(null),
  sortOrder: z.number().int().default(100),
  trialDays: z.number().int().min(0).max(365).default(0)
});
export type CreatePlatformPlanRequest = z.infer<typeof createPlatformPlanRequestSchema>;

export const duplicatePlatformPlanRequestSchema = z.object({
  code: createPlatformPlanRequestSchema.shape.code,
  name: z.string().trim().min(1).max(80)
});
export type DuplicatePlatformPlanRequest = z.infer<typeof duplicatePlatformPlanRequestSchema>;

/** The academy-specific part of a subscription: a negotiated deal (§G "Custom deals"). */
export const platformDealRequestSchema = z.object({
  customPriceMinor: z.number().int().min(0).nullable(),
  lapse: lapsePolicySchema.partial().nullable(),
  note: z.string().trim().max(1000).nullable(),
  overrides: entitlementOverridesSchema
});
export type PlatformDealRequest = z.infer<typeof platformDealRequestSchema>;

/** Move an academy to another plan, now or when its current period ends. */
export const changeTenantPlanRequestSchema = z.object({
  note: z.string().trim().max(500).optional(),
  planCode: z.string().trim().min(1).max(40),
  when: z.enum(["now", "periodEnd"]).default("now")
});
export type ChangeTenantPlanRequest = z.infer<typeof changeTenantPlanRequestSchema>;

export const transitionTenantSubscriptionRequestSchema = z.object({
  currentPeriodEnd: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().min(3).max(500),
  status: z.enum(TENANT_SUBSCRIPTION_STATUSES)
});
export type TransitionTenantSubscriptionRequest = z.infer<typeof transitionTenantSubscriptionRequestSchema>;

/** A payment the platform received outside a gateway (bank transfer, cheque). */
export const recordPlatformPaymentRequestSchema = z.object({
  amountMinor: z.number().int().min(1),
  /** The paid-up period now ends here; the subscription becomes ACTIVE. */
  currentPeriodEnd: z.string().datetime({ offset: true }),
  note: z.string().trim().min(3).max(500),
  reference: z.string().trim().max(120).optional()
});
export type RecordPlatformPaymentRequest = z.infer<typeof recordPlatformPaymentRequestSchema>;

// ── Support sessions (§I "Support access"; Phase 4e) ──

export const startSupportSessionRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500)
});
export type StartSupportSessionRequest = z.infer<typeof startSupportSessionRequestSchema>;

export type StartSupportSessionResponse = {
  id: string;
  /** One-time link (5 minutes) that opens the academy's own address as its support user. */
  enterUrl: string;
  expiresAt: string;
};

export const enterSupportSessionRequestSchema = z.object({ token: z.string().trim().min(20).max(200) });
export type EnterSupportSessionRequest = z.infer<typeof enterSupportSessionRequestSchema>;

export type PlatformSupportSessionItem = {
  id: string;
  tenantId: string;
  staffName: string | null;
  reason: string;
  createdAt: string;
  enteredAt: string | null;
  expiresAt: string;
  endedAt: string | null;
  isActive: boolean;
  actionCount: number;
};

export type PlatformSupportSessionsResponse = { sessions: PlatformSupportSessionItem[] };

/** On `GET /auth/me` while the browser is a support visit: drives the banner. */
export type SupportVisitInfo = { id: string; staffName: string | null; reason: string; expiresAt: string };

// ── Content packs (§I "Content packs"; Phase 4f) ──

export const contentPackRequestSchema = z.object({
  description: z.string().trim().max(1000).nullable().default(null),
  isPublished: z.boolean().default(false),
  name: z.string().trim().min(2).max(120)
});
export type ContentPackRequest = z.infer<typeof contentPackRequestSchema>;

export const addContentPackItemRequestSchema = z.object({
  kind: z.literal("PUZZLE_FOLDER"),
  /** A Nexa puzzle folder id. */
  sourceId: z.string().trim().min(1).max(100)
});
export type AddContentPackItemRequest = z.infer<typeof addContentPackItemRequestSchema>;

export type ContentPackItemSummary = { id: string; kind: "PUZZLE_FOLDER"; sourceId: string; title: string; puzzleCount: number };

export type ContentPackSummary = {
  id: string;
  name: string;
  description: string | null;
  isPublished: boolean;
  items: ContentPackItemSummary[];
};

export type ContentPacksResponse = { packs: ContentPackSummary[] };

/** A pack folder's puzzles, read-only to the academy. */
export type ContentPackFolderResponse = {
  pack: { id: string; name: string };
  item: ContentPackItemSummary;
  puzzles: Array<{ id: string; title: string; fen: string; difficulty: string; puzzleType: string }>;
};

export type CopyContentPackFolderResponse = { topicId: string; copied: number };

/** The packs an academy can read: the plan's, plus a deal's additions, minus its removals. */
export function resolveContentPackIds(planPackIds: readonly string[], overrides?: unknown): string[] {
  const raw = overrides && typeof overrides === "object" ? (overrides as Record<string, unknown>) : {};
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  const ids = new Set([...planPackIds, ...strings(raw.addContentPacks)]);
  for (const id of strings(raw.removeContentPacks)) ids.delete(id);
  return [...ids].sort();
}
