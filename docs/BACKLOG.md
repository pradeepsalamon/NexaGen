# Backlog — known gaps

**Agents: read this file (especially § "Root causes") before implementing any
new feature, and update the relevant entry in the same change.** CLAUDE.md § 3.0
points here.

The 2026-08-29 codebase audit (all Critical/High/Medium/Low findings remediated;
`AUDIT.md` removed once complete) left these non-finding, feature-sized gaps.
None is a correctness bug; each is net-new work.

## Root causes — read this before picking up a gap

Patterns observed while remediating this backlog (2026-08-29). Future agents:
expect the *cause*, not just the symptom.

- **One-sided "speculative" features.** Several backend endpoints + `packages/types`
  shapes + service auth were built with no frontend caller ever added
  (`attendance.studentById`/`coachById` — since wired; `attendance.classLive`;
  `batches.get`; `upload/pgn`). Cause: API and types were landed as a unit and the
  UI half was deferred and forgotten. When you touch one of these, grep
  `API_ROUTES.<name>` across `apps/web` first — the route, request/response type,
  and service authorization already exist; you are almost always only adding the
  client `*Api.ts` + hook + a component, not new contract.
- **Orphaned package/app code from the `.ai/` autonomous manager.** The
  `.ai/` task runner (see `.ai/manager/`, `.ai/tasks/`) merged tasks
  NEXA-0001/0015/0034 that added helpers to `packages/utils` and a `getDevStatus`
  method to `AdminService`. A later "make apps/ identical to dev" sync commit
  (`5de4407`) reverted the `apps/` side but not `packages/`, leaving
  `@nexa-chess/utils` as an importer-less shell (since deleted). Cause:
  partially-reverted autonomous output. If you find code with no consumer and an
  `NEXA-####` commit, check whether its counterpart was reverted before "fixing"
  it — deletion is often correct.
- **God components grew at page/feature boundaries.** `ProfileForm`,
  `MeetingVideoGrid`, `MeetingChat`, `DemoClassesClient`, and the
  `completed-classes/[id]` page each accreted every sub-view inline because the
  first version was small and no split happened as features were added. Cause: no
  size budget enforced. When adding to a feature component over ~300 lines,
  extract the new piece into a sibling folder rather than appending.

## Runtime open question — LiveKit webhooks

**Wired 2026-08-30.** livekit-server config is now passed inline as
`LIVEKIT_CONFIG` in `docker-compose.yml` (the old `livekit.yaml` file and the
ineffective `LIVEKIT_WEBHOOK_*` env vars are gone). Compose interpolates
`${LIVEKIT_API_KEY}` into the `webhook.api_key`, so the block references a real
key in `LIVEKIT_KEYS`:

```yaml
webhook:
  api_key: ${LIVEKIT_API_KEY}
  urls:
    - http://api:3001/webhooks/livekit
```

**Verify after deploy** — check API logs for `LiveKit webhook: event=…` during a
real class. Until this was wired, no leave/disconnect events were recorded,
coach/board durations were always 0, `room_finished` never fired, and the
`TOKEN_REQUEST` join in `getToken` was the only thing creating attendance rows.

## Feature gaps

| Item | Notes |
|---|---|
| **Waiting room / lobby** | Deferred sub-feature of pre-class settings. The `waitingRoom` enum exists in `LiveClassSettings` (`@nexa-chess/types`) but v1 only allows `DISABLED`; the "coach hasn't joined" polling gate in `useLiveClass.ts` / `getToken` still stands. An app-level admit flow is the eventual implementation. |
| **Screen-share request → coach approval** | Deferred. v1 pre-class settings expose screen-share as allowed/disallowed per role only; the request/approve handshake is not built. |
| **P0 classroom reliability (heartbeat/presence, reconnect grace period, cross-class admin reliability view) — Phase 3/6 done (2026-09-05)** | Design doc at `docs/RELIABILITY_DESIGN.md` (2026-09-04 audit). Phases 1-2 landed the heartbeat backbone and `getLiveClassMonitoring` presence (see design doc §2 for details). Phase 3 landed the frontend half: `ConnectionStateManager` (`apps/web/src/features/live-class/providers/ConnectionStateManager.tsx`) now actually calls `POST /live-class/:id/heartbeat` every 15s while `Connected` — Phase 2's `RECONNECTING`/`OFFLINE` presence states will start appearing in `LiveClassMonitor` now that a client is finally sending pings — and exposes one `presenceState`/`reconnectEpoch` consumed by `useMeetingTimer`, `MeetingStatus`'s `ConnectionBadge`/`NetworkStatusIcon`, and `ChatProvider` (which now re-fetches `getChatHistory` on a Reconnecting→Connected transition, closing the chat-recovery gap with no backend change). `ClassroomSessionManager` (`ClassroomSessionManager.tsx`) relocated the `getTabClientId`/`joinedSession` call sites out of `useLiveClass.ts`/`page.tsx`/`MeetingRoom.tsx` into one context, and adds a `BroadcastChannel`-based duplicate-tab warning toast (product-layer only; the transport-layer identity collision was already handled). The chessboard's `useBoardSyncEngine` (`apps/web/src/features/chessboard/hooks/useBoardSync.ts`) now also re-dispatches `REQUEST_SYNC` on the same Reconnecting→Connected transition, confirming and closing §2.6's open question — implemented locally in the hook (not via the manager) so it also covers the coach's standalone board pop-out window (`/live-class/[roomId]/board`), which has no `ConnectionStateManager`. Still missing (Phases 4-6): a dedicated multi-tab-attendance test, a cross-class admin reliability view, and a coach-hour reconciliation audit against pre-heartbeat historical data. See the design doc's §6 phased plan before picking up Phase 4. |

## Resolved (2026-09-14)

- **Course / CourseModule authoring.** `Course`/`CourseModule` were a near-empty
  schema stub (`CourseModule` had only a `title` — no order/content/status) with
  no API module and no seed data; `ContinueLearning.tsx` on the student
  dashboard linked to `/student/courses` and `/student/courses/:id`, both 404.
  Built a `course` API module (`API_ROUTES.courses.*`, admin-only authoring —
  no coach/visibility scoping, unlike `Puzzle`): a `CourseModule` **references
  existing library content** (an `Assignment` or a `Puzzle` via a nullable-FK +
  `contentType` discriminator, `onDelete: Restrict` so a hard delete of in-use
  content is blocked, not silently orphaned) rather than authoring anything new.
  Lifecycle `DRAFT` → `PUBLISHED` (blocked with zero modules) → `ARCHIVED`, plus
  a separate soft delete of `Course`/`CourseModule` through the Trash module.
  Completion is an explicit `StudentModuleProgress` row per (student, module) —
  not derived from `StudentAssignment` (which requires a batch deployment via
  `AssignmentBatch` a course-attached assignment never has) — with a
  self-healing auto-complete for puzzle modules solved outside the course UI
  (detected from `PuzzleAttempt.status === SOLVED`). Web: `features/courses/*`,
  admin `/admin/courses` (+ `new` / `[id]`, reorder via up/down controls, an
  `AttachModuleModal` content picker modeled on `PuzzleAssignModal`), student
  `/student/courses` (+ `[id]`, puzzle modules deep-link to the real solver,
  assignment modules render read-only via `PgnBoardViewer`). Fixed the two
  previously-404ing dashboard links; `student.service.ts`'s dashboard mapping
  now surfaces the next incomplete module instead of a static description.
  Migration `20260914081307_course_module_authoring` (additive). Surfaced and
  fixed a latent gap while testing the new `Restrict` FK: `Assignment.remove`
  and the Trash permanent-delete paths (`permanentDelete`, `bulkPermanentDelete`,
  the retention cleanup cron) previously let a Postgres RESTRICT violation
  bubble up as an unhandled 500 — Prisma surfaces a DB-enforced RESTRICT as an
  *unknown* request error, not its own `P2003`, so `error.code` checks alone
  miss it. New shared `apps/api/src/prisma/prisma-errors.ts` (`isForeignKeyRestrictError`)
  turns it into a clear 400 everywhere, and the cron's chunked hard-delete now
  falls back to one-row-at-a-time on a blocked chunk instead of aborting up to
  500 unrelated rows.

## Resolved (2026-09-06)

- **Puzzle Library.** NexaChess had no puzzle system. Added a standalone,
  reusable puzzle library: `PuzzleTopic` / `Puzzle` (soft-deletable, wired into
  the Trash module) + `PuzzleAttempt` models; a `puzzle` API module
  (`API_ROUTES.puzzles.*`, token-string auth) covering admin-only topic CRUD +
  reassign, role-scoped puzzle CRUD (admin ⇒ GLOBAL, coach ⇒ PRIVATE — coaches
  can never publish GLOBAL and cannot edit admin puzzles), publish/archive
  toggles, duplicate, bulk actions, stats, `POST /puzzles/validate`, and the
  student practice endpoints (`/puzzles/mine*`, `/puzzles/:id/attempts*`).
  Server-side move evaluation **reuses `AssignmentEvaluationService`**
  (`normalizeSolution` / `evaluateSolveLine` / `solveLineFeedback`) — now
  exported from `AssignmentModule` — so there is one SOLVE_LINE engine. Web:
  `features/puzzles/*`, routes under `/admin/puzzles`, `/coach/puzzles`,
  `/student/puzzles` (+ `new` / `[id]` / `[id]/edit`), a reusable
  `PuzzleSolver` built on the existing `PracticeBoard` + `PositionEditor` +
  `SolutionEditor`. Seeded 8 topics + 8 puzzles + a `coach2@nexa.test` account
  for cross-coach visibility testing. Migration
  `20260906150110_puzzle_library` (all additive; partial unique indexes on
  `puzzle_topics.name`/`slug`).

- **Live-class puzzle assignment + leaderboard.** Built on top of the puzzle
  library: `LiveClassPuzzleAssignment` (references `puzzleId`, not
  trash-registered, partial unique index `WHERE status = 'ACTIVE'`), a
  `LiveClassPuzzleService` / controller in `PuzzleModule` (now imports
  `LiveClassModule`), three routes (`API_ROUTES.liveClass.puzzle` /
  `.puzzleAttempt` / `.puzzleLeaderboard`). `startAttempt` is the only new
  attempt route — save/submit/hint reuse the puzzle endpoints and now enforce
  `assertLiveAssignmentOpen` (coach-ended or timer + 15s grace). Web: `PuzzleBridge`
  + a "Puzzle" meeting sidebar panel (`MeetingPuzzlePanel`, `PuzzleAssignModal`,
  `InRoomPuzzleSolver`); the standalone `usePuzzleAttempt` hook was extracted
  from `StudentPuzzleSolveClient` and is shared. Lifecycle on
  `LIVE_CLASS_PUZZLE_TOPIC`, leaderboard polled. Timed mode + coach
  "hide leaderboard" toggle included. Migration
  `20260906155518_live_class_puzzle_assignment`. See CLAUDE.md §3.7.

## Resolved (2026-09-03)

- **Live-class pre-class settings, permissions & presets.** Live classes had no
  pre-class configuration — every class was hard-coded (all students
  `canPublish`, board `COACH_ONLY`, no auto-join, no presets). Now four
  inheriting layers (`LiveClassPolicy` → `Batch` → `CoachClass` →
  `LiveClassPreset`) resolved by a shared engine in `@nexa-chess/types`, enforced
  at the LiveKit token layer (`deriveLiveKitGrants`) and mid-class
  (`PUT /live-class/:id/live-settings` → `updateParticipant`/`mutePublishedTrack`
  + `SETTINGS_UPDATE` data packet). Config surfaces: class start page, coach
  `/coach/presets`, admin `/admin/live-class` (platform defaults + org presets +
  change history), batch "Class Settings" tab. Student pre-join previews the
  policy and honours `autoJoin`. Audit via `TrashAuditLog`
  `action: "LIVE_SETTINGS_CHANGE"`. Waiting room + screen-share
  request/approve handshake remain deferred (see Feature gaps). See
  CLAUDE.md §3.7.

## Resolved (2026-08-31)

- **Admin analytics dashboard.** The `/admin` landing page was a placeholder with
  hardcoded metric cards. Replaced with a full analytics system: `analytics` API
  module (21 admin-only endpoints + CSV export under `/analytics/*`),
  `features/analytics` on web (recharts, KPI cards, shareable URL date-range
  state), an `AdminSidebar` + gated `admin/layout.tsx` shell, and grouped admin
  nav in `navItems.ts` (kills the old 4-place-edit problem — `Header.tsx`
  `pageTitles`, the hardcoded chip row, and `adminNavItems` were all
  hand-maintained). Sections: executive overview, user growth, acquisition,
  students, coaches, classes, attendance, batches, recordings & storage,
  engagement, operations + alerts; drill-down sub-pages under
  `/admin/analytics/*` with paginated tables and `coaches/:id` / `batches/:id`
  detail. Migration `20260831050015_analytics_foundations` (all additive):
  `AnalyticsEvent` + `StorageSnapshot` models, `User.acquisitionSource`
  (enum, backfilled from the legacy `StudentProfile.referralSource`) + UTM
  columns, `LiveSession` recording size/duration/status columns, and analytics
  indexes. New: global `ActivityTrackingInterceptor`, `AnalyticsScheduler` daily
  storage snapshot, in-process analytics cache.

- **Acquisition tracking beyond the 4-value student enum.** `registerRequestSchema`
  / `registerCoachRequestSchema` now take `acquisitionSource` (12 normalized
  slugs) + optional `acquisitionDetail` + UTM fields; `features/auth`
  `AcquisitionSourceSelect` replaces the old dropdown on both register forms, and
  `lib/acquisition.ts` captures first-touch UTM params / external referrer into
  `localStorage` (mounted via `<AcquisitionCapture>` in `AppProviders`). Coaches
  now answer the question too. Legacy `StudentProfile.referralSource` is kept
  for back-compat.

- **No user-activity signal.** Added `User.lastActiveAt` (throttled by
  `ActivityTrackingInterceptor`, ≤1 write / 10 min / user) + an `analytics_events`
  table written fire-and-forget by `AnalyticsEventService` on login, student
  class-join, assignment submit, and recording watch. Powers real DAU/WAU/MAU +
  new-vs-returning in the engagement section (history accrues from deploy).

## Resolved (2026-08-30)

- **Board usage always 0 + reports showed scheduled, not actual, timing.**
  `finalizeClassAttendance` recomputed the coach's `totalDuration` from the
  session logs but never touched `boardDuration`, so a board tab still open at
  class end (its `BOARD_LEAVE` never arrives, or lands after finalize) was never
  counted — `recordBoardLeaveEvent`'s increment only fired on a clean close.
  Finalize now recomputes `boardDuration` authoritatively from the `BOARD_JOIN`
  logs (idempotent, like `totalDuration`). Separately, the student Attendance
  History row measured "time present / **scheduled** length" and stamped the
  **scheduled** start time; `getStudentAttendance` history now also returns
  `actualStart` / `actualEnd` / `classActualDuration`, and the student + coach
  history tables, the admin completed-classes list, and the class-detail header
  render `actualStart ?? scheduled` and divide by the actual run length.

- **Live class monitoring screen.** `GET /attendance/class/:id/live`
  (`getLiveClassMonitoring`) had no frontend. Wired up: `LiveClassMonitor` +
  `LiveClassMonitorDialog` (`features/attendance/components/`,
  `useLiveClassMonitoring` polls every 10s while `isLive`). Shows online / left /
  not-joined counts, elapsed time, and a per-student roster (connection state,
  join time, last seen, reconnect count). Rendered on `/classes/[id]` for
  coach/admin when the class is live, and behind a "Monitor Live" action on LIVE
  rows in the admin Batch Classes table. No API/schema change.

- **Assignments are now a full learning system, not just PGN replay.** Added an
  `activityType` (`REPLAY` | `SOLVE_LINE` | `PLAY_VS_ENGINE` | `FREE_ANALYSIS`) to
  `Assignment` plus interactive-activity config columns (all additive, `REPLAY`
  default — every existing row and deployment is untouched). New
  `StudentAssignmentAttempt` model + `bestScore/bestAccuracy/attemptCount` on
  `StudentAssignment`. Server-authoritative `AssignmentEvaluationService` +
  `AssignmentAttemptService` with the attempt-lifecycle endpoints under
  `/assignments/mine/:id/attempts`. Frontend: reusable `PracticeBoard`,
  `SolutionEditor`, activity-aware `AssignmentFormDialog` and
  `StudentAssignmentDetailClient`, result/review views, coach score columns and
  admin aggregate performance. Migration
  `20260830152004_add_assignment_activities_and_attempts`. See README §Features.
  Known limits: `FREE_ANALYSIS` completion is manual-submit only (no move-count
  target).

  - **PLAY_VS_ENGINE accuracy shipped.** `AssignmentEvaluationService.engineGameAccuracy`
    runs per-move Stockfish analysis on the student's moves (win%-before vs
    win%-after, Lichess per-move accuracy formula, averaged), called from
    `submit` for non-resigned games. Bounded to the first 40 student moves at a
    200 ms movetime; returns `null` (result-only score, as before) when the pool
    is down or analysis throws. `analyzePosition` gained an optional
    `{ movetimeMs }`. The result view already renders `accuracyPercent` when set.
  - **In-app notifications.** New `Notification` model + `NotificationType`
    (`ASSIGNMENT_DUE_SOON` | `ASSIGNMENT_GRADED`), prisma getter, migration
    `add_notifications`. `NotificationModule` (token-auth): `GET /notifications`
    (latest 50 + unread count), `POST /notifications/read` (ids or all).
    `NotificationService.notify` / `notifyMany` (idempotent on
    `(userId, dedupeKey)`) is exported for other modules. Triggers:
    `NotificationScheduler` (daily 8am) → students with an unfinished assignment
    due in <24h; `AssignmentAttemptService.submit` → the deploying coach when a
    student finishes an attempt. Frontend: `features/notifications/*` +
    `NotificationBell` in the app `Header` (polls every 60s). No email yet.
  - **Author a SOLVE_LINE from the live-class board.** Coach-only
    `SendPositionButton` in the shared-board header (`BoardWorkspace`) opens the
    existing `AssignmentFormDialog` seeded with the current board FEN and
    `activityType: "SOLVE_LINE"` (new optional `initialFen` / `initialActivityType`
    props; `useCoachBatches` gained an `enabled` option). No API change — reuses
    create + assign-now.
  - **SOLVE_LINE hints shipped.** `POST /assignments/mine/:id/attempts/:attemptId/hint`
    (`solveLineHintRequestSchema` → `SolveLineHint`). Progressive, derived from
    the stored solution: level 1 = which piece, 2 = origin square, 3 = the full
    move; each request bumps `hintsUsed` (only when the line is still on track).
    `AssignmentEvaluationService.solveLineHint` + `AssignmentAttemptService.hint`.
    Frontend: the `EvaluatedActivity` Hint button now works and `PracticeBoard`
    gained a `hintSquares` overlay (circle + arrow). Gated on `allowHints`.

- **Phantom "Absent with a join time" in the post-class report.** `getToken`
  opens a `ClassAttendance` row (`recordJoinEvent`, `source: "TOKEN_REQUEST"`)
  the moment a student requests a LiveKit token. A student who loaded the class
  page but never connected (tab closed, connection failed, coach ended the class
  immediately) kept that row: `finalizeClassAttendance` scored it to 0s / ABSENT
  but left `joinedAt` stamped — the summary table then showed "Absent · joined
  07:24 PM" (the class end time, because the open session clamps there). Finalize
  now nulls `joinedAt`/`leftAt` whenever a row scores to `totalDuration === 0`,
  so it reads identically to a true no-show. The `Joined`/`Left` columns were
  also removed from `ClassStudentTable` and the summary header collapsed to one
  line. (Token-request join is kept, not removed — see the LiveKit-webhooks open
  question above; it is the only attendance source if webhooks are not firing.)

- **Board control is now multi-student; PDF tab removed.** The Live Class board
  sidebar's "Board Control" panel and the Participants-panel Crown toggle went
  from single-select (`boardControlStudentId: string | null`) to a granted set
  (`boardControlStudentIds: string[]` with grant/revoke/toggle/clear in
  `LiveClassProvider`). `createBoardStore` now holds `selectedStudentIds: string[]`,
  `senderMayMutateBoard` checks `.includes`, and `UPDATE_PERMISSIONS` carries
  `selectedStudentIds`. The sidebar panel lists every meeting participant (coaches
  shown as "full control"). **Grants are now per colour**: `LiveClassProvider`
  keeps `boardControlStudents: Record<identity, "white" | "black" | "both">`, the
  store mirrors it as `selectedStudentSides`, `UPDATE_PERMISSIONS` carries it, and
  both coach surfaces use the shared `BoardControlSideToggle`
  (Off / White / Black / Both) — so two students can play each other on the
  shared board. Separately, the
  **PDF tab was removed entirely**: `PdfPanel`, the `pdf` tab, `pdfUrl`
  store/sync fields, `SET_UI_STATE.pdfUrl`, the `uploadPdf` client helper, and the
  API `POST /upload/pdf` route + `UploadService.uploadPdf`.

- **Post-class summary screen.** The "class ended" state was a dead-end
  `<RoomEnded />`. Now `GET /attendance/class/:id/summary`
  (`API_ROUTES.attendance.classSummary`, `AttendanceService.getClassSummary`)
  returns a role-aware payload — coaches/admins get the full `ClassDetailReport`,
  students get their own attendance row — plus a `finalized` flag the client
  (`useClassSummary`) polls on. `LiveSession.attendanceFinalizedAt` marks
  finalization; the endpoint lazy-re-runs the idempotent `finalizeClassAttendance`
  if the class ended without the marker set. `ClassSummary` renders inside the
  room's `ended` state and the `/live-class/[roomId]` ended branch; "Return to
  Dashboard" is always available. Also fixed the coach-presence check in
  `getToken` / `sweepStaleClasses` to tolerate the `_<clientId>` identity suffix
  (students were stuck in the waiting room), and the meeting timer now counts
  from `liveSession.startedAt` rather than the scheduled start.

- **Meeting countdown ignored a late start (2026-08-30).** Elapsed time already
  ran from `liveSession.startedAt`, but the timer's default countdown mode still
  targeted the scheduled `endsAt`, so a class started late silently lost the
  late-start minutes (18:00–19:00 class begun at 18:15 showed 40 min left, not
  55). `useLiveClass` now derives the countdown target as
  `startedAt + (scheduledEnd − scheduledStart)` once the session is live, so the
  class always gets its full planned duration from when it actually began. Falls
  back to the scheduled end before the class starts or on bad schedule data.

## Resolved (2026-08-29)

- **Board workspace — engine analysis, Load Game, Setup Position.**
  `POST /stockfish/analyze` was dead: `AnalyzePositionDto` had no
  `class-validator` decorators, so the global `ValidationPipe({ whitelist: true })`
  stripped `fen` and the endpoint always returned `{ error }` with HTTP 200 — the
  Engine panel rendered "MNaN". Fixed: shared `stockfishAnalyzeRequestSchema` +
  `StockfishAnalysisResult` types + `API_ROUTES.stockfish`, a decorated DTO,
  proper 400/403/503 responses (no more 200-with-error-body), UCI→SAN conversion
  server-side, and configurable `STOCKFISH_MOVETIME` (default 800ms, was 150).
  `apiFetch` now rethrows aborted requests without the network toast. "Load
  Games / Positions" dialog gained a **Load Game** tab (PGN textarea + `.pgn`
  upload) alongside the position editor; `loadPgnIntoBoard` (`lib/loadPgn.ts`) is
  the single PGN-load path. Coverage: `stockfish.controller.spec.ts`,
  `stockfish.service.spec.ts`, `upload.controller.spec.ts`, and opt-in
  `e2e/analysis-board.spec.ts`.

- **Setup Position tab — blank board + broken palette (2026-08-30).** The Setup
  Position board rendered as an empty rectangle: the spare-piece palette used
  `<div class="pawn white">` which never matches the cburnett `.cg-wrap
  piece.<role>.<color>` rules (needs a real `<piece>` element), and the board's
  chessground instance initialised against a flex item that got stretched
  non-square with no stable size / `overflow` containment, so squares and pieces
  (sized as `12.5%`) collapsed and chessground DOM spilled over the castling
  controls. Fixed by extracting a reusable, LiveKit-free
  `features/chessboard/components/board/PositionEditor.tsx` (+ pure
  `lib/fen.ts`): a controlled `{ value, onChange }` FEN editor with a
  block-level `aspect-square` `overflow-hidden` board (the working
  `PgnBoardViewer` pattern), a real `<piece>` palette, and themed side-to-move /
  castling / en-passant / move-number / FEN controls. `SetupPositionDialog` is
  now a thin consumer; the Load Game (PGN) tab is untouched. Admin Assignment
  Creation can reuse `<PositionEditor>` directly. Coverage extended in
  `e2e/analysis-board.spec.ts`.

- **Coach live-class chessboard — sync fixes + clock + detach.** Fixed: a
  student granted board control could move locally but the move was dropped by
  every other client (all board-mutating messages were blanket coach-only);
  three different participant-identity formats were used for "who has control"
  so grants from the participants panel never matched `canMove`; the coach's
  in-meeting board (`LiveChessboardPanel`) was built but never rendered, leaving
  the coach dependent on a popup window. Now: the receiver runs
  `senderMayMutateBoard` (`lib/boardSyncRules.ts`) keyed by the full LiveKit
  participant identity; one sync engine (`LiveBoardSyncBridge` → `BoardSyncContext`)
  instead of one per `RequestControlButton`. (Superseded 2026-08-30: the
  in-meeting `LiveChessboardPanel` is removed — the coach's board is the
  dedicated `/live-class/:id/board` tab only; the meeting screen stays a
  meeting. Students still see a synced inline board tile in `MeetingVideoGrid`.)
  Added: a shared chess clock (`ClockState` in `createBoardStore`, `lib/clock.ts`,
  `ChessClock`, `SET_CLOCK` message, coach-authoritative) and per-student board
  detach / "resync to coach" (`isDetached` + `detachBoard`/`resyncBoard`).
  Coverage: `e2e/live-board-sync.spec.ts` (opt-in, two real LiveKit participants).

- **PGN assignments** — new `assignment` API module + `features/assignments` web
  feature. Admins author shared library items; coaches author private ones and
  deploy any item to their batches with a due date (fans out a per-student
  completion row per batch member). Students replay the PGN on a read-only board
  and mark it complete with an optional note; the PGN string is also uploaded to
  Cloudinary for download. Fills the previously-404 `/student/practice` route
  that the sidebar + dashboard "Assignments & Practice" card already linked to.

- **`packages/ui` / `packages/utils`** — deleted. Empty shells with no importer in
  `apps/**`; the `.ai/`-manager helpers they held had already been reverted on the
  app side. Lockfile pruned, workspace listings updated.
- **Admin attendance drill-downs** — wired. `attendance.studentById` /
  `coachById` now open from `StudentAttendanceDialog` / `CoachAttendanceDialog`
  (`features/attendance/components/`) off the admin coach report and class-detail
  student table. Backend was already complete + authorized; only the UI was added.
- **God-component splits** — `ProfileForm`, `MeetingVideoGrid`, `MeetingChat`,
  `DemoClassesClient`, and `completed-classes/[id]/page.tsx` each broken into a
  sibling folder of memoized children + a `*.utils` file. Entry paths/exports
  unchanged.

## Other deferred

- Email verification is commented out in `auth.service.ts` (two places) by design for now.
- `GET /batches/:id` (`batches.get`) has no frontend caller — the list response is reused.
- `POST /upload/pgn` — stale note removed 2026-09-14: it does have a direct
  frontend caller (`apps/web/src/features/chessboard/components/panels/
  SidebarTabs.tsx` → `lib/uploadApi.ts`'s `uploadPgn`), in addition to the
  `assignment` service's server-side call to `UploadService.uploadPgn`. Size
  is capped at 512KB in the controller and the shared
  `createAssignmentRequestSchema`.
