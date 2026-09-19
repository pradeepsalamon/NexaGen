export const API_ROUTES = {
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
    profile: "/auth/profile",
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password",
    registerCoach: "/auth/register-coach",
    verifyEmail: "/auth/verify-email",
    resendVerification: "/auth/resend-verification"
  },
  users: {
    list: "/users",
    create: "/users",
    get: (id: string = ":id") => `/users/${id}`,
    update: (id: string = ":id") => `/users/${id}`,
    archive: (id: string = ":id") => `/users/${id}/archive`,
    restore: (id: string = ":id") => `/users/${id}/restore`,
    delete: (id: string = ":id") => `/users/${id}`
  },
  batches: {
    list: "/batches",
    create: "/batches",
    assignableUsers: "/batches/assignable-users",
    get: (id: string = ":id") => `/batches/${id}`,
    update: (id: string = ":id") => `/batches/${id}`,
    archive: (id: string = ":id") => `/batches/${id}/archive`,
    restore: (id: string = ":id") => `/batches/${id}/restore`,
    delete: (id: string = ":id") => `/batches/${id}`
  },
  trash: {
    list: "/admin/trash",
    restoreBulk: "/admin/trash/restore",
    empty: "/admin/trash/empty",
    restoreItem: (entity: string = ":entity", id: string = ":id") => `/admin/trash/${entity}/${id}/restore`,
    deleteItem: (entity: string = ":entity", id: string = ":id") => `/admin/trash/${entity}/${id}`
  },
  admin: {
    pendingCoaches: "/admin/coaches/pending",
    updateCoachStatus: (id: string = ":id") => `/admin/coaches/${id}/status`,
    demoClasses: "/admin/demo-classes",
    updateDemoClass: (id: string = ":id") => `/admin/demo-classes/${id}`,
    cancelDemoClass: (id: string = ":id") => `/admin/demo-classes/${id}/cancel`,
    restoreDemoClass: (id: string = ":id") => `/admin/demo-classes/${id}/restore`,
    demoClassDetails: (id: string = ":id") => `/admin/demo-classes/${id}/details`,
    batchClasses: "/admin/classes",
    batchClassDetails: (id: string = ":id") => `/admin/classes/${id}/details`
  },
  coach: {
    dashboard: "/coach/dashboard",
    batches: "/coach/batches",
    classes: "/coach/classes",
    upcomingClasses: "/coach/classes/upcoming",
    classHistory: "/coach/classes/history",
    createClass: "/coach/classes",
    getClass: (id: string = ":id") => `/coach/classes/${id}`,
    updateClass: (id: string = ":id") => `/coach/classes/${id}`,
    cancelClass: (id: string = ":id") => `/coach/classes/${id}/cancel`,
    classDetails: (id: string = ":id") => `/coach/classes/${id}/details`,
    students: "/coach/students"
  },
  liveClass: {
    start: (id: string = ":id") => `/live-class/${id}/start`,
    token: (id: string = ":id") => `/live-class/${id}/token`,
    end: (id: string = ":id") => `/live-class/${id}/end`,
    get: (id: string = ":id") => `/live-class/${id}`,
    participants: (id: string = ":id") => `/live-class/${id}/participants`,
    chat: (id: string = ":id") => `/live-class/${id}/chat`,
    heartbeat: (id: string = ":id") => `/live-class/${id}/heartbeat`,
    demoJoin: (id: string = ":id") => `/live-class/demo/${id}/join`,
    startRecording: (id: string = ":id") => `/live-class/${id}/recording/start`,
    stopRecording: (id: string = ":id") => `/live-class/${id}/recording/stop`,
    downloadRecording: (id: string = ":id") => `/live-class/${id}/recording/download`,
    streamRecording: (id: string = ":id") => `/live-class/${id}/recording/stream`,
    storageUsage: () => `/live-class/recording/storage/usage`,
    recordingProgress: (id: string = ":id") => `/live-class/${id}/recording/progress`,
    // Mid-class policy change (coach/admin) — re-resolves the snapshot and
    // pushes new LiveKit grants to affected participants.
    liveSettings: (id: string = ":id") => `/live-class/${id}/live-settings`,
    // Force-mute one participant's mic / camera / screen share (coach-owner or admin).
    moderate: (id: string = ":id") => `/live-class/${id}/moderate`,
    // In-class puzzle: POST assign / DELETE end / GET current (coach-owner+admin
    // for write, any participant for read).
    puzzle: (id: string = ":id") => `/live-class/${id}/puzzle`,
    // Student starts (or resumes) an in-room attempt — stamps liveClassId.
    puzzleAttempt: (id: string = ":id") => `/live-class/${id}/puzzle/attempt`,
    // Live leaderboard for the active assignment.
    puzzleLeaderboard: (id: string = ":id") => `/live-class/${id}/puzzle/leaderboard`,
    // Coach-owner+admin only: every enrolled student's current board position.
    puzzleBoards: (id: string = ":id") => `/live-class/${id}/puzzle/boards`,
    // Waiting room (coach-owner/admin): list of students pending admission.
    waitingRoom: (id: string = ":id") => `/live-class/${id}/waiting-room`,
    // Waiting room (coach-owner/admin): admit or deny one pending student.
    resolveWaitingRoom: (id: string = ":id") => `/live-class/${id}/waiting-room/resolve`,
    // Waiting room (student): (re)request admission after a denial.
    requestWaitingRoom: (id: string = ":id") => `/live-class/${id}/waiting-room/request`,
    // Screen-share request (coach-owner/admin): pending + currently-approved requests.
    screenShareRequests: (id: string = ":id") => `/live-class/${id}/screen-share-requests`,
    // Screen-share request (student): ask to share while the class-wide policy is DISABLED.
    requestScreenShare: (id: string = ":id") => `/live-class/${id}/screen-share-requests/request`,
    // Screen-share request (coach-owner/admin): approve, deny, or revoke one student's request.
    resolveScreenShareRequest: (id: string = ":id") => `/live-class/${id}/screen-share-requests/resolve`,
    // Screen-share request (student): self-report that sharing has stopped.
    endScreenShare: (id: string = ":id") => `/live-class/${id}/screen-share-requests/end`
  },
  liveClassSettings: {
    // Layer 1 system defaults (singleton) — GET any authed, PUT admin only.
    policy: "/live-class-settings/policy",
    // Recent LIVE_SETTINGS_CHANGE audit rows — admin only.
    audit: "/live-class-settings/audit",
    // Layer 2 class config — GET coach/admin, PUT owning coach / admin.
    forClass: (id: string = ":id") => `/live-class-settings/class/${id}`,
    // Layer 3 batch default — GET coach in batch / admin, PUT admin / authorised coach.
    forBatch: (id: string = ":id") => `/live-class-settings/batch/${id}`
  },
  chessAppearance: {
    // Resolved config for the caller (user > admin default > system default) — any authed role.
    get: "/chess-appearance",
    // Enabled board themes + piece sets for picker UIs — any authed role.
    catalog: "/chess-appearance/catalog",
    // Caller's own preference. PUT saves a partial override, DELETE resets it.
    me: "/chess-appearance/me",
    // Layer 1 admin global default (singleton). GET any authed, PUT admin only.
    admin: "/chess-appearance/admin",
    // Reset the global default back to Nexa Classic — admin only.
    adminReset: "/chess-appearance/admin/reset"
  },
  liveClassPresets: {
    // Layer 4 presets. List returns own PERSONAL + all ORG/system.
    list: "/live-class-presets",
    create: "/live-class-presets",
    get: (id: string = ":id") => `/live-class-presets/${id}`,
    update: (id: string = ":id") => `/live-class-presets/${id}`,
    delete: (id: string = ":id") => `/live-class-presets/${id}`,
    duplicate: (id: string = ":id") => `/live-class-presets/${id}/duplicate`,
    setDefault: (id: string = ":id") => `/live-class-presets/${id}/default`
  },
  student: {
    dashboard: "/student/dashboard"
  },
  stockfish: {
    analyze: "/stockfish/analyze"
  },
  assignments: {
    // Library (admin: shared items; coach: shared + own)
    library: "/assignments/library",
    create: "/assignments/library",
    get: (id: string = ":id") => `/assignments/library/${id}`,
    update: (id: string = ":id") => `/assignments/library/${id}`,
    delete: (id: string = ":id") => `/assignments/library/${id}`,
    // Deployments to batches (coach)
    deployments: "/assignments/deployments",
    deploy: "/assignments/deployments",
    deployment: (id: string = ":id") => `/assignments/deployments/${id}`,
    undeploy: (id: string = ":id") => `/assignments/deployments/${id}`,
    // Student's own assignments
    mine: "/assignments/mine",
    mineGet: (id: string = ":id") => `/assignments/mine/${id}`,
    updateStatus: (id: string = ":id") => `/assignments/mine/${id}/status`,
    // Attempts for evaluated activities (student)
    attempts: (id: string = ":id") => `/assignments/mine/${id}/attempts`,
    attempt: (id: string = ":id", attemptId: string = ":attemptId") =>
      `/assignments/mine/${id}/attempts/${attemptId}`,
    submitAttempt: (id: string = ":id", attemptId: string = ":attemptId") =>
      `/assignments/mine/${id}/attempts/${attemptId}/submit`,
    engineMove: (id: string = ":id", attemptId: string = ":attemptId") =>
      `/assignments/mine/${id}/attempts/${attemptId}/engine-move`,
    hint: (id: string = ":id", attemptId: string = ":attemptId") =>
      `/assignments/mine/${id}/attempts/${attemptId}/hint`
  },
  puzzles: {
    // ── Topics (admin authors; staff + coach read) ──
    topics: "/puzzles/topics",
    topic: (id: string = ":id") => `/puzzles/topics/${id}`,
    archiveTopic: (id: string = ":id") => `/puzzles/topics/${id}/archive`,
    reassignTopic: (id: string = ":id") => `/puzzles/topics/${id}/reassign`,
    // ── Library (admin: all; coach: GLOBAL + own) ──
    list: "/puzzles",
    create: "/puzzles",
    stats: "/puzzles/stats",
    validate: "/puzzles/validate",
    bulk: "/puzzles/bulk",
    get: (id: string = ":id") => `/puzzles/${id}`,
    update: (id: string = ":id") => `/puzzles/${id}`,
    delete: (id: string = ":id") => `/puzzles/${id}`,
    publish: (id: string = ":id") => `/puzzles/${id}/publish`,
    archive: (id: string = ":id") => `/puzzles/${id}/archive`,
    duplicate: (id: string = ":id") => `/puzzles/${id}/duplicate`,
    // ── Student practice ──
    mine: "/puzzles/mine",
    mineGet: (id: string = ":id") => `/puzzles/mine/${id}`,
    attempts: (id: string = ":id") => `/puzzles/${id}/attempts`,
    attempt: (id: string = ":id", attemptId: string = ":attemptId") =>
      `/puzzles/${id}/attempts/${attemptId}`,
    submitAttempt: (id: string = ":id", attemptId: string = ":attemptId") =>
      `/puzzles/${id}/attempts/${attemptId}/submit`,
    hint: (id: string = ":id", attemptId: string = ":attemptId") =>
      `/puzzles/${id}/attempts/${attemptId}/hint`
  },
  // Curated, ordered playlists of existing Assignment/Puzzle library content.
  // Admin authors; students consume PUBLISHED courses only.
  courses: {
    list: "/courses",
    create: "/courses",
    get: (id: string = ":id") => `/courses/${id}`,
    update: (id: string = ":id") => `/courses/${id}`,
    delete: (id: string = ":id") => `/courses/${id}`,
    publish: (id: string = ":id") => `/courses/${id}/publish`,
    archive: (id: string = ":id") => `/courses/${id}/archive`,
    modules: (id: string = ":id") => `/courses/${id}/modules`,
    module: (id: string = ":id", moduleId: string = ":moduleId") =>
      `/courses/${id}/modules/${moduleId}`,
    reorderModules: (id: string = ":id") => `/courses/${id}/modules/reorder`,
    // ── Student ──
    mine: "/courses/mine",
    mineGet: (id: string = ":id") => `/courses/mine/${id}`,
    completeModule: (id: string = ":id", moduleId: string = ":moduleId") =>
      `/courses/mine/${id}/modules/${moduleId}/complete`
  },
  attendance: {
    student: "/attendance/student",
    studentById: (id: string = ":id") => `/attendance/student/${id}`,
    coach: "/attendance/coach",
    coachById: (id: string = ":id") => `/attendance/coach/${id}`,
    class: (id: string = ":id") => `/attendance/class/${id}`,
    classDetail: (id: string = ":id") => `/attendance/class/${id}/detail`,
    classSummary: (id: string = ":id") => `/attendance/class/${id}/summary`,
    classLive: (id: string = ":id") => `/attendance/class/${id}/live`,
    classLogs: (id: string = ":id", studentId: string = ":studentId") =>
      `/attendance/class/${id}/logs/${studentId}`,
    adminDashboard: "/attendance/admin/dashboard",
    adminCoachReport: "/attendance/admin/coach-report",
    adminCompletedClasses: "/attendance/admin/completed-classes",
    adminExport: "/attendance/admin/export",
    // Admin-only, cross-class: every currently-LIVE session with a
    // reconnecting/offline participant (RELIABILITY_DESIGN.md §4.5).
    adminLiveReliability: "/attendance/admin/live-reliability",
    // Admin-only: webhook-loss / heartbeat-fallback rate over a trailing
    // window (RELIABILITY_DESIGN.md §6, Phase 6). Query param `?days=`.
    adminReliabilityMetrics: "/attendance/admin/reliability-metrics",
    policy: "/attendance/policy",
    webhook: "/webhooks/livekit"
  },
  notifications: {
    list: "/notifications",
    markRead: "/notifications/read"
  },
  // Admin-configured outbound messaging (WhatsApp + in-app). Admin only.
  messaging: {
    rules: "/messaging/rules",
    rule: (event: string = ":event") => `/messaging/rules/${event}`,
    testRule: (event: string = ":event") => `/messaging/rules/${event}/test`,
    deliveries: "/messaging/deliveries",
    retryDelivery: (id: string = ":id") => `/messaging/deliveries/${id}/retry`
  },
  announcements: {
    // GET is admin (full history); POST publishes + fires the ANNOUNCEMENT rule.
    list: "/announcements",
    create: "/announcements",
    delete: (id: string = ":id") => `/announcements/${id}`
  },
  analytics: {
    overview: "/analytics/overview",
    users: "/analytics/users",
    acquisition: "/analytics/acquisition",
    students: "/analytics/students",
    coaches: "/analytics/coaches",
    coachById: (id: string = ":id") => `/analytics/coaches/${id}`,
    classes: "/analytics/classes",
    attendance: "/analytics/attendance",
    batches: "/analytics/batches",
    batchById: (id: string = ":id") => `/analytics/batches/${id}`,
    recordings: "/analytics/recordings",
    storage: "/analytics/storage",
    engagement: "/analytics/engagement",
    operations: "/analytics/operations",
    today: "/analytics/today",
    alerts: "/analytics/alerts",
    usersTable: "/analytics/tables/users",
    coachesTable: "/analytics/tables/coaches",
    batchesTable: "/analytics/tables/batches",
    classesTable: "/analytics/tables/classes",
    recordingsTable: "/analytics/tables/recordings",
    export: (report: string = ":report") => `/analytics/export/${report}`
  },
  // Provider-agnostic payments. The frontend never names a gateway — the
  // PaymentRouter picks one. Webhooks are public (signature-verified), every
  // other route is cookie-authed.
  payments: {
    // ── Catalogue ──
    plans: "/payments/plans",
    // ── Checkout (student) ──
    checkoutConfig: (planId: string = ":planId") =>
      `/payments/checkout/config/${planId}`,
    checkout: "/payments/checkout",
    // Prices a discount code against a plan + method. A preview, not a hold.
    previewDiscount: "/payments/discounts/preview",
    // Advisory client callback. Never grants access on its own.
    verify: (id: string = ":id") => `/payments/${id}/verify`,
    // Safe "Check payment status" — reconciles against the provider.
    status: (id: string = ":id") => `/payments/${id}/status`,
    // Fresh attempt on the SAME order after a failure.
    retry: (id: string = ":id") => `/payments/${id}/retry`,
    // ── Billing history (student) ──
    mine: "/payments/mine",
    invoice: (id: string = ":id") => `/payments/invoices/${id}`,
    invoiceDownload: (id: string = ":id") => `/payments/invoices/${id}/download`,
    mySubscriptions: "/payments/subscriptions/mine",
    cancelSubscription: (id: string = ":id") =>
      `/payments/subscriptions/${id}/cancel`,
    // ── Webhooks (public, signature-verified) ──
    webhookRazorpay: "/payments/webhooks/razorpay",
    webhookCashfree: "/payments/webhooks/cashfree",
    webhookStripe: "/payments/webhooks/stripe",
    // ── Manual / offline payments (admin OR coach) ──
    manual: {
      methods: "/payments/manual/methods",
      batchPlans: (batchId: string = ":batchId") =>
        `/payments/manual/batches/${batchId}/plans`,
      batchStudents: (batchId: string = ":batchId") =>
        `/payments/manual/batches/${batchId}/students`,
      record: "/payments/manual",
      mine: "/payments/manual/mine",
      attachment: (id: string = ":id") => `/payments/manual/${id}/attachment`
    }
  },
  // Invoices and credit notes. Every route is cookie-authed and authorized to
  // the owner; there is deliberately no public or permanently-signed URL for a
  // financial document.
  invoices: {
    mine: "/invoices",
    get: (id: string = ":id") => `/invoices/${id}`,
    // Streams the PDF through the API. Generates on demand if the stored file
    // is missing, so a failed background render is never a dead end.
    pdf: (id: string = ":id") => `/invoices/${id}/pdf`,
    // Printable HTML, for browsers that prefer print-to-PDF.
    html: (id: string = ":id") => `/invoices/${id}/html`,
    audit: (id: string = ":id") => `/invoices/${id}/audit`,
    creditNotes: "/invoices/credit-notes",
    creditNote: (id: string = ":id") => `/invoices/credit-notes/${id}`,
    creditNotePdf: (id: string = ":id") =>
      `/invoices/credit-notes/${id}/pdf`,
    // The buyer's own billing identity, used for the next invoice they receive.
    billingProfile: "/invoices/billing-profile"
  },
  // Admin → Finance → Invoices, and Admin → Settings → Billing & Invoicing.
  adminInvoices: {
    list: "/admin/finance/invoices",
    get: (id: string = ":id") => `/admin/finance/invoices/${id}`,
    pdf: (id: string = ":id") => `/admin/finance/invoices/${id}/pdf`,
    // Re-runs a failed render (§20). Never touches the payment.
    retryPdf: (id: string = ":id") => `/admin/finance/invoices/${id}/retry-pdf`,
    resendEmail: (id: string = ":id") =>
      `/admin/finance/invoices/${id}/resend-email`,
    audit: (id: string = ":id") => `/admin/finance/invoices/${id}/audit`,
    export: "/admin/finance/invoices/export",
    creditNotes: "/admin/finance/credit-notes",
    createCreditNote: "/admin/finance/credit-notes",
    creditNotePdf: (id: string = ":id") =>
      `/admin/finance/credit-notes/${id}/pdf`,
    settings: "/admin/finance/invoice-settings"
  },
  // Admin payment dashboard + configuration.
  adminPayments: {
    overview: "/admin/payments/overview",
    list: "/admin/payments",
    get: (id: string = ":id") => `/admin/payments/${id}`,
    refund: (id: string = ":id") => `/admin/payments/${id}/refund`,
    reconcile: (id: string = ":id") => `/admin/payments/${id}/reconcile`,
    refunds: "/admin/payments/refunds",
    subscriptions: "/admin/payments/subscriptions",
    invoices: "/admin/payments/invoices",
    providerHealth: "/admin/payments/provider-health",
    routing: "/admin/payments/routing",
    plans: "/admin/payments/plans",
    plan: (id: string = ":id") => `/admin/payments/plans/${id}`,
    export: "/admin/payments/export",
    // ── Discounts ──
    discounts: "/admin/payments/discounts",
    discount: (id: string = ":id") => `/admin/payments/discounts/${id}`,
    // ── Per-batch pricing: the plans attached to one batch ──
    batchPricing: (batchId: string = ":batchId") =>
      `/admin/payments/batches/${batchId}/pricing`,
    batchPlan: (batchId: string = ":batchId", planId: string = ":planId") =>
      `/admin/payments/batches/${batchId}/pricing/${planId}`,
    // ── Manual / offline payments ──
    manual: {
      list: "/admin/payments/manual",
      approve: (id: string = ":id") => `/admin/payments/manual/${id}/approve`,
      reject: (id: string = ":id") => `/admin/payments/manual/${id}/reject`,
      methods: "/admin/payments/manual/methods",
      method: (id: string = ":id") => `/admin/payments/manual/methods/${id}`
    }
  },
  // Coach payroll — what the academy owes a coach, computed from teaching
  // activity. Separate from `payments`/`invoices` above (customer billing).
  // Coach-facing: own record/payslips only, read-only.
  payroll: {
    mine: "/payroll/mine",
    record: (id: string = ":id") => `/payroll/records/${id}`,
    payslips: "/payroll/payslips",
    payslip: (id: string = ":id") => `/payroll/payslips/${id}`,
    payslipPdf: (id: string = ":id") => `/payroll/payslips/${id}/pdf`
  },
  // Admin → Finance → Coach Payroll.
  adminPayroll: {
    periods: "/admin/payroll/periods",
    period: (id: string = ":id") => `/admin/payroll/periods/${id}`,
    calculatePeriod: (id: string = ":id") => `/admin/payroll/periods/${id}/calculate`,
    approvePeriod: (id: string = ":id") => `/admin/payroll/periods/${id}/approve`,
    finalizePeriod: (id: string = ":id") => `/admin/payroll/periods/${id}/finalize`,
    markPaidPeriod: (id: string = ":id") => `/admin/payroll/periods/${id}/mark-paid`,
    recalculatePeriod: (id: string = ":id") => `/admin/payroll/periods/${id}/recalculate`,
    cancelPeriod: (id: string = ":id") => `/admin/payroll/periods/${id}/cancel`,
    records: "/admin/payroll/records",
    record: (id: string = ":id") => `/admin/payroll/records/${id}`,
    recalculateRecord: (id: string = ":id") =>
      `/admin/payroll/records/${id}/recalculate`,
    adjustments: (recordId: string = ":recordId") =>
      `/admin/payroll/records/${recordId}/adjustments`,
    adjustment: (id: string = ":id") => `/admin/payroll/adjustments/${id}`,
    reverseAdjustment: (id: string = ":id") =>
      `/admin/payroll/adjustments/${id}/reverse`,
    compensationProfiles: "/admin/payroll/compensation-profiles",
    compensationProfile: (coachId: string = ":coachId") =>
      `/admin/payroll/compensation-profiles/${coachId}`,
    compensationRates: (coachId: string = ":coachId") =>
      `/admin/payroll/compensation-profiles/${coachId}/rates`,
    compensationRate: (id: string = ":id") =>
      `/admin/payroll/compensation-rates/${id}`,
    closeCompensationRate: (id: string = ":id") =>
      `/admin/payroll/compensation-rates/${id}/close`,
    rules: "/admin/payroll/rules",
    rule: (id: string = ":id") => `/admin/payroll/rules/${id}`,
    payslipPdf: (id: string = ":id") => `/admin/payroll/payslips/${id}/pdf`,
    retryPayslipPdf: (id: string = ":id") =>
      `/admin/payroll/payslips/${id}/retry-pdf`,
    payouts: "/admin/payroll/payouts",
    payout: (id: string = ":id") => `/admin/payroll/payouts/${id}`,
    markPayoutPaid: (id: string = ":id") => `/admin/payroll/payouts/${id}/mark-paid`,
    audit: (recordId: string = ":recordId") =>
      `/admin/payroll/records/${recordId}/audit`
  },
  batchSchedules: {
    list: "/batch-schedules",
    create: "/batch-schedules",
    preview: "/batch-schedules/preview",
    calendar: "/batch-schedules/calendar",
    get: (id: string = ":id") => `/batch-schedules/${id}`,
    update: (id: string = ":id") => `/batch-schedules/${id}`,
    deactivate: (id: string = ":id") => `/batch-schedules/${id}`,
    regenerate: (id: string = ":id") => `/batch-schedules/${id}/regenerate`,
    occurrenceAction: (classId: string = ":classId") =>
      `/batch-schedules/occurrences/${classId}`
  }
} as const;
