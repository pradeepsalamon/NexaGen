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
    resendVerification: "/auth/resend-verification",
    emailVerificationStatus: "/auth/email-verification",
    mfa: "/auth/mfa",
    mfaSetup: "/auth/mfa/setup",
    mfaEnable: "/auth/mfa/enable",
    mfaDisable: "/auth/mfa/disable",
    mfaVerify: "/auth/mfa/verify"
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
  adminEmail: {
    overview: "/admin/email",
    policy: "/admin/email/verification-policy",
    sent: "/admin/email/sent",
    unverified: "/admin/email/unverified",
    verifyAll: "/admin/email/unverified/verify-all",
    send: (userId: string = ":userId") => `/admin/email/users/${userId}/send`,
    verification: (userId: string = ":userId") => `/admin/email/users/${userId}/verification`,
    verificationLink: (userId: string = ":userId") => `/admin/email/users/${userId}/verification-link`
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
  // Admin "Live now" monitor: every LIVE class + a hidden spectator seat (ADMIN/SUPER_ADMIN).
  adminAi: {
    echo: "/admin/ai/echo",
    status: "/admin/ai/status",
    // Assistant tool registry (docs/KNOWLEDGE_BASE.md §6): list, and dry-run one as yourself.
    tools: "/admin/ai/tools",
    runTool: "/admin/ai/tools/run"
  },
  // Knowledge base: help centre (every signed-in role), coach suggestions, admin authoring.
  knowledge: {
    help: "/knowledge/help",
    helpArticle: (slug: string = ":slug") => `/knowledge/help/articles/${slug}`,
    feedback: (id: string = ":id") => `/knowledge/help/articles/${id}/feedback`,
    suggestions: "/knowledge/suggestions",
    suggestion: (id: string = ":id") => `/knowledge/suggestions/${id}`,
    trends: "/knowledge/trends"
  },
  adminKnowledge: {
    articles: "/admin/knowledge/articles",
    article: (id: string = ":id") => `/admin/knowledge/articles/${id}`,
    draft: (id: string = ":id") => `/admin/knowledge/articles/${id}/draft`,
    settings: (id: string = ":id") => `/admin/knowledge/articles/${id}/settings`,
    publish: (id: string = ":id") => `/admin/knowledge/articles/${id}/publish`,
    unpublish: (id: string = ":id") => `/admin/knowledge/articles/${id}/unpublish`,
    archive: (id: string = ":id") => `/admin/knowledge/articles/${id}/archive`,
    restore: (id: string = ":id") => `/admin/knowledge/articles/${id}/restore`,
    rollback: (id: string = ":id") => `/admin/knowledge/articles/${id}/rollback`,
    reject: (id: string = ":id") => `/admin/knowledge/articles/${id}/reject`,
    diff: (id: string = ":id") => `/admin/knowledge/articles/${id}/diff`,
    submissions: "/admin/knowledge/submissions",
    categories: "/admin/knowledge/categories",
    category: (id: string = ":id") => `/admin/knowledge/categories/${id}`,
    preview: "/admin/knowledge/preview",
    insights: "/admin/knowledge/insights",
    resolveQuery: "/admin/knowledge/insights/resolve",
    export: "/admin/knowledge/export",
    import: "/admin/knowledge/import"
  },
  adminLiveClasses: {
    list: "/admin/live-classes",
    spectate: (id: string = ":id") => `/admin/live-classes/${id}/spectate`
  },
  admin: {
    pendingCoaches: "/admin/coaches/pending",
    updateCoachStatus: (id: string = ":id") => `/admin/coaches/${id}/status`,
    pendingStudents: "/admin/students/pending",
    updateStudentStatus: (id: string = ":id") => `/admin/students/${id}/status`,
    demoClasses: "/admin/demo-classes",
    updateDemoClass: (id: string = ":id") => `/admin/demo-classes/${id}`,
    cancelDemoClass: (id: string = ":id") => `/admin/demo-classes/${id}/cancel`,
    restoreDemoClass: (id: string = ":id") => `/admin/demo-classes/${id}/restore`,
    demoClassDetails: (id: string = ":id") => `/admin/demo-classes/${id}/details`,
    demoClassInvitees: (id: string = ":id") => `/admin/demo-classes/${id}/invitees`,
    removeDemoClassInvitee: (id: string = ":id", registrationId: string = ":registrationId") =>
      `/admin/demo-classes/${id}/invitees/${registrationId}`,
    demoSchedules: "/admin/demo-schedules",
    demoSchedule: (id: string = ":id") => `/admin/demo-schedules/${id}`,
    batchClasses: "/admin/classes",
    batchClassDetails: (id: string = ":id") => `/admin/classes/${id}/details`
  },
  coach: {
    dashboard: "/coach/dashboard",
    batches: "/coach/batches",
    classes: "/coach/classes",
    upcomingClasses: "/coach/classes/upcoming",
    // Every class of the caller's overlapping [from, to) — the schedule's week / month calendar.
    calendarClasses: "/coach/classes/calendar",
    classHistory: "/coach/classes/history",
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
    demoInfo: (id: string = ":id") => `/live-class/demo/${id}`,
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
    // Coach-owner+admin: switch mic and/or camera off for every student (off only).
    moderateAll: (id: string = ":id") => `/live-class/${id}/moderate-all`,
    // Ask one participant to turn their mic / camera back on (a prompt, never a remote unmute).
    requestTrackOn: (id: string = ":id") => `/live-class/${id}/moderate/request-on`,
    kick: (id: string = ":id") => `/live-class/${id}/kick`,
    // In-class puzzle: POST assign / DELETE end / GET current (coach-owner+admin
    // for write, any participant for read).
    puzzle: (id: string = ":id") => `/live-class/${id}/puzzle`,
    // Student starts (or resumes) an in-room attempt — stamps liveClassId.
    puzzleAttempt: (id: string = ":id") => `/live-class/${id}/puzzle/attempt`,
    // Live leaderboard for the active assignment.
    puzzleLeaderboard: (id: string = ":id") => `/live-class/${id}/puzzle/leaderboard`,
    // Coach-owner+admin only: every enrolled student's current board position.
    puzzleBoards: (id: string = ":id") => `/live-class/${id}/puzzle/boards`,
    puzzleFromBoard: (id: string = ":id") => `/live-class/${id}/puzzle/from-board`,
    // Demo guest (no session — `DEMO_GUEST_TOKEN_HEADER`): the active puzzle + its solution, to practise.
    puzzleGuest: (id: string = ":id") => `/live-class/${id}/puzzle/guest`,
    // Coach-owner+admin: manual +/- points for one student on the active puzzle.
    puzzleAdjust: (id: string = ":id") => `/live-class/${id}/puzzle/adjust`,
    // Whole-class standings across every puzzle shared in the class (GET any participant).
    puzzleClassLeaderboard: (id: string = ":id") => `/live-class/${id}/puzzle/class-leaderboard`,
    // Coach-owner+admin: manual +/- points for one student on the class standings.
    puzzleClassLeaderboardAdjust: (id: string = ":id") =>
      `/live-class/${id}/puzzle/class-leaderboard/adjust`,
    // Move poll ("Response"): POST start / PATCH close-reveal / DELETE end (coach-owner+admin), GET current (any participant).
    movePoll: (id: string = ":id") => `/live-class/${id}/move-poll`,
    // Student submits (or changes) their move while the poll is open.
    movePollAnswer: (id: string = ":id") => `/live-class/${id}/move-poll/answer`,
    // Chapters (coach-owner+admin): GET list / POST create, POST import puzzles,
    // PUT the order, PATCH rename-or-save / DELETE one, POST delete-many ("Delete all").
    chapters: (id: string = ":id") => `/live-class/${id}/chapters`,
    chapterBulkDelete: (id: string = ":id") => `/live-class/${id}/chapters/bulk-delete`,
    chapterImport: (id: string = ":id") => `/live-class/${id}/chapters/import`,
    chapterOrder: (id: string = ":id") => `/live-class/${id}/chapters/order`,
    chapter: (id: string = ":id", chapterId: string = ":chapterId") =>
      `/live-class/${id}/chapters/${chapterId}`,
    // Activity queue (coach-owner+admin, works before the class starts): GET the
    // class's queues / POST create; PATCH rename / DELETE a draft or finished one;
    // POST items (append), PUT the item order, DELETE one item — drafts only;
    // POST launch / advance / finish (class must be LIVE for launch); GET progress.
    // POST catalog-items: Lichess catalogue puzzles appended lowest rating first.
    activityQueues: (id: string = ":id") => `/live-class/${id}/activity-queues`,
    activityQueue: (id: string = ":id", queueId: string = ":queueId") =>
      `/live-class/${id}/activity-queues/${queueId}`,
    activityQueueItems: (id: string = ":id", queueId: string = ":queueId") =>
      `/live-class/${id}/activity-queues/${queueId}/items`,
    activityQueueCatalogItems: (id: string = ":id", queueId: string = ":queueId") =>
      `/live-class/${id}/activity-queues/${queueId}/catalog-items`,
    activityQueueItemOrder: (id: string = ":id", queueId: string = ":queueId") =>
      `/live-class/${id}/activity-queues/${queueId}/items/order`,
    activityQueueItem: (id: string = ":id", queueId: string = ":queueId", itemId: string = ":itemId") =>
      `/live-class/${id}/activity-queues/${queueId}/items/${itemId}`,
    activityQueueLaunch: (id: string = ":id", queueId: string = ":queueId") =>
      `/live-class/${id}/activity-queues/${queueId}/launch`,
    activityQueueAdvance: (id: string = ":id", queueId: string = ":queueId") =>
      `/live-class/${id}/activity-queues/${queueId}/advance`,
    activityQueueFinish: (id: string = ":id", queueId: string = ":queueId") =>
      `/live-class/${id}/activity-queues/${queueId}/finish`,
    activityQueueProgress: (id: string = ":id", queueId: string = ":queueId") =>
      `/live-class/${id}/activity-queues/${queueId}/progress`,
    // Any participant: the running queue as a student may see it (progress only).
    activityQueueCurrent: (id: string = ":id") => `/live-class/${id}/activity-queue/current`,
    // An MCQ / Playout running in the class (started only by the activity queue).
    // GET: the caller's own view (any participant).
    activityRun: (id: string = ":id") => `/live-class/${id}/activity-run`,
    // Coach-owner / admin. Monitoring is GET-only: no route lets a coach touch a game.
    activityRunMonitor: (id: string = ":id", runId: string = ":runId") =>
      `/live-class/${id}/activity-run/${runId}/monitor`,
    activityRunGame: (id: string = ":id", runId: string = ":runId", gameId: string = ":gameId") =>
      `/live-class/${id}/activity-run/${runId}/games/${gameId}`,
    activityRunEnd: (id: string = ":id", runId: string = ":runId") => `/live-class/${id}/activity-run/${runId}/end`,
    activityRunReveal: (id: string = ":id", runId: string = ":runId") =>
      `/live-class/${id}/activity-run/${runId}/reveal`,
    // Student only, and only their own.
    mcqAnswers: (id: string = ":id", runId: string = ":runId") => `/live-class/${id}/activity-run/${runId}/mcq/answers`,
    playoutStart: (id: string = ":id", runId: string = ":runId") => `/live-class/${id}/activity-run/${runId}/playout`,
    playoutMove: (id: string = ":id", runId: string = ":runId", gameId: string = ":gameId") =>
      `/live-class/${id}/activity-run/${runId}/playout/${gameId}/move`,
    playoutContinue: (id: string = ":id", runId: string = ":runId", gameId: string = ":gameId") =>
      `/live-class/${id}/activity-run/${runId}/playout/${gameId}/continue`,
    playoutHint: (id: string = ":id", runId: string = ":runId", gameId: string = ":gameId") =>
      `/live-class/${id}/activity-run/${runId}/playout/${gameId}/hint`,
    playoutRetry: (id: string = ":id", runId: string = ":runId", gameId: string = ":gameId") =>
      `/live-class/${id}/activity-run/${runId}/playout/${gameId}/retry`,
    playoutResign: (id: string = ":id", runId: string = ":runId", gameId: string = ":gameId") =>
      `/live-class/${id}/activity-run/${runId}/playout/${gameId}/resign`,
    // Interactives (classroom tools): GET every tool's state (any participant).
    tools: (id: string = ":id") => `/live-class/${id}/tools`,
    // Puzzle Storm / Racer: GET the current round (any participant), POST start
    // and DELETE end (coach-owner/admin), PUT a student's running totals.
    puzzleRush: (id: string = ":id") => `/live-class/${id}/puzzle-rush`,
    puzzleRushProgress: (id: string = ":id") => `/live-class/${id}/puzzle-rush/progress`,
    // PUT one tool's state (coach-owner+admin).
    tool: (id: string = ":id", tool: string = ":tool") => `/live-class/${id}/tools/${tool}`,
    // Simul: POST start / DELETE end (coach-owner+admin), GET current (any participant).
    simul: (id: string = ":id") => `/live-class/${id}/simul`,
    // Coach-owner+admin: add one more student to the running simul.
    simulPlayers: (id: string = ":id") => `/live-class/${id}/simul/games`,
    // Coach or that game's student plays a move.
    simulMove: (id: string = ":id", gameId: string = ":gameId") =>
      `/live-class/${id}/simul/games/${gameId}/move`,
    // Coach-owner+admin: play Stockfish's move on one board.
    simulEngineMove: (id: string = ":id", gameId: string = ":gameId") =>
      `/live-class/${id}/simul/games/${gameId}/engine-move`,
    // Resign / draw offer / accept / decline / (coach) adjudicate.
    simulGameAction: (id: string = ":id", gameId: string = ":gameId") =>
      `/live-class/${id}/simul/games/${gameId}/action`,
    // Student matches: POST start / PATCH pairing mode / DELETE end (coach-owner+admin), GET current (any participant).
    matchRound: (id: string = ":id") => `/live-class/${id}/matches`,
    // Coach-owner+admin: pair more students (auto or by hand) into the running round.
    matchPairs: (id: string = ":id") => `/live-class/${id}/matches/pairs`,
    // Student: challenge a classmate (students-choose rounds).
    matchChallenges: (id: string = ":id") => `/live-class/${id}/matches/challenges`,
    // Accept / decline (opponent) or cancel (challenger) one challenge.
    matchChallenge: (id: string = ":id", challengeId: string = ":challengeId") =>
      `/live-class/${id}/matches/challenges/${challengeId}`,
    // A player of that game plays a move.
    matchMove: (id: string = ":id", gameId: string = ":gameId") =>
      `/live-class/${id}/matches/games/${gameId}/move`,
    // Resign / draw / claim timeout; coach adjudicate / abort.
    matchGameAction: (id: string = ":id", gameId: string = ":gameId") =>
      `/live-class/${id}/matches/games/${gameId}/action`,
    // Waiting room (coach-owner/admin): list of students pending admission.
    waitingRoom: (id: string = ":id") => `/live-class/${id}/waiting-room`,
    // Waiting room (coach-owner/admin): admit or deny one pending student.
    resolveWaitingRoom: (id: string = ":id") => `/live-class/${id}/waiting-room/resolve`,
    // Waiting room (student): (re)request admission after a denial.
    requestWaitingRoom: (id: string = ":id") => `/live-class/${id}/waiting-room/request`,
    // Screen-share request (coach-owner/admin): pending + currently-approved requests.
    boardState: (id: string = ":id") => `/live-class/${id}/board-state`,
    // The egress recording template's read of the saved board. No session: the
    // caller sends its own LiveKit egress token as `Authorization: Bearer`.
    recorderBoardState: (id: string = ":id") => `/live-class/${id}/recorder/board-state`,
    screenShareRequests: (id: string = ":id") => `/live-class/${id}/screen-share-requests`,
    // Screen-share request (student): ask to share while the class-wide policy is DISABLED.
    requestScreenShare: (id: string = ":id") => `/live-class/${id}/screen-share-requests/request`,
    // Screen-share request (coach-owner/admin): approve, deny, or revoke one student's request.
    resolveScreenShareRequest: (id: string = ":id") => `/live-class/${id}/screen-share-requests/resolve`,
    // Screen-share request (student): self-report that sharing has stopped.
    endScreenShare: (id: string = ":id") => `/live-class/${id}/screen-share-requests/end`,
    // Pull a student in (coach-owner/admin): GET batch roster with presence,
    // POST pull one student, POST cancel a pending pull.
    pullRoster: (id: string = ":id") => `/live-class/${id}/pull/roster`,
    pullStudent: (id: string = ":id") => `/live-class/${id}/pull`,
    cancelPull: (id: string = ":id") => `/live-class/${id}/pull/cancel`
  },
  presence: {
    // Any signed-in tab, every ~15s: marks the user online and, for a student,
    // returns their live class + any pending coach pull.
    heartbeat: "/presence/heartbeat"
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
  typography: {
    // Resolved fonts + text size for the caller (user > admin default > system default) — any authed role.
    get: "/typography",
    // Caller's own preference. PUT saves a partial override, DELETE resets it.
    me: "/typography/me",
    // Admin global default (singleton). GET/PUT admin only.
    admin: "/typography/admin",
    // Reset the global default back to Outfit + Nunito Sans — admin only.
    adminReset: "/typography/admin/reset"
  },
  upload: {
    // POST multipart image (avatars, puzzle art); DELETE { url } removes the caller's own.
    image: "/upload/image",
    pgn: "/upload/pgn"
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
    dashboard: "/student/dashboard",
    // One class (details, schedule, coach, own attendance) for an enrolled student.
    classDetail: (id: string = ":id") => `/student/classes/${id}`
  },
  stockfish: {
    analyze: "/stockfish/analyze",
    // Same request; answers as server-sent events (`StockfishStreamEvent`).
    analyzeStream: "/stockfish/analyze/stream"
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
      `/assignments/mine/${id}/attempts/${attemptId}/hint`,
    // PUZZLE_SET (student): start/resume one puzzle of the set — moves, hints and
    // submit then go through the ordinary `puzzles.attempt*` routes.
    puzzleAttempts: (id: string = ":id", puzzleId: string = ":puzzleId") =>
      `/assignments/mine/${id}/puzzles/${puzzleId}/attempts`,
    leaderboard: (id: string = ":id") => `/assignments/mine/${id}/leaderboard`,
    // Due-date reminders (student: own outstanding work; coach/admin: overview)
    reminders: "/assignments/mine-reminders",
    overview: "/assignments/overview"
  },
  // Game Library: every live-class game (shared board, simul, match) + imports.
  games: {
    list: "/games",
    filterOptions: "/games/filter-options",
    import: "/games/import",
    get: (id: string = ":id") => `/games/${id}`,
    saveAnalysis: (id: string = ":id") => `/games/${id}/analysis`,
    delete: (id: string = ":id") => `/games/${id}`,
    // A student's (or coach's) multi-game PGN upload — the student's own games.
    importPgn: "/games/import-pgn"
  },
  // Stockfish game analysis: GET state + report / POST request / DELETE cancel (anyone who can see the game).
  gameAnalysis: {
    forGame: (id: string = ":id") => `/games/${id}/engine-analysis`,
    // Student or their coach: turn a verified missed tactic into a Smart Revision puzzle.
    tacticToRevision: (analysisId: string = ":analysisId", ply: string = ":ply") =>
      `/game-analyses/${analysisId}/tactics/${ply}/revision`
  },
  // Aggregated evidence across analysed games (student: own; coach: own batches' students; admin).
  gameInsights: {
    mine: "/game-insights/me",
    student: (studentId: string = ":studentId") => `/game-insights/students/${studentId}`,
    gamesMine: "/game-insights/me/games",
    games: (studentId: string = ":studentId") => `/game-insights/students/${studentId}/games`
  },
  // A student's linked Lichess / Chess.com accounts (username only; no passwords or tokens).
  gameSources: {
    overview: "/game-sources",
    accounts: "/game-sources/accounts",
    account: (id: string = ":id") => `/game-sources/accounts/${id}`,
    verify: (id: string = ":id") => `/game-sources/accounts/${id}/verify`,
    sync: (id: string = ":id") => `/game-sources/accounts/${id}/sync`,
    student: (studentId: string = ":studentId") => `/game-sources/students/${studentId}`,
    autoSyncPolicy: "/admin/game-sources/auto-sync"
  },
  // Persistent chat outside live classes (batch groups, coach <-> student DMs).
  chat: {
    conversations: "/chat/conversations",
    unread: "/chat/unread",
    contacts: "/chat/contacts",
    startDirect: "/chat/conversations/direct",
    createGroup: "/chat/conversations/groups",
    conversation: (id: string = ":id") => `/chat/conversations/${id}`,
    messages: (id: string = ":id") => `/chat/conversations/${id}/messages`,
    markRead: (id: string = ":id") => `/chat/conversations/${id}/read`,
    members: (id: string = ":id") => `/chat/conversations/${id}/members`
  },
  puzzles: {
    // ── Topics (admin authors; staff + coach read) ──
    topics: "/puzzles/topics",
    /** GET / PATCH; DELETE = the folder, its subfolders and puzzles to Trash (admin). */
    topic: (id: string = ":id") => `/puzzles/topics/${id}`,
    archiveTopic: (id: string = ":id") => `/puzzles/topics/${id}/archive`,
    reassignTopic: (id: string = ":id") => `/puzzles/topics/${id}/reassign`,
    copyTopic: (id: string = ":id") => `/puzzles/topics/${id}/copy`,
    /** PUT approves (Super Admin), DELETE revokes; GET = the folder's homework set. */
    topicHomework: (id: string = ":id") => `/puzzles/topics/${id}/homework`,
    // ── Library (admin: all; coach: GLOBAL + own) ──
    list: "/puzzles",
    create: "/puzzles",
    // Platform default points + leaderboard rules (GET staff, PUT admin).
    scoringSettings: "/puzzles/scoring-settings",
    stats: "/puzzles/stats",
    validate: "/puzzles/validate",
    bulk: "/puzzles/bulk",
    // Field-level bulk edit (folder, difficulty, type, status, tags, title).
    bulkUpdate: "/puzzles/bulk-update",
    import: "/puzzles/import",
    // ── Lichess catalogue (admin + coach; never students) ──
    // Browse rows carry no solution; preview is the only route that does.
    catalog: "/puzzles/catalog",
    catalogPreview: (sourceId: string = ":sourceId") => `/puzzles/catalog/${sourceId}/preview`,
    // Copy into the hidden "Lichess" folder (in-class share). Admin + coach.
    catalogMaterialise: "/puzzles/catalog/materialise",
    // Copy into a curated folder. Admin only.
    catalogAdopt: "/puzzles/catalog/adopt",
    // ── Unified library: puzzles + MCQs + Playouts (admin + coach; never students) ──
    library: "/puzzles/library",
    // MCQ / Playout authoring. POST, PATCH, DELETE, publish, archive: admin only.
    activities: "/puzzles/activities",
    activityImage: "/puzzles/activities/image",
    activityBulk: "/puzzles/activities/bulk",
    activity: (id: string = ":id") => `/puzzles/activities/${id}`,
    activityPublish: (id: string = ":id") => `/puzzles/activities/${id}/publish`,
    activityArchive: (id: string = ":id") => `/puzzles/activities/${id}/archive`,
    activityDuplicate: (id: string = ":id") => `/puzzles/activities/${id}/duplicate`,
    get: (id: string = ":id") => `/puzzles/${id}`,
    update: (id: string = ":id") => `/puzzles/${id}`,
    delete: (id: string = ":id") => `/puzzles/${id}`,
    publish: (id: string = ":id") => `/puzzles/${id}/publish`,
    archive: (id: string = ":id") => `/puzzles/${id}/archive`,
    duplicate: (id: string = ":id") => `/puzzles/${id}/duplicate`,
    // ── Student rated training (Lichess-style; gated per batch) ──
    training: "/puzzles/training",
    trainingNext: "/puzzles/training/next",
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
    // Admin only; a coach asks through ATTENDANCE_CORRECTION.
    correctStudent: (id: string = ":id", studentId: string = ":studentId") =>
      `/attendance/class/${id}/students/${studentId}`,
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
    retryDelivery: (id: string = ":id") => `/messaging/deliveries/${id}/retry`,
    systemMessages: "/messaging/system-messages",
    systemMessage: (key: string = ":key") => `/messaging/system-messages/${key}`,
    testSystemMessage: (key: string = ":key") => `/messaging/system-messages/${key}/test`
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
  },
  leads: {
    create: "/leads",
    tracking: "/leads/tracking"
  },
  adminLeads: {
    list: "/admin/leads",
    metrics: "/admin/leads/metrics",
    get: (id: string = ":id") => `/admin/leads/${id}`,
    updateStatus: (id: string = ":id") => `/admin/leads/${id}/status`,
    notes: (id: string = ":id") => `/admin/leads/${id}/notes`,
    assignDemoClass: (id: string = ":id") => `/admin/leads/${id}/assign-demo-class`,
    delete: (id: string = ":id") => `/admin/leads/${id}`
  },
  feedback: {
    pending: "/feedback/pending",
    submit: "/feedback/submit",
    skip: "/feedback/skip",
    mine: "/feedback/me"
  },
  adminFeedback: {
    forms: "/admin/feedback/forms",
    form: (id: string = ":id") => `/admin/feedback/forms/${id}`,
    responses: "/admin/feedback/responses",
    coachRatings: "/admin/feedback/coach-ratings"
  },
  // Generic admin approvals (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md).
  // Requester side: create, own list, read own, cancel own pending.
  approvals: {
    create: "/approvals",
    mine: "/approvals/mine",
    get: (id: string = ":id") => `/approvals/${id}`,
    cancel: (id: string = ":id") => `/approvals/${id}/cancel`,
    // Pickers for a coach's request form (names only).
    studentOptions: "/approvals/options/students",
    substituteOptions: (classId: string = ":id") => `/approvals/options/substitutes/${classId}`
  },
  // Reviewer side (ADMIN / SUPER_ADMIN).
  adminApprovals: {
    list: "/admin/approvals",
    // Pending items of the other review queues (manual payments, account
    // deletions, coach applications), for the same inbox. Read-only.
    queues: "/admin/approvals/queues",
    get: (id: string = ":id") => `/admin/approvals/${id}`,
    approve: (id: string = ":id") => `/admin/approvals/${id}/approve`,
    reject: (id: string = ":id") => `/admin/approvals/${id}/reject`
  },
  privacy: {
    // The caller's own data as a JSON download.
    dataExport: "/privacy/export",
    // GET the caller's latest request, POST a new one.
    deletionRequest: "/privacy/deletion-request",
    withdrawDeletionRequest: "/privacy/deletion-request/withdraw"
  },
  adminPrivacy: {
    deletionRequests: "/admin/privacy/deletion-requests",
    completeDeletionRequest: (id: string = ":id") => `/admin/privacy/deletion-requests/${id}/complete`,
    rejectDeletionRequest: (id: string = ":id") => `/admin/privacy/deletion-requests/${id}/reject`
  },
  // Data retention windows, super admin only. `category` is a RetentionCategory.
  adminRetention: {
    policies: "/admin/retention/policies",
    policy: (category: string = ":category") => `/admin/retention/policies/${category}`,
    preview: (category: string = ":category") => `/admin/retention/policies/${category}/preview`
  },
  progress: {
    mine: "/progress/me",
    student: (id: string = ":id") => `/progress/students/${id}`,
    // Activity history (paged, filtered) + summary/insights. Student: own only;
    // coach: students in a batch they coach; admin: any student.
    historyMine: "/progress/me/history",
    summaryMine: "/progress/me/summary",
    history: (id: string = ":id") => `/progress/students/${id}/history`,
    summary: (id: string = ":id") => `/progress/students/${id}/summary`
  },
  // Smart Revision (spaced repetition, docs/SMART_REVISION.md). `mine*` are the
  // student's own; `student*` are coach (batch scope) / admin views + recommendations.
  revision: {
    summaryMine: "/revision/me/summary",
    sessionMine: "/revision/me/session",
    next: "/revision/me/next",
    review: "/revision/me/review",
    skip: "/revision/me/skip",
    reportMine: "/revision/me/report",
    student: (id: string = ":id") => `/revision/students/${id}`,
    recommend: (id: string = ":id") => `/revision/students/${id}/recommendations`,
    recommendation: (id: string = ":id", itemId: string = ":itemId") =>
      `/revision/students/${id}/recommendations/${itemId}`
  },
  // SaaS plan of the academy (docs/SAAS_PLANS.md). `current`: any signed-in
  // user (drives web feature gating); `admin`: academy admins, with usage.
  subscription: {
    current: "/subscription",
    admin: "/admin/subscription"
  },
  // Platform staff only (PlatformStaff row), never a tenant role.
  platform: {
    plans: "/platform/plans",
    plan: (id: string = ":id") => `/platform/plans/${id}`,
    tenantSubscription: (tenantId: string = ":tenantId") => `/platform/tenants/${tenantId}/subscription`
  },
  health: {
    // Public, unauthenticated, not rate limited. `live` never touches a
    // dependency; `ready` checks Postgres (required) and Redis (optional).
    live: "/health",
    ready: "/health/ready"
  }
} as const;
