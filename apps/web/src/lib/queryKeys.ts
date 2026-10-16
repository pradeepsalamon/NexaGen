import type { TrashListRequest } from "@nexa-chess/types";

export const queryKeys = {
  auth: {
    // Must match the key SessionBootstrap / AuthLayout use, or invalidating it
    // is a no-op (AUDIT L3).
    session: ["auth", "me"] as const,
    mfa: ["auth", "mfa"] as const,
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
    // Nested under upcomingClasses, so invalidating that key refreshes these too.
    upcomingClassesLimited: (limit: number) => ["coach", "classes", "upcoming", { limit }] as const,
    classHistory: ["coach", "classes", "history"] as const,
    // Under ["coach", "classes"], so every class mutation's invalidation refreshes it.
    calendarClasses: (from: string, to: string) => ["coach", "classes", "calendar", { from, to }] as const,
    classDetail: (id: string) => ["coach", "classes", "detail", id] as const,
    students: ["coach", "students"] as const,
  },
  studentClasses: {
    detail: (id: string) => ["student", "classes", "detail", id] as const,
  },
  admin: {
    base: ["admin"] as const,
    pendingCoaches: ["admin", "pending-coaches"] as const,
    pendingStudents: ["admin", "pending-students"] as const,
  },
  liveMonitor: {
    list: ["live-monitor", "list"] as const,
    spectate: (classId: string) => ["live-monitor", "spectate", classId] as const,
    chat: (classId: string) => ["live-monitor", "chat", classId] as const,
  },
  feedback: {
    all: ["feedback"] as const,
    pending: (params?: Record<string, any>) => ["feedback", "pending", params ?? null] as const,
    forms: ["feedback", "forms"] as const,
    responses: (params?: Record<string, any>) => ["feedback", "responses", params ?? null] as const,
    coachRatings: ["feedback", "coach-ratings"] as const,
    mine: ["feedback", "mine"] as const,
  },
  leads: {
    all: ["leads"] as const,
    list: (params?: Record<string, any>) => ["leads", "list", params ?? null] as const,
    detail: (id: string) => ["leads", "detail", id] as const,
    metrics: ["leads", "metrics"] as const,
    upcomingDemoClasses: ["leads", "upcoming-demo-classes"] as const,
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
    // One key per (class, student): the log dialog must never show another
    // row's cached logs while the right ones load.
    classLogs: (classId: string, studentId: string) =>
      ["attendance", "class-logs", classId, studentId] as const,
    liveReliability: ["attendance", "live-reliability"] as const,
    reliabilityMetrics: (days: number) => ["attendance", "reliability-metrics", days] as const,
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
    mineLeaderboard: (id: string) => ["assignments", "mine", id, "leaderboard"] as const,
  },
  puzzles: {
    all: ["puzzles"] as const,
    list: (params?: Record<string, unknown>) => ["puzzles", "list", params ?? null] as const,
    detail: (id: string) => ["puzzles", "detail", id] as const,
    stats: ["puzzles", "stats"] as const,
    scoringSettings: ["puzzles", "scoring-settings"] as const,
    topics: ["puzzles", "topics"] as const,
    training: ["puzzles", "training"] as const,
    folderHomework: (topicId: string) => ["puzzles", "topics", topicId, "homework"] as const,
    catalog: (params?: Record<string, unknown>) => ["puzzles", "catalog", params ?? null] as const,
    catalogPreview: (sourceId: string) => ["puzzles", "catalog-preview", sourceId] as const,
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
    manualMethods: ["payments", "manual", "methods"] as const,
    manualBatchPlans: (batchId: string) =>
      ["payments", "manual", "batch-plans", batchId] as const,
    manualBatchStudents: (batchId: string) =>
      ["payments", "manual", "batch-students", batchId] as const,
    manualMine: ["payments", "manual", "mine"] as const,
    manualAdminList: (status?: string) =>
      ["payments", "manual", "admin", "list", status ?? null] as const,
    manualAdminMethods: ["payments", "manual", "admin", "methods"] as const,
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
  chessAppearance: {
    resolved: ["chess-appearance", "resolved"] as const,
    catalog: ["chess-appearance", "catalog"] as const,
    admin: ["chess-appearance", "admin"] as const,
  },
  typography: {
    resolved: ["typography", "resolved"] as const,
    admin: ["typography", "admin"] as const,
  },
  presence: {
    heartbeat: ["presence", "heartbeat"] as const,
  },
  livePull: {
    roster: (classId: string) => ["live-pull", "roster", classId] as const,
    search: (classId: string, q: string) => ["live-pull", "roster", classId, q] as const,
  },
  livePuzzle: {
    state: (classId: string) => ["live-puzzle", "state", classId] as const,
    leaderboard: (classId: string) => ["live-puzzle", "leaderboard", classId] as const,
    classLeaderboard: (classId: string) => ["live-puzzle", "class-leaderboard", classId] as const,
    boards: (classId: string) => ["live-puzzle", "boards", classId] as const,
  },
  liveSimul: {
    state: (classId: string) => ["live-simul", "state", classId] as const,
  },
  liveMatch: {
    state: (classId: string) => ["live-match", "state", classId] as const,
  },
  liveMovePoll: {
    state: (classId: string) => ["live-move-poll", "state", classId] as const,
  },
  liveClassTools: {
    state: (classId: string) => ["live-class-tools", "state", classId] as const,
  },
  liveClassChapters: {
    list: (classId: string) => ["live-class-chapters", classId] as const,
  },
  activityQueues: {
    list: (classId: string) => ["activity-queues", classId, "list"] as const,
    progress: (classId: string, queueId: string) => ["activity-queues", classId, "progress", queueId] as const,
    current: (classId: string) => ["activity-queues", classId, "current"] as const,
  },
  puzzleRush: {
    state: (classId: string) => ["puzzle-rush", "state", classId] as const,
  },
  payroll: {
    all: ["payroll"] as const,
    mine: ["payroll", "mine"] as const,
    myPayslips: ["payroll", "my-payslips"] as const,
    record: (id: string) => ["payroll", "record", id] as const,
    adminPeriods: ["payroll", "admin", "periods"] as const,
    adminPeriod: (id: string) => ["payroll", "admin", "period", id] as const,
    adminRecords: (periodId: string) => ["payroll", "admin", "records", periodId] as const,
    adminRecord: (id: string) => ["payroll", "admin", "record", id] as const,
    adminAdjustments: (recordId: string) => ["payroll", "admin", "adjustments", recordId] as const,
    adminAudit: (recordId: string) => ["payroll", "admin", "audit", recordId] as const,
    adminCompensationProfiles: ["payroll", "admin", "compensation-profiles"] as const,
    adminCompensationProfile: (coachId: string) =>
      ["payroll", "admin", "compensation-profile", coachId] as const,
    adminCompensationRates: (coachId: string) =>
      ["payroll", "admin", "compensation-rates", coachId] as const,
    adminRules: ["payroll", "admin", "rules"] as const,
    adminPayouts: (periodId: string) => ["payroll", "admin", "payouts", periodId] as const,
  },
  classRequests: {
    all: ["class-requests"] as const,
    list: (status?: string) => ["class-requests", "list", status ?? "all"] as const,
  },
  revision: {
    all: ["revision"] as const,
    summary: ["revision", "summary"] as const,
    session: ["revision", "session"] as const,
    /** `"me"` for the signed-in student's own report. */
    report: (studentId: string) => ["revision", "report", studentId] as const,
  },
  progress: {
    mine: ["progress", "me"] as const,
    student: (id: string) => ["progress", "student", id] as const,
    summary: (id: string, scope: Record<string, unknown>) => ["progress", "summary", id, scope] as const,
    history: (id: string, query: Record<string, unknown>) => ["progress", "history", id, query] as const,
  },
  games: {
    all: ["games"] as const,
    list: (filters: Record<string, unknown>) => ["games", "list", filters] as const,
    detail: (id: string) => ["games", "detail", id] as const,
    filterOptions: ["games", "filter-options"] as const,
  },
  chat: {
    all: ["chat"] as const,
    conversations: ["chat", "conversations"] as const,
    unread: ["chat", "unread"] as const,
    contacts: ["chat", "contacts"] as const,
    conversation: (id: string) => ["chat", "conversation", id] as const,
    messages: (id: string) => ["chat", "messages", id] as const,
  },
  assignmentReminders: {
    mine: ["assignments", "reminders", "mine"] as const,
    overview: (filters: Record<string, unknown>) => ["assignments", "overview", filters] as const,
  },
} as const;
