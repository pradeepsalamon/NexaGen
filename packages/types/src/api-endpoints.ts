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
    puzzleLeaderboard: (id: string = ":id") => `/live-class/${id}/puzzle/leaderboard`
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
    policy: "/attendance/policy",
    webhook: "/webhooks/livekit"
  },
  notifications: {
    list: "/notifications",
    markRead: "/notifications/read"
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
