import type { TrashListRequest } from "@nexa-chess/types";

export const queryKeys = {
  auth: {
    // Must match the key SessionBootstrap / AuthLayout use, or invalidating it
    // is a no-op (AUDIT L3).
    session: ["auth", "me"] as const,
  },
  users: {
    all: ["users"] as const,
    list: (filters?: Record<string, any>) => ["users", "list", filters] as const,
    detail: (id: string) => ["users", "detail", id] as const,
  },
  batches: {
    all: ["batches"] as const,
    list: (filters?: Record<string, any>) => ["batches", "list", filters] as const,
    detail: (id: string) => ["batches", "detail", id] as const,
    assignableUsers: ["batches", "assignable-users"] as const,
  },
  trash: {
    all: ["trash"] as const,
    list: (params: TrashListRequest) => ["trash", "list", params] as const,
  },
  coach: {
    dashboard: ["coach", "dashboard"] as const,
    batches: ["coach", "batches"] as const,
    classes: ["coach", "classes"] as const,
    upcomingClasses: ["coach", "classes", "upcoming"] as const,
    classHistory: ["coach", "classes", "history"] as const,
    classDetail: (id: string) => ["coach", "classes", "detail", id] as const,
    students: ["coach", "students"] as const,
  },
  admin: {
    base: ["admin"] as const,
  },
  messaging: {
    all: ["messaging"] as const,
    rules: ["messaging", "rules"] as const,
    deliveries: (params?: Record<string, unknown>) =>
      ["messaging", "deliveries", params ?? null] as const,
    announcements: ["messaging", "announcements"] as const,
  },
  analytics: {
    all: ["analytics"] as const,
    section: (name: string, params?: Record<string, unknown>) =>
      ["analytics", name, params ?? null] as const,
    table: (name: string, params?: Record<string, unknown>) =>
      ["analytics", "table", name, params ?? null] as const,
  },
  attendance: {
    classSummary: (id: string) => ["attendance", "class-summary", id] as const,
    classLive: (id: string) => ["attendance", "class-live", id] as const,
  },
  assignments: {
    all: ["assignments"] as const,
    library: ["assignments", "library"] as const,
    libraryItem: (id: string) => ["assignments", "library", id] as const,
    deployments: ["assignments", "deployments"] as const,
    deployment: (id: string) => ["assignments", "deployments", id] as const,
    mine: ["assignments", "mine"] as const,
    mineItem: (id: string) => ["assignments", "mine", id] as const,
    mineAttempts: (id: string) => ["assignments", "mine", id, "attempts"] as const,
  },
  puzzles: {
    all: ["puzzles"] as const,
    list: (params?: Record<string, unknown>) => ["puzzles", "list", params ?? null] as const,
    detail: (id: string) => ["puzzles", "detail", id] as const,
    stats: ["puzzles", "stats"] as const,
    topics: ["puzzles", "topics"] as const,
    mine: (params?: Record<string, unknown>) => ["puzzles", "mine", params ?? null] as const,
    mineDetail: (id: string) => ["puzzles", "mine", id] as const,
    attempts: (id: string) => ["puzzles", "attempts", id] as const,
  },
  notifications: {
    all: ["notifications"] as const,
  },
  courses: {
    all: ["courses"] as const,
    list: (params?: Record<string, unknown>) => ["courses", "list", params ?? null] as const,
    detail: (id: string) => ["courses", "detail", id] as const,
    mine: ["courses", "mine"] as const,
    mineDetail: (id: string) => ["courses", "mine", id] as const,
  },
  payments: {
    all: ["payments"] as const,
    plans: ["payments", "plans"] as const,
    checkoutConfig: (planId: string) =>
      ["payments", "checkout-config", planId] as const,
    status: (paymentId: string) => ["payments", "status", paymentId] as const,
    billing: ["payments", "billing"] as const,
    invoice: (id: string) => ["payments", "invoice", id] as const,
    adminOverview: ["payments", "admin", "overview"] as const,
    adminList: (params?: Record<string, unknown>) =>
      ["payments", "admin", "list", params ?? null] as const,
    adminDetail: (id: string) => ["payments", "admin", "detail", id] as const,
    adminRefunds: ["payments", "admin", "refunds"] as const,
    adminSubscriptions: ["payments", "admin", "subscriptions"] as const,
    adminInvoices: ["payments", "admin", "invoices"] as const,
    providerHealth: ["payments", "admin", "provider-health"] as const,
    routing: ["payments", "admin", "routing"] as const,
    discounts: ["payments", "admin", "discounts"] as const,
    batchPricing: (batchId: string) =>
      ["payments", "batch-pricing", batchId] as const,
  },
  invoices: {
    all: ["invoices"] as const,
    mine: ["invoices", "mine"] as const,
    detail: (id: string) => ["invoices", "detail", id] as const,
    audit: (id: string) => ["invoices", "audit", id] as const,
    creditNotes: ["invoices", "credit-notes"] as const,
    creditNote: (id: string) => ["invoices", "credit-note", id] as const,
    billingProfile: ["invoices", "billing-profile"] as const,
    adminList: (params?: Record<string, unknown>) =>
      ["invoices", "admin", "list", params ?? null] as const,
    adminDetail: (id: string) => ["invoices", "admin", "detail", id] as const,
    adminCreditNotes: ["invoices", "admin", "credit-notes"] as const,
    settings: ["invoices", "settings"] as const,
  },
  batchSchedules: {
    all: ["batch-schedules"] as const,
    list: (batchId?: string) => ["batch-schedules", "list", batchId ?? null] as const,
    detail: (id: string) => ["batch-schedules", "detail", id] as const,
    calendar: (params: Record<string, unknown>) =>
      ["batch-schedules", "calendar", params] as const,
  },
  liveClassSettings: {
    policy: ["live-class-settings", "policy"] as const,
    audit: ["live-class-settings", "audit"] as const,
    forClass: (classId: string) => ["live-class-settings", "class", classId] as const,
    forBatch: (batchId: string) => ["live-class-settings", "batch", batchId] as const,
  },
  liveClassPresets: {
    all: ["live-class-presets"] as const,
  },
  livePuzzle: {
    state: (classId: string) => ["live-puzzle", "state", classId] as const,
    leaderboard: (classId: string) => ["live-puzzle", "leaderboard", classId] as const,
  },
} as const;
