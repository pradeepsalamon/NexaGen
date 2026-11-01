# Nexa Chess

Nexa Chess is an npm workspaces monorepo with a Next.js frontend, a NestJS API, shared TypeScript packages, Prisma/PostgreSQL persistence, and HTTP-only cookie based auth.

## Workspaces

- `apps/web`: Next.js App Router frontend
- `apps/api`: NestJS backend API
- `packages/types`: Shared request/response/domain types
- `packages/config`: Shared configuration package shell

## Current Features

- Responsive landing page at `/`
- Auth pages for login, register, forgot password, and reset password
- Sample protected super-admin dashboard at `/dashboard/super-admin`
- Logout button on the protected super-admin dashboard
- Zustand for client UI/session metadata state
- TanStack Query for API/cache state
- Prisma schema for users, profiles, auth sessions, and password reset tokens
- Idempotent Prisma seed data for local auth testing
- JWT auth with HTTP-only access and refresh cookies
- bcrypt password and refresh-token hashing
- Auth action endpoints return `200 OK`; registration returns `201 Created`
- Refresh-token rotation and logout session revocation
- Remember-me refresh lifetime:
  - unchecked: `JWT_REFRESH_SHORT_TTL=1d`
  - checked: `JWT_REFRESH_TTL=7d`
- Password reset magic link sent through SMTP with neutral account-existence messaging and timing
- Login timing protection for unknown-email and wrong-password attempts
- Batch management with soft delete into the Super Admin Trash workspace
- Demo classes (`/admin/demo-classes`, public `/demo/<id-or-slug>`): per-class
  access (anyone with the link / link + passcode / invited guests only, where an
  uninvited guest waits for the coach to admit them), guests invited from leads
  or by phone/email with a personal join link, and **static demo schedules**:
  recurring weekly slots behind one permanent `/demo/<slug>` link, sessions
  generated two weeks ahead. See CLAUDE.md §3.6k.
- Trash restore, permanent delete, empty-trash, retention cleanup, and audit logging
- Analysis boards keep **variations**: a different move adds a branch instead of
  truncating, coaches promote/delete branches and comment on moves, and PGN
  export/import keeps every line (`packages/types/src/move-tree.ts`).
- **Game Library** (`/games`, every role): every class game — shared board,
  simul, student match — is saved automatically, plus PGN imports; filter by
  student / batch / source / result / date, open the replay with variations,
  coaches save analysis, download PGN. See CLAUDE.md §3.6k1.
- **Game analysis & insights**: Stockfish post-game analysis of any finished
  game (`/games/:id` → Engine analysis): accuracy, move-by-move labels and
  explanations, engine lines, tactics found / missed, a missed tactic → Smart
  Revision. Students upload their own PGNs (and, when
  `EXTERNAL_GAME_IMPORT_ENABLED`, import from a verified Lichess / Chess.com
  account); `/student/insights` and the progress workspace's "Games" tab show
  evidence-backed patterns. Runs on the engine pool's background lane as
  `game_analyses` jobs (`GAME_ANALYSIS_*` env). See docs/GAME_ANALYSIS.md and
  docs/GAME_SOURCES.md.
- **Messages** (`/messages`, every role): batch group chats, coach ↔ student
  direct messages, coach-made groups; never student ↔ student. Polled (no
  websocket); unread count on the sidebar link. See CLAUDE.md §3.6k2.
- **Assignment reminders**: overdue / due-today / due-soon banner and a
  once-per-session popup on the student dashboard, a count on the sidebar link,
  a "Due dates" overview tab for coaches and admins, and an in-app
  "assignment overdue" notice to the coach (messaging rule
  `ASSIGNMENT_OVERDUE_COACH`, on by default). See CLAUDE.md §3.6k3.
- Assignments: admin-authored shared library + coach-authored items, deployed
  to batches with a due date (`assignment` API module, `features/assignments` on
  web, `/coach/assignments`, `/admin/assignments`, `/student/practice`). Each
  assignment has an **activity type**:
  - `REPLAY` (default; every legacy assignment) — read-only PGN replay, marked
    complete manually or on the time limit.
  - `SOLVE_LINE` — the student plays the expected line move-by-move on an
    interactive board; forced replies are revealed one at a time and the server
    scores `correct required moves / required moves`. When the assignment allows
    hints, `POST .../:attemptId/hint` returns a progressive hint derived from the
    stored line (piece → origin square → full move) and counts against
    `hintsUsed`. **Any mate wins**: when the stored line ends in checkmate, a
    different legal mating move at any student ply also completes it
    (`isAcceptedMateAlternative`, mirrored client-side; shared cases in
    `SOLVE_LINE_MATE_FIXTURES`). A line that doesn't end in mate is never
    reinterpreted.
  - `PLAY_VS_ENGINE` — the student plays a position out against the pooled
    Stockfish engine (skill level configurable); scored from the game result,
    with move accuracy computed from per-move engine analysis (falls back to
    result-only when the engine pool is offline or the student resigned).
  - `FREE_ANALYSIS` — an open interactive board the student submits when done,
    optionally after a minimum number of moves (`minMoves`).
  - `PUZZLE_SET` — an ordered list of published library puzzles
    (`AssignmentPuzzle`, up to `MAX_ASSIGNMENT_PUZZLES`), built and reordered in
    the same form ("Puzzle set"). The student solves them one at a time
    ("Puzzle 4 of 10") through ordinary server-scored `PuzzleAttempt`s
    (`context: ASSIGNMENT`, `studentAssignmentId` set): `POST
    /assignments/mine/:id/puzzles/:puzzleId/attempts` starts/resumes one, then the
    existing `/puzzles/:id/attempts/*` routes save moves (wrong moves counted
    server-side), give hints and submit. Points use the live-class engine
    (`computePuzzlePoints`), each puzzle's scoring frozen onto its row when the
    set is saved (system → admin default → puzzle → the set's override).
    **A puzzle counts its best finished try once**, so retries and duplicate
    submits can't inflate a total; a set is COMPLETED once every puzzle has a
    finished try. Tries per puzzle = the assignment's `maxAttempts`, hints =
    `allowHints`; a partial unique index allows one open attempt per student per
    puzzle (racing starts can't spend two tries), and submit is claimed with a
    status filter (a second submit is a 409). The solution stays hidden while a
    try is left. Results are computed on read by `puzzle-set-results.util.ts`
    and rolled up onto `StudentAssignment` (status / tries / points % / time),
    so lists, dashboards and reminders work unchanged. Coaches see per-student,
    per-puzzle results + the ranking in the deployment's results dialog;
    students get `GET /assignments/mine/:id/leaderboard`, limited server-side by
    the set's leaderboard options (hidden / after the due date / top N /
    anonymized) and only ever within their own batch's deployment.
    **Homework-approved folders**: the Super Admin approves a puzzle folder
    once, academy-wide (`PUT /puzzles/topics/:id/homework`, revoke with
    `DELETE`; the approval is two columns on `puzzle_topics`, never per coach,
    so coaches added later are covered and nothing resets it). A coach then
    assigns the whole folder from the library's Topics tab: `POST /assignments`
    with `sourceTopicId` and no `puzzleIds` — the server builds the set from the
    folder's live PUBLISHED GLOBAL puzzles (title order) and stores
    `Assignment.sourceTopicId`. Only an approved folder with no subfolders and
    1–`MAX_ASSIGNMENT_PUZZLES` such puzzles qualifies (`folderHomeworkBlocker`
    in `@nexa-chess/types`, checked on approve, create and **every deploy** of
    a folder-built set). Revoking stops new assignments and re-deploys; homework
    already handed out stays with the students.

  Evaluated activities (everything but `REPLAY` and `PUZZLE_SET`) record `StudentAssignmentAttempt`
  rows. The server owns all evaluation (`AssignmentEvaluationService`): legal-move
  validation, correctness, score, accuracy, completion and attempt limits. The
  solution line is never sent to a student before completion. Attempt lifecycle:
  `POST /assignments/mine/:id/attempts` (start/resume) → `PATCH .../:attemptId`
  (save progress, returns per-move feedback for `SOLVE_LINE`) →
  `POST .../:attemptId/submit` (authoritative evaluation) with
  `POST .../:attemptId/engine-move` for `PLAY_VS_ENGINE` and
  `POST .../:attemptId/hint` for `SOLVE_LINE`. Coaches see per-student
  score/accuracy/attempts; admins see aggregate performance per library item.
  Reusable board: `features/chessboard/components/board/PracticeBoard` (no LiveKit
  coupling); admins build positions with the shared `PositionEditor` and record
  solutions by playing them in `SolutionEditor`. A coach can also turn the live
  shared board into a `SOLVE_LINE` assignment from the board header
  ("Send as assignment" → the same form, position pre-seeded).
- PDF chess-diagram import (coach + admin): Puzzle Library → **Import from PDF**
  (`/coach/puzzles/import-pdf`, `/admin/puzzles/import-pdf`) and the coach's
  in-class Setup Position dialog → **From PDF**. The PDF is read **in the
  browser** with pdf.js and never uploaded or stored. Pages are scanned for
  diagrams (or a board is marked by hand), each position is read by classical
  image processing (no ML model, no external service), and the coach reviews
  it: the source diagram beside an editable board, doubtful squares named, and
  explicit answers for what a diagram can't show (side to move, castling, en
  passant, move number, and which side is at the bottom unless printed
  coordinates say so). Nothing is used until the coach confirms; then it can go
  to the Game Library analysis board (a private import), the class board (after
  a "replace the shared board?" confirmation) or the normal New-puzzle form,
  prefilled and saved only by the coach. Recognition core and position checks:
  `@nexa-chess/types` `diagram-recognition.ts` / `diagram-position.ts`; web:
  `features/diagram-import`. pdf.js is served from `public/vendor/pdfjs/`
  (copied from `node_modules` by `apps/web/scripts/copy-pdfjs.mjs` on
  `predev`/`prebuild`, gitignored) because Next's webpack breaks its
  pre-bundled build. Measured accuracy and limits: see the spec header in
  `apps/api/src/common/chess/diagram-recognition.spec.ts`.
- Puzzle Library: a standalone, reusable catalogue of chess-training puzzles
  (position + solution line + topic + type + difficulty + ownership + lifecycle)
  — `puzzle` API module, `features/puzzles` on web, `/admin/puzzles`,
  `/coach/puzzles`, `/student/puzzles`. Every puzzle belongs to one
  admin-managed `PuzzleTopic` (Fork, Pin, Back Rank, …). Topics are a folder
  tree (`parentId`, up to `MAX_PUZZLE_TOPIC_DEPTH` levels; names unique among
  siblings); filtering by a folder includes its subfolders unless
  `topicScope=direct`, and archiving one archives its subtree as one Trash
  group. Tree helpers live in `@nexa-chess/types` (`puzzle.ts`). Admin puzzles are
  `GLOBAL` (every coach sees them); coach puzzles are `PRIVATE` (author + admins
  only) and can never be made global. Lifecycle is `DRAFT` → `PUBLISHED` →
  `ARCHIVED` (all reversible), with a separate soft delete through the Trash
  module. Students browse published puzzles and solve them; `PuzzleAttempt`
  rows are scored by the same `AssignmentEvaluationService` SOLVE_LINE engine.
  A puzzle with no text hints offers that engine's progressive server hint
  (piece → origin square → arrow). `puzzles.title` uses the ICU
  `natural_sort` collation, so the library sorts and pages titles in SQL in
  natural order ("Puzzle 2" before "Puzzle 10").
  Every puzzle carries a `contentHash` (identity of content, shared with the
  Lichess catalogue's seen-set) and a `source` (`NEXA` or `LICHESS`); attempts
  record how they were started (`context`). The Lichess catalogue tables
  (`lichess_puzzles`, `lichess_catalogue_releases`) exist but are empty until
  the catalogue is loaded — see `docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md`.
- Course Library: a curated, ordered playlist of *existing* library content —
  each `CourseModule` references an Assignment or a Puzzle (never new authored
  content) — `course` API module, `features/courses` on web, `/admin/courses`,
  `/student/courses`. Admin-authored only (no coach/visibility scoping, unlike
  Puzzle). Lifecycle is `DRAFT` → `PUBLISHED` (blocked with zero modules) →
  `ARCHIVED` (all reversible), with a separate soft delete of `Course`/
  `CourseModule` through the Trash module (`onDelete: Restrict` on the
  Assignment/Puzzle FK blocks hard-deleting content still attached to a
  module — surfaced as a 400, not a 500, via
  `isForeignKeyRestrictError` in `prisma/prisma-errors.ts`). Completion is an
  explicit `StudentModuleProgress` row per (student, module) — not derived —
  because an Assignment only gets a `StudentAssignment` row once deployed to
  the student's batch via `AssignmentBatch`, which a course-attached
  assignment never is; a Puzzle module self-heals a `StudentModuleProgress`
  row from an existing `PuzzleAttempt.status === SOLVED` the first time the
  student opens the course detail page. `StudentCourseProgress.progressPercent`
  is recomputed on every completion. Course-embedded Assignment modules are a
  read-only `PgnBoardViewer` walkthrough regardless of the underlying
  `activityType` (no `StudentAssignment` row to hang interactive scoring off);
  Puzzle modules deep-link into the real solver at `/student/puzzles/:id`.
- Live-class puzzle assignment: mid-class, a coach pushes a published puzzle
  into the room (`API_ROUTES.liveClass.puzzle*`); every student solves it on
  their own board and a leaderboard ranks them by score then time. Optional
  timer + a "hide leaderboard from students" toggle. `LiveClassPuzzleAssignment`
  references `puzzleId` (never copies) and is **not** trash-registered — it is a
  lightweight per-class row whose lifecycle is a `status` column, same as
  `Assignment`. The service is in `PuzzleModule` (which imports `LiveClassModule`);
  only starting an attempt is a new route, everything else reuses the puzzle
  attempt endpoints.
- Live-class simul: the coach plays one game against each of several (or all)
  students at once (`API_ROUTES.liveClass.simul*`, `apps/api/src/simul/`,
  toolbar "Play simul"). Every move is server-validated with chess.js and
  guarded by the game's `ply`; the coach's board queue puts games waiting on the
  coach first (longest wait first) and auto-advances after each move. The coach
  can ask Stockfish for a hint or have it play the move at a chosen strength
  (needs `STOCKFISH_PATH`). `LiveClassSimul` / `LiveClassSimulGame` are
  per-class operational rows — not soft-deletable, not trash-registered.
- Live-class student matches: students play each other while the coach
  watches every board (`API_ROUTES.liveClass.match*`, `apps/api/src/student-match/`,
  toolbar "Student matches"). A round pairs players automatically (Swiss-style,
  no rematches), by the coach, or by the students themselves (challenge →
  accept), and the coach can switch mode or pair the waiting students mid-round.
  Optional clock (increment, server-validated flags). `LiveClassMatchRound` /
  `LiveClassMatchGame` / `LiveClassMatchChallenge` are per-class operational
  rows — not soft-deletable, not trash-registered.
- Admin "Live Now" (`/admin/live-classes`, sidebar entry with a live-count
  chip, `API_ROUTES.adminLiveClasses.*`, `LiveClassSpectateService`): every LIVE
  class with coach, batch, students in the room and running time, and a
  **Watch class** button for any of them. ADMIN / SUPER_ADMIN only — no invite,
  enrolment, waiting room or coach approval. The seat is a hidden,
  subscribe-only LiveKit token (no publish, no data) with identity
  `spectator_<userId>_<tab>`, so nobody in the room sees it and it can't speak,
  share, chat or touch the board; attendance and room counts skip it. The page
  shows the synced board, every camera/screen share with the room's audio, and
  the room chat (read only).
- Live-class Interactives: the coach's toolbar "Interactives" button (left of
  Leave) opens fourteen classroom tools in a floating, non-modal panel — Pick a Student,
  Mystery Box, Wall of Moments, Team Generator, Grandmaster Mapper, Chess
  Balance, White or Black, Chess Legends, Opening of the Day, Chess Video
  Generator, Rating Calculator, Classroom Timer, Puzzle Storm, Puzzle Racer
  (`features/live-class/components/meeting/interactives/`). Puzzle Storm and
  Puzzle Racer are the Lichess timed modes, played by every student on their
  own stage: Storm is a 3:00 clock that starts on the first move (−10s per
  mistake, +3/5/7/10s at combos of 5/12/20/30, score = puzzles solved), Racer a
  90-second race after a 10-second countdown (a point per correct move, +1/2/3/4
  combo points, one skip per race, a live race track). Both draw the same run of
  Lichess catalogue puzzles for the whole class from Lichess' Storm rating ladder
  (137 puzzles, ~1000 → ~2500, rating deviation ≤ 85), so they need the Lichess
  catalogue loaded (§ "Lichess Puzzle Catalogue"); without it Start answers 503.
  Rounds live in `live_class_puzzle_rushes` / `_entries`
  (`apps/api/src/puzzle-rush/`, `API_ROUTES.liveClass.puzzleRush` /
  `.puzzleRushProgress`). Eight keep shared
  state in `LiveClassToolState` (`apps/api/src/classroom-tools/`,
  `API_ROUTES.liveClass.tools` / `.tool`): the coach/admin writes, every
  participant reads, and a `classroom_tools` packet nudges a refetch. Mystery
  Box, Wall of Moments and Grandmaster Mapper are batch-scoped (they carry over
  to the next class); the rest are per class. Balance, Opening, Rating and Video
  keep nothing on the server. The video is recorded in the browser
  (canvas + MediaRecorder) and only ever exists on the coach's device until
  downloaded. Not soft-deletable, not trash-registered. **Students have no
  launcher**: while the coach's "Show to class" switch is on (the default), the
  open tool is *presented* (tool state `PRESENTING`, class-scoped) and opens on
  every student's main stage — a stage tab in the board's place on md+, a
  centred panel on phones — read-only. The four personal tools send a small
  snapshot of the coach's view with it (the scale's pieces, the opening and
  move, the calculator's figures); the video generator only says what the
  coach is doing. Closing the panel stops showing it.
- Live-class coach sidebar (`components/meeting/classroom/sidebar/*`): on the
  single page, when the board leaves room beside it (lg+, Board stage), the
  coach gets a Lichess Study-style column left of the board — two stacked
  panels with independent tabs, remembered per browser (`localStorage`
  `nexa-live-class-sidebar-tabs`). **Top: Chapters / Members.** Chapters are
  saved boards (position, moves with variations and comments, arrows,
  orientation) in `live_class_chapters` (`apps/api/src/live-class-chapter/`,
  `API_ROUTES.liveClass.chapters` / `.chapterImport` / `.chapterOrder` /
  `.chapter`), batch-scoped like the batch Interactives (a class without a
  batch keeps its own), coach-owner/admin only, at most 64. **Load** puts one on
  the shared board through the ordinary board sync (it asks first when the
  board holds unsaved moves); **Ask** opens "Share current" on the chapter's
  position; the menus add the current board or every published puzzle in the
  coach's puzzle folder, save the board into the selected chapter, rename,
  move and delete (deferred, with Undo). Members lists everyone in the room
  once per person (all their tabs) with White / Black / Both board control per
  student — click the selected side again to take control back — plus batch
  students who aren't connected (away in the app / offline). **Bottom:
  Leaderboard / Chat** — the whole-class puzzle standings (rank, score,
  puzzles solved out of shared; equal score and solved count share a rank) and
  the room chat. Below that width the same leaderboard and chat stay in the
  right-hand panel's tabs. Chapters are not soft-deletable or Trash-registered.
- Activity queue (`apps/api/src/activity-queue/`,
  `components/activity-queue/*`, `API_ROUTES.liveClass.activityQueue*`): a
  coach drafts a named, ordered queue of activities for one class — library
  **puzzles** (optionally timed), **questions** ("what would you play?" on a
  board position) and saved **chapters** — then launches it once and moves the
  whole class through it together (shared progression: one current activity,
  only the coach advances). Drafting works before class on the class page
  (`/classes/:id` → "Activity queue", puzzles only) and in the room's coach
  **Queue** tab (all three kinds); launching needs the class LIVE. Each item
  references what it uses and runs through the feature that already owns it
  — a puzzle is shared as the ordinary live puzzle, a question is an ordinary
  move poll, a chapter is loaded onto the coach's shared board — so students
  answer with the existing solver and question dialog, and the queue stores
  which share / poll each item produced. The coach's tab shows every
  student × activity (correct / incorrect / answered / working / waiting /
  missed, read from the puzzle attempts and poll answers); students get a
  top-bar pill with the class's position and which activities *they*
  answered — never upcoming items or anyone else's answers. Advancing names
  the item being left, so a double click or second tab is a 409, and the
  ended puzzle / poll refuses a late submission. One LIVE queue per class
  (partial unique index); ending the class finishes it. Not soft-deletable,
  not Trash-registered.
- Rated puzzle training (`/student/training`, `PuzzleTrainingService`,
  `API_ROUTES.puzzles.training` / `.trainingNext`): Lichess-style practice, one
  puzzle at a time near the student's own puzzle rating. The pick is a healthy
  mix chosen by the pure policy in `@nexa-chess/types` (`puzzle-training.ts`):
  a ten-step slot cycle of weak themes (slightly easier), themes the student
  rarely meets, mixed picks (slightly harder) and a second chance at a puzzle
  they failed 3+ days ago, with the target nudged ±75 by their last ten
  results. Puzzles come from the Lichess catalogue walk (unseen by content,
  materialised into the hidden Lichess folder), falling back to the academy's
  own published puzzles. Skipping or viewing the solution is a rated miss. Gated
  per batch by `Batch.puzzleTrainingEnabled` (on by default; BatchForm →
  "Puzzle Training"). Spec: `docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md` §12.
- Smart Revision (`/student/revision`, `RevisionService`, `API_ROUTES.revision.*`):
  spaced repetition over library puzzles and folders. Puzzles a student missed
  are seeded automatically; coaches/admins recommend puzzles or a folder from
  the student's progress page (Revision tab). Each review is an ordinary graded
  puzzle attempt (context `REVISION`); the student rates recall Again / Hard /
  Good / Easy, capped by what the attempt shows, and the pure `scheduleRevision`
  in `@nexa-chess/types` sets the next due date. Docs: `docs/SMART_REVISION.md`.
- In-app notifications: `Notification` model + `GET /notifications` /
  `POST /notifications/read`. Students are reminded (daily 8am scheduler) of
  assignments due within 24h; the deploying coach is notified when a student
  finishes an attempt. `NotificationBell` in the app header polls every 60s.
  `NotificationService.notify` / `notifyMany` (idempotent on `(userId, dedupeKey)`)
  is the entry point for future notification sources. No email delivery yet.
- Batch class scheduler: admins define a recurring weekly schedule for a batch
  (`BatchClassSchedule` + `BatchClassScheduleRule` + `BatchScheduleException`)
  and NexaGen generates the full class plan as ordinary `CoachClass` rows —
  `batch-schedule` API module, `features/batch-schedules` on web,
  `/admin/schedule`. The recurrence engine (`recurrence.util.ts`) is
  timezone-aware (Intl-based, DST-correct) and deterministic. Flow:
  `POST /batch-schedules/preview` (occurrence list, class count, first/last date,
  coach/batch conflict detection — no writes) → `POST /batch-schedules`
  (transactional generate; `force` to accept conflicts). Future edits:
  `PATCH /batch-schedules/:id` (`regenerate` rebuilds only not-yet-started
  sessions; past/LIVE/COMPLETED classes are immutable), `POST .../:id/regenerate`
  (idempotent top-up; session numbers stay stable), `DELETE /batch-schedules/:id`
  (end schedule + cancel upcoming), `PATCH /batch-schedules/occurrences/:classId`
  (`CANCEL` / `RESTORE` / `RESCHEDULE` one class without touching the rule).
  `GET /batch-schedules/calendar?from=&to=&batchId=` is role-scoped and powers the
  admin month calendar; generated classes flow through the existing live-class,
  attendance and assignment systems unchanged. Idempotency key:
  unique `(scheduleId, occurrenceDate, scheduleRuleId)` on `classes`.
- Coach schedule calendar: `/coach/schedule` has Week / Month / Upcoming views.
  Week and Month read `GET /coach/classes/calendar?from=&to=` (the caller's own
  classes overlapping the range, any status, ≤ 93 days, same `CoachClass` shape
  with the roster). Days are keyed in the coach's `User.timezone`
  (`features/coach/lib/scheduleCalendar.ts`); clicking a class opens its
  `ClassCard`, so start / notes / reschedule / cancel are unchanged.
- Live class monitoring: coach/admin see a live roster (who's connected, join
  time, last seen, reconnect count) on `/classes/[id]` while a class is running,
  and via a "Monitor Live" action on the admin Batch Classes table
  (`features/attendance/components/LiveClassMonitor`, polls
  `GET /attendance/class/:id/live` every 10s)
- **Admin analytics dashboard** (`/admin` and `/admin/analytics/*`): a
  production analytics system for Super Admin / Admin. `analytics` API module
  (21 admin-only `GET` endpoints under `/analytics/*` + CSV export) →
  `features/analytics` on web (recharts, themed chart wrappers, KPI cards,
  shareable URL date-range/filter state). Sections: executive overview (16 KPIs),
  user growth, acquisition ("how users discover NexaChess" — normalized
  `User.acquisitionSource` + optional UTM capture at registration), students,
  coach performance + teaching hours, live classes (demo vs batch vs status),
  attendance (trend / by batch / by coach / low-attendance), batches, recordings
  & storage (usage gauge + growth + linear forecast), engagement (DAU/WAU/MAU
  from `analytics_events`), today's operations, and an actionable alert feed.
  Drill-down sub-pages with paginated tables for users / coaches / classes /
  recordings / batches, plus `coaches/:id` and `batches/:id` detail views.
  Every metric's calculation is surfaced in a "How is this calculated?" tooltip.
  New infra: `AnalyticsEvent` + `StorageSnapshot` models, a global
  `ActivityTrackingInterceptor` (throttled `User.lastActiveAt`), a daily
  storage-snapshot cron (`AnalyticsScheduler`, job lock `analytics.storage-snapshot`), and an
  in-process 5-minute cache for the heavier sections (`?fresh=1` bypasses).
  Config: `ANALYTICS_STORAGE_WARN_PERCENT` (70), `ANALYTICS_STORAGE_CRITICAL_PERCENT`
  (85), `ANALYTICS_LOW_ATTENDANCE_PERCENT` (75), `ANALYTICS_INACTIVE_DAYS` (30),
  `ANALYTICS_CACHE_TTL_SECONDS` (300).
- Quiet API startup logs with request logging for method, path, status, duration, and client address
- Chess board appearance: centralized board theme / piece set system (6 board
  themes, 5 licensed piece sets) with a 3-layer resolver (system → admin
  default → user preference), user page `/chess-board`, admin page
  `/admin/chess-appearance` — see "Chess Board Appearance" below

## Development

Install dependencies:

```bash
npm install
```

Run web and API together:

```bash
npm run dev
```

Run one app:

```bash
npm run dev:web
npm run dev:api
```

If Next dev mode serves unstyled HTML after editing files or reports a missing
`.next/server` chunk, stop the web server and restart it with a clean cache:

```bash
npm run dev:web:clean
```

If the API watch process reports a missing module from `apps/api/dist` after an
edit, stop the API server and restart it with a clean build output:

```bash
npm run dev:api:clean
```

Frontend-only, against the staging API (no Postgres, Redis or local API — for
low-spec machines):

```bash
npm install
npm run dev:web:remote   # web on http://localhost:3000, API proxy on :3001 → https://api-dev.nexachess.in
```

`scripts/dev-remote-api.mjs` proxies the API so its `.nexachess.in` cookies
become localhost cookies (a page on localhost never receives the originals, so
login would bounce). You work on the shared `vps_dev` data — what you create
everyone on staging sees. Point it elsewhere with `REMOTE_API_URL`; change ports
with `WEB_PORT` / `PROXY_PORT` (the remote's `CORS_ORIGIN` must list the web
origin; staging lists `http://localhost:3000`).

Default local URLs:

- Web: http://localhost:3010 (Dev mode) or http://localhost:3000 (Production container)
- API: http://localhost:3011 (Dev mode) or http://localhost:3001 (Production container)

### Background Dev Server Scripts (`nexa` CLI)

`scripts/nexa.sh` (symlinked as `nexa` on the VPS) keeps the servers running in
a background `tmux` session after the terminal closes:

```bash
nexa start dev            # watch mode, web :3010 / api :3011
nexa start stage          # production builds, run in tmux
nexa start dev web        # one component only (dev/stage)
nexa status               # tmux session + dev/prod HTTP health
nexa stop dev             # stop | restart take the same arguments
nexa logs [api|web]
nexa attach
```

Full reference: [docs/NEXA_CLI.md](docs/NEXA_CLI.md).

## Environment

API env lives in `apps/api/.env`.

Important values:

```env
DATABASE_URL=postgresql://...
# Production refuses to boot unless both are 32+ random chars and differ.
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
# Two-factor sign-in (TOTP). Unset key = unavailable. Listed roles enroll at next login.
# Production refuses to boot without the key while MFA_REQUIRED_ROLES names a role (NONE opts out).
MFA_ENCRYPTION_KEY=...
MFA_REQUIRED_ROLES=SUPER_ADMIN,ADMIN
# JSON logs (nestjs-pino); default info in production, debug (pretty) locally.
LOG_LEVEL=info
JWT_ACCESS_TTL=15m
JWT_REFRESH_SHORT_TTL=1d
JWT_REFRESH_TTL=7d
LOGIN_RESPONSE_DELAY=500ms
PASSWORD_RESET_RESPONSE_DELAY=5s
CORS_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...

# BullMQ. Unset REDIS_URL disables every queue (see "Background Jobs").
REDIS_URL=redis://127.0.0.1:6379
QUEUE_PREFIX=nexa
QUEUE_CONCURRENCY=5

# WhatsApp Cloud API. Unset token/phone id leaves sending disabled.
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=v21.0
WHATSAPP_DEFAULT_COUNTRY_CODE=91   # expands national numbers to E.164

# Recording storage + analytics thresholds (all optional, defaults shown)
RECORDING_STORAGE_LIMIT_GB=130
RECORDING_MIN_RETENTION_DAYS=14
ANALYTICS_STORAGE_WARN_PERCENT=70
ANALYTICS_STORAGE_CRITICAL_PERCENT=85
ANALYTICS_LOW_ATTENDANCE_PERCENT=75
ANALYTICS_INACTIVE_DAYS=30
ANALYTICS_CACHE_TTL_SECONDS=300   # 0 disables the analytics in-process cache

# Live-class auto-end (per-minute sweep; 0 disables either rule)
LIVE_CLASS_COACH_ABSENT_GRACE_MINUTES=10   # coach out of the room this long mid-class
LIVE_CLASS_MAX_OVERRUN_MINUTES=60          # this far past the scheduled end, coach or not
```

For production, replace JWT secrets with long random values and set `FRONTEND_URL` / `CORS_ORIGIN` to the live frontend origin.

`recharts` is a `apps/web` runtime dependency (charts on the admin analytics
dashboard). After `main`-branch deploys the daily `AnalyticsScheduler` cron
starts recording `storage_snapshots`; the storage growth chart + forecast need
~14 days of history before they render.

## Prisma

Validate schema and generate client:

```bash
npm run prisma:validate -w apps/api
npm run db:generate
```

Create and apply a local migration:

```bash
npm run db:migrate:dev -- --name migration_name
```

Seed local test users:

```bash
npm run db:seed
```

Seeded login accounts all use `Test@12345`:

- `superadmin@nexa.test`
- `coach@nexa.test`
- `student@nexa.test`

Apply committed migrations in production:

```bash
npm run db:migrate:deploy
```

Build for production (no database access; apply migrations as their own release step, `npm run db:migrate:deploy`, before starting the new build):

```bash
npm run build:prod
```

More Prisma notes live in `apps/api/prisma/README.md`.

## Data Retention

A daily sweep (`apps/api/src/retention/`, 4 AM, single-runner via the `retention.sweep` job lock) deletes rows nothing reads any more: expired login sessions and password-reset / email-verification tokens (1 day after expiry), LiveKit webhook dedupe rows older than 30 days, and anonymous visitor sessions idle for 180 days that never became a lead. It deletes in batches of 5,000 so a large first run never holds long locks. The rules live in `retention.rules.ts`. Business records (chat, notifications, message deliveries, analytics events, payments) are not touched.

## Trash And Soft Delete

Soft-delete behavior is centralized in `apps/api/src/prisma/soft-delete.extension.ts` and exposed through the Trash module in `apps/api/src/trash`. Current trash entities are `User`, `StudentProfile`, `CoachProfile`, `Batch`, `BatchCoach`, `BatchStudent`, `Puzzle`, `PuzzleTopic`, `LibraryActivity`, `Course`, and `CourseModule`.

When adding a new trash-enabled model:

1. Add `isDeleted`, `deletedAt`, `deletedById`, and `deleteGroupId` fields in Prisma, plus supporting indexes and the deleted-by relation.
2. Add the model to `softDeleteModels` and `trashEntities` in `soft-delete.extension.ts`. If the model is retired alongside a parent, add it to `CASCADE_CHILDREN` in `trash.repository.ts` so `cascadeSoftDelete` / `restore` move the whole group together.
3. Add relation names to `relationToModel`, and add only list relations that support `where` to `filterableRelationNames`.
4. Audit every `include` and `select` that can return the model. Singular relations cannot accept relation-level `where`, so filter through the parent query or response mapping.
5. Add partial unique indexes for unique fields or composite unique indexes so deleted rows do not block reuse:

```sql
CREATE UNIQUE INDEX "example_key" ON "table"("field") WHERE "isDeleted" = false;
```

6. Wire feature-level delete routes, such as `DELETE /batches/:id`, through `TrashRepository.softDelete` (or `cascadeSoftDelete` when child rows must go with it) so audit logging and retention behavior stay consistent.
7. Update shared types in `packages/types` and frontend entity filters in the Trash UI when a new entity should be visible to admins.

A cascading delete (`cascadeSoftDelete`) tags the parent and its children with one `deleteGroupId`; `TrashRepository.restore` on any member of the group brings the whole group back. Deleting a User cascades to its student/coach profile; deleting a Batch cascades to its coach/student assignments.

**A user with financial or payroll history is never hard-deleted.** Orders, payments, invoices, credit notes, refunds, entitlements, subscriptions, discount redemptions, manual payment records and coach compensation/payroll rows reference `User` with `onDelete: Restrict` (never `Cascade`). The retention sweep and "Empty trash" skip such a user together with the rest of their delete group, and a manual permanent delete returns 400. They can stay in the trash or be restored. `TrashRepository.findUserIdsWithRetainedHistory` is the list of tables checked — extend it when a new financial model references `User`.

The Trash list merges rows from all trash-entity tables in memory. Sorting and paging stay exact within the newest `MAX_TRASH_SCAN` (500) deleted rows per entity; deeper offsets are not supported.

Automatic cleanup takes the `trash.cleanup` job lock (`JobLockService`) so horizontally scaled API instances do not run the cleanup concurrently.

## Feature guides

Each feature's rules and walkthrough live in its own doc (full index:
[docs/README.md](docs/README.md)):

- **Background jobs (BullMQ), rate limiting, Sentry** — [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)
- **WhatsApp and admin messaging rules** — [docs/MESSAGING.md](docs/MESSAGING.md)
- **Coach feedback & ratings** — [docs/FEATURES.md](docs/FEATURES.md#36i-coach-feedback--ratings)
- **Chess board appearance & typography** — [docs/APPEARANCE.md](docs/APPEARANCE.md)
- **Payments, invoices & credit notes** — [docs/PAYMENTS.md](docs/PAYMENTS.md)
- **Puzzles and the Lichess catalogue import** — [docs/PUZZLES.md](docs/PUZZLES.md#lichess-puzzle-catalogue-import-tooling)
- **Live class** — [docs/LIVE_CLASS.md](docs/LIVE_CLASS.md); **classes & scheduling** — [docs/CLASSES.md](docs/CLASSES.md)

## Verification

Common checks for validation:

```bash
npm run typecheck
npm run build
```

App-specific checks:

```bash
npm run typecheck -w apps/api
npm run typecheck -w apps/web
npm run build -w apps/api
npm run build -w apps/web
```

### End-to-end (Playwright)

```bash
npx playwright test                 # e2e/ specs; needs api + web running
npx playwright test pre-class-settings   # live-class pre-class settings: layered
                                         # resolution, preset authz, audit, admin UI
```

`e2e/live-board-sync.spec.ts` (shared live-class chessboard) is **opt-in** — it
drives two real LiveKit participants:

```bash
docker compose up -d livekit postgres redis
# run web with the board test harness enabled (apps/web/.env.local):
#   NEXT_PUBLIC_E2E=1
npm run dev
RUN_LIVE_BOARD_E2E=1 npx playwright test live-board-sync
```

`e2e/analysis-board.spec.ts` (engine analysis, Load Game, Setup Position, Save) is
opt-in the same way — additionally needs `STOCKFISH_PATH` set in `apps/api/.env`:

```bash
RUN_ANALYSIS_E2E=1 npx playwright test analysis-board
```

`e2e/coach-feedback.spec.ts` (admin builds a form → student answers on the
dashboard → coach/admin see the rating) is opt-in too. It writes fixture
classes straight into the database it is given and cleans them up afterwards,
so point it at a local database only:

```bash
RUN_FEEDBACK_E2E=1 DATABASE_URL=<local db> npx playwright test coach-feedback
```

`e2e/diagram-import.spec.ts` (PDF diagram import: rejected files, empty PDF,
book page, flipped board, scan, correction, duplicate warning, analysis board,
draft puzzle) is opt-in and writes a draft puzzle + a Game Library import as
the seeded coach, so run it against a throwaway stack. Add
`DIAGRAM_IMPORT_CLASS_ID=<a SCHEDULED class of coach@nexa.test inside its start
window>` (and a LiveKit the API points at) to also cover loading onto the live
class board:

```bash
RUN_DIAGRAM_IMPORT_E2E=1 E2E_BASE_URL=http://localhost:3100 \
  NEXT_PUBLIC_API_URL=http://localhost:3101 npx playwright test diagram-import
```

Fixtures are regenerated with `node scripts/diagram-import/generate-fixtures.mjs`
(PDFs + Jest page images), `node scripts/diagram-import/capture-pdf-renders.mjs`
(the PDFs as pdf.js renders them) and the piece templates with
`npx ts-node --transpile-only -O '{"module":"commonjs"}' scripts/diagram-import/generate-piece-templates.ts`.

### Responsive screenshots

`scripts/responsive/` is a standalone dev tool (not a Playwright spec) that
screenshots any route across a device matrix (phone / tablet / laptop / desktop,
portrait + landscape), flags horizontal overflow, and writes an HTML gallery.

```bash
npx playwright install chromium            # once
npm run dev                                # app must be running
npm run shots -- --path login --devices all
npm run shots -- --paths admin,admin/batches --login admin --devices mobile,tablet
npm run shots -- --live-class <roomId> --login student --devices mobile,mobile-landscape
```

Output → `scripts/responsive/shots/<timestamp>/` (git-ignored). Full docs and
options: [`scripts/responsive/README.md`](scripts/responsive/README.md).

For the breakpoint system, per-screen responsive behaviour, the full
device × route × theme test matrix and a per-device checklist, see
[`docs/RESPONSIVE.md`](docs/RESPONSIVE.md).

## UI Component Standards

The full, enforced rule set (tokens, which component for which control, layout, accessibility, pre-PR checklist) is **[docs/UI_RULES.md](docs/UI_RULES.md)**.

### Primary UI Library

This project uses **shadcn/ui** as the default component library.

Developers should always prefer existing shadcn/ui components before creating custom UI. All UI primitives live in `apps/web/src/components/ui/`.

### Component Usage Policy

- **Reuse before creating.** Check existing components first.
- **Prefer composition over customization.** Combine shadcn primitives instead of building from scratch.
- **Do not wrap shadcn components unnecessarily.** Use them directly wherever possible.
- **Keep styling consistent with the current design.** Use the project's CSS variable tokens (`--color-primary`, `--color-surface`, etc.) and Tailwind theme tokens (`app-*`, `primary`, `secondary`).
- **Use Tailwind utility classes** instead of creating duplicate components.
- **Label icon-only actions.** Any button or trigger that shows only an icon must include an `aria-label` and a visible hover/focus label using the project's Tooltip or Popover pattern.
- **Tooltips use `SimpleTooltip`** (`components/ui/Tooltip.tsx`), never the native `title=` attribute on interactive elements.
- **No `window.confirm`.** Destructive actions use `useToast().undoable({ title, onCommit })` (delayed action + "Undo" toast) or the execute-then-Undo toast-action pattern. Full guidance in `CLAUDE.md` § 3.6.

### Preferred Components

**Layout & Navigation**

- Tabs
- Separator

**Forms**

- Input
- Textarea
- Select (native)
- Checkbox
- Combobox
- FormField
- Label
- PasswordInput

**Buttons**

- Button (with CVA variants: `primary`, `destructive`, `ghost`, `outline`, `secondary`)

**Feedback**

- Sonner (Toast)
- Skeleton

**Containers**

- FormPageShell (`components/layout/`, full-page create/edit screens: sticky back + title + actions header, optional `aside` column)
- Card (with CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- Dialog
- AlertDialog
- DropdownMenu

**Data Display**

- BulkActionsBar + `BulkResultDialog` + `useBulkAction` (floating bar for selected table rows, per-row result summary)
- RowActions (table action column as round icon buttons; optional `inline` groups the rest behind a "⋮" menu)
- DatePicker / `DateStringPicker` / TimePicker (never a native `type="date|time|datetime-local"` input; `DateStringPicker` takes the `"YYYY-MM-DD"` / `"YYYY-MM-DDTHH:mm"` strings those inputs used)
- Switch (on/off settings: "Lock …", "Enabled", "Send WhatsApp", preferences). Use `Checkbox` only for multi-select lists, table row selection and consent/acknowledgement ticks. Same `checked` / `onCheckedChange` / `label` API as `Checkbox`
- Alert (tinted `error` / `warning` / `info` / `success` inline message with the right `role`/`aria-live`; `WidgetError` is built on it)
- Badge
- Table (with TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption)
- Tooltip

### Development Rule

When building a new feature:

1. Check whether shadcn/ui already provides the required component.
2. Reuse existing project components where possible.
3. Only create a custom component if no suitable shadcn component exists or the feature requires custom behavior.

## Production Deployment (Docker Compose)

The provided `docker-compose.yml` has been hardened for production environments (like Oracle Cloud ARM64 instances):
- **LiveKit Security**: LiveKit reads its API keys securely via environment variables (`LIVEKIT_KEYS`) rather than hardcoded configuration files, eliminating placeholder values.
- **Service Isolation**: PostgreSQL and Redis are bound exclusively to `127.0.0.1` or internal Docker networks, reducing the external attack surface.
- **Health Checks**: Robust container health checks have been added for all services (API, Web, LiveKit, Redis, and PostgreSQL) ensuring that dependent services wait for their prerequisites before starting.
- **Error Reporting (Sentry)**: Optional. Set `SENTRY_DSN` (API, runtime) and `NEXT_PUBLIC_SENTRY_DSN` (web, build time) in the root `.env` — create one Sentry project per app. Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_WEB_PROJECT` to upload web source maps during `docker compose build`. The deploy script tags every error with the commit SHA (`SENTRY_RELEASE`). Only unexpected errors are reported, and events are scrubbed to the user id: no names, emails, cookies, request bodies, query strings or local variables. See CLAUDE.md §3.6d2.
- **API Health Endpoints**: `GET /health` is liveness only (no dependency touched). `GET /health/ready` runs `SELECT 1` against PostgreSQL and pings Redis, each with a 2s timeout: `200 ok`, `200 degraded` (Redis down; the API still serves because Redis is optional), or `503 unavailable` (PostgreSQL down). Both are public, unauthenticated, not rate limited and kept out of the HTTP access log; failure reasons are logged, never returned. The `api` container healthcheck and the deploy gate use `/health/ready`, and it is the URL to point an external uptime monitor at.
- **Persistence**: Both PostgreSQL and Redis use Docker named volumes for persistent data storage across restarts.
- **CI Gate**: `.github/workflows/ci.yml` runs on pull requests into `main`/`dev`, and a push to `main` deploys only when that exact code already passed it on the merged PR, or after it passes on the pushed commit. It covers lint and API unit tests, then every migration applied to an empty PostgreSQL with a `prisma migrate diff --exit-code` check, DB integration tests and the production build. See `docs/DEPLOYMENT.md`.
- **Pinned Versions**: Container images are explicitly pinned to stable versions that support `ARM64` architecture (e.g. `postgres:15.6-alpine`, `redis:7.2.4-alpine`, `livekit/livekit-server:v1.6.0`).

## Project Rule

When implementing or updating a feature, update the relevant README in the same change so setup, commands, env variables, and behavior stay current.

### Engine pool & benchmarks

The analysis panel uses `POST /stockfish/analyze/stream` (server-sent events,
`StockfishStreamEvent`): an `info` frame each time the search deepens (at most
one per 80 ms), then `done` with the same final result `POST /stockfish/analyze`
returns. The first evaluation shows in milliseconds instead of after the full
`STOCKFISH_MOVETIME`. The endpoint sends `X-Accel-Buffering: no`; any proxy in
front of the API must not buffer `text/event-stream`. If the stream fails (401,
older API), the panel falls back to the one-shot request. Scores are from the
side to move (UCI convention); the panel flips them to White's view.

`POST /stockfish/analyze` is cancellable: when the client aborts (the position
changed) a queued search is dropped and a running one receives UCI `stop`;
identical in-flight requests share one search; a request that has the box to
itself gets up to `min(4, cpus)` threads, contended ones get 1. Benchmarks:
`node scripts/engine-bench/bench.mjs --bin <stockfish> [--warm --threads N --hash MB --multipv N --concurrency N]`
and `scripts/engine-bench/pool-scenario.ts` / `stream-latency.ts` (run with
`ts-node` from `apps/api`) for the rapid-stepping and time-to-first-eval
scenarios against the real `StockfishService`.
