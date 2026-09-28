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
- Trash restore, permanent delete, empty-trash, retention cleanup, and audit logging
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
    `hintsUsed`.
  - `PLAY_VS_ENGINE` — the student plays a position out against the pooled
    Stockfish engine (skill level configurable); scored from the game result,
    with move accuracy computed from per-move engine analysis (falls back to
    result-only when the engine pool is offline or the student resigned).
  - `FREE_ANALYSIS` — an open interactive board the student submits when done.

  Evaluated activities (everything but `REPLAY`) record `StudentAssignmentAttempt`
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
  storage-snapshot cron (`AnalyticsScheduler`, advisory lock `73002050`), and an
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

Default local URLs:

- Web: http://localhost:3010 (Dev mode) or http://localhost:3000 (Production container)
- API: http://localhost:3011 (Dev mode) or http://localhost:3001 (Production container)

### Background Dev Server Scripts (`nexa` CLI)

The project includes background management scripts using `tmux` so that servers continue running in the background even after closing the terminal session:

```bash
# Start dev servers in watch/hot-reload mode (background tmux session)
nexa dev          # or: nexa start-dev / start-dev

# Build & launch production-mode staging servers for testing
nexa stage        # or: nexa start-stage / start-stage

# Check status and health of dev servers
nexa status       # or: nexa status-dev / status-dev

# Stop all dev servers
nexa stop         # or: nexa stop-dev / stop-dev

# Quick restart dev servers
nexa restart

# View live logs
nexa logs         # shows latest logs for both API & Web
nexa logs api     # shows API logs
nexa logs web     # shows Web logs

# Attach to interactive tmux console
nexa attach
```

*Note: These commands are available from anywhere in the system terminal (symlinked into `~/bin/`).*

## Environment

API env lives in `apps/api/.env`.

Important values:

```env
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
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

Build for production and apply migrations first:

```bash
npm run build:prod
```

More Prisma notes live in `apps/api/prisma/README.md`.

## Trash And Soft Delete

Soft-delete behavior is centralized in `apps/api/src/prisma/soft-delete.extension.ts` and exposed through the Trash module in `apps/api/src/trash`. Current trash entities are `User`, `StudentProfile`, `CoachProfile`, `Batch`, `BatchCoach`, `BatchStudent`, `Puzzle`, `PuzzleTopic`, `Course`, and `CourseModule`.

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

The Trash list merges rows from all trash-entity tables in memory. Sorting and paging stay exact within the newest `MAX_TRASH_SCAN` (500) deleted rows per entity; deeper offsets are not supported.

Automatic cleanup uses a PostgreSQL transaction advisory lock so horizontally scaled API instances do not run the cleanup concurrently.

## Background Jobs (BullMQ)

Queues run on the `redis` service that LiveKit and egress already share, so
every BullMQ key is namespaced with `QUEUE_PREFIX`. Wiring lives in
`apps/api/src/queue/`; `QueueModule.forRoot()` is registered in `app.module.ts`.

Locally, start Redis with `npm run prod:db` (it maps `127.0.0.1:6379`, like
postgres) and set `REDIS_URL` in `apps/api/.env`.

**Queues are optional.** With `REDIS_URL` unset the API still boots: no worker
starts and every `@InjectQueue()` resolves to a stand-in that logs the job and
drops it, so `npm run dev:api` needs no Docker. That also means an enqueue is
best-effort — anything that must survive gets a persisted row with a status
column it can be re-driven from, and treats the enqueue as a nudge.

Adding a queue — the feature module owns its name, there is no central registry:

```ts
// whatsapp.constants.ts
export const WHATSAPP_QUEUE = "whatsapp";

// whatsapp.module.ts
@Module({
  imports: [QueueModule.registerQueue(WHATSAPP_QUEUE)],
  providers: [WhatsappService, WhatsappProcessor]
})
export class WhatsappModule {}

// whatsapp.processor.ts
@Processor(WHATSAPP_QUEUE, buildWorkerOptions(getApiEnv()))
export class WhatsappProcessor extends WorkerHost {
  async process(job: Job<SendMessageJob>) { /* ... */ }
}

// producing
constructor(@InjectQueue(WHATSAPP_QUEUE) private readonly queue: Queue) {}
await this.queue.add("send", payload, { jobId: message.id });
```

Retries and retention come from `DEFAULT_JOB_OPTIONS` in `queue.config.ts`
(5 attempts, exponential backoff from 2s; completed jobs trimmed after 24h,
failed ones kept a week for inspection). Pass a `jobId` derived from your own
row to make an enqueue idempotent.

## WhatsApp Messaging

`apps/api/src/whatsapp/` wraps the **WhatsApp Cloud API** (Meta Graph API) for
outbound messages. Import `WhatsAppModule` and inject `WhatsAppService`:

```ts
await this.whatsapp.sendText({ to: "+91 98765 43210", body: "Class starts in 15 minutes." });

await this.whatsapp.sendTemplate({
  to: student.phone,
  name: "class_reminder",       // approved in WhatsApp Manager
  language: "en_US",
  bodyParams: [student.name, "6:00 PM"]
});
```

Free-form text only reaches a user inside the 24-hour customer-service window;
outside it, WhatsApp accepts **approved templates only** and rejects text with
error code `131047`.

Numbers are normalized to E.164 digits without a `+` (the only form the API
accepts) before sending — `+91 98765-43210`, `00919876543210` and, with
`WHATSAPP_DEFAULT_COUNTRY_CODE=91`, `09876543210` all resolve to
`919876543210`. A number that cannot be resolved is a `BadRequestException`, and
no request is made.

Three rules the module holds to:

- **Optional, like the queues.** With `WHATSAPP_ACCESS_TOKEN` /
  `WHATSAPP_PHONE_NUMBER_ID` unset, `isConfigured()` is false and a send throws
  `ServiceUnavailableException` — check it before offering WhatsApp in a UI.
- **One attempt per call.** Retries belong to the caller so a request never
  blocks on provider backoff. Failures throw `WhatsAppSendError`, whose
  `failure.retryable` separates a rate limit or outage from a rejected payload;
  a BullMQ job can re-throw on the first and drop the second.
- **`trySendText` / `trySendTemplate` never throw**, returning a
  `{ ok, result | error }` outcome — use them where WhatsApp failing must not
  fail the request. `sendTextToMany` fans one message out, de-duplicates the
  recipients and reports per-recipient outcomes.

Env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (both from Meta →
WhatsApp → API Setup), plus the optional `WHATSAPP_API_BASE_URL`,
`WHATSAPP_API_VERSION`, `WHATSAPP_DEFAULT_COUNTRY_CODE` and
`WHATSAPP_TIMEOUT_MS`.

## Admin Messaging

`/admin/messaging` is where an academy decides which moments send a message,
what each one says, and who receives it. One **rule per event** (`messaging_rules`,
one row each), edited by an admin, dispatched by the API.

Three crons drive it: the outbox worker every minute, the class-reminder sweep
every 5 minutes, and the assignment-due sweep hourly.

| Event | Queued by |
|---|---|
| New class scheduled | a coach creating a class |
| Before a class starts (students) | `MessagingScheduler`, on that rule's lead time |
| Before a class starts (coach) | `MessagingScheduler`, on its own lead time and wording |
| Class cancelled | a coach cancelling a class |
| New assignment | an assignment deployed to a batch |
| Assignment due soon | `MessagingScheduler`, on the rule's lead time |
| Assignment submitted / graded | a student finishing an assignment |
| Announcement | an admin publishing one (Announcements tab) |
| Welcome message | not fired by self-registration any more — student and coach sign-ups both wait for approval |
| Account approved | an admin approving a pending student, or re-activating an account |

Each rule carries: a master on/off, per-channel toggles (**WhatsApp** and the
**in-app bell**), an audience, **when to send** (immediately, daily at a time,
or weekly on a day - or a lead time, for the two events that fire ahead of a
moment), the in-app heading, and the message body. Bodies are `{{placeholder}}` templates —
the catalogue of what each event can bind lives in
`packages/types/src/messaging.ts` (`MESSAGING_EVENT_DEFINITIONS`), and the same
`renderMessageTemplate` runs in the admin preview and on the server, so what you
see is what gets sent. A placeholder the event cannot fill is flagged in the
editor and renders empty.

Things worth knowing before you touch it:

- **Everything ships off except two.** `ASSIGNMENT_DUE_SOON` and
  `ASSIGNMENT_GRADED` default to on, in-app only, because this feature absorbed
  the unconditional in-app notifications that used to live in
  `NotificationScheduler` and `assignment-attempt.service`. Disabling them by
  default would have silently removed a notification every academy already had.
- **Dates render in each recipient's own `User.timezone`**, one render per
  person — the rare server-side format the date rule allows
  (`messaging.format.ts`).
- **Nothing is sent in-request.** Dispatch only *queues*: it writes PENDING
  `message_deliveries` rows and returns. `MessagingDeliveryWorker` (cron, every
  minute) claims the due ones and delivers them. So a trigger costs no provider
  round-trip, a crash mid-send loses nothing (the row is committed), and an
  immediate rule lands within a minute.
- **Failures retry themselves.** A retryable provider failure (rate limit,
  outage - `WhatsAppSendError.retryable`) stays PENDING with a later
  `scheduledFor`: 1m, 5m, 25m, 2h05m, then FAILED after 5 attempts. A rejected
  payload fails immediately, since it would fail identically forever. An admin
  can re-queue any failed message from the Delivery log.
- **The two sides of a class are separate rules.** Students and the coach get
  their own lead time, channels and copy (students 30 minutes before by default,
  the coach 60) — a coach reminder reads "you're taking X with Intermediate B",
  which is not a student's message with a different address. Each sweeps its own
  window every 5 minutes.
- **Send times are per recipient.** A "daily at 9am" rule reaches everyone at
  *their own* 9am (`computeScheduledFor` reads `User.timezone`), with DST and a
  weekdays-only option handled in `messaging.schedule.ts`.
- **Dispatch never fails its caller.** Feature services call
  `MessagingDispatchService.dispatchInBackground(...)`, which swallows and logs.
  A WhatsApp outage cannot fail class creation.
- **Every attempt is logged** to `message_deliveries` (Delivery log tab),
  including skips for a missing phone number and provider failures with Meta's
  own error text. Numbers are masked to the last 4 digits.
- **Sends are idempotent** through a `dedupeKey` unique per `(channel, key)`.
  Because the row is written *before* anything is sent, a repeated sweep
  collides on insert rather than racing a second send. The two lead-time crons
  take a Postgres advisory lock first, and the outbox worker claims rows with
  `FOR UPDATE SKIP LOCKED` + a `claimedAt` stamp (stale claims reaped after 5
  minutes), so a second API container takes different rows instead of the same
  ones.
- **Outside WhatsApp's 24-hour window**, free-form text is rejected by Meta
  (error `131047`). A rule can name an approved template instead, with its
  positional values written as mini-templates.

Announcements (Announcements tab) write the dashboard feed row *and* fire the
ANNOUNCEMENT rule. The announcement's own audience decides who hears it —
everyone, students, coaches, or one batch — not the rule's, so a published
broadcast can't be silently narrowed by a settings change. The student dashboard
only shows announcements addressed to that student.

## Coach Feedback & Ratings

Students rate their coaches through forms an admin designs
(`apps/api/src/feedback/`, `apps/web/src/features/feedback/`, routes
`API_ROUTES.feedback.*` / `.adminFeedback.*`, admin page `/admin/feedback`,
coach page `/coach/feedback`).

- **What is asked** — a form holds up to 20 questions: star rating (1-5),
  written answer, multiple choice, or yes/no, each optionally required. The
  coach's rating is the mean of the star-rating answers; a response's own
  `overallRating` is the mean of its rated questions.
- **When it is asked** (`trigger`):
  - *After classes* — after every Nth completed class a student attended with
    the same coach (`classInterval`, 1 = every class). Only classes that end
    after the form's start date (or creation, if no start) count.
  - *Periodically* — once per coach every `intervalDays`.
  - *Once* — once per coach while the form is live.
  - A request stays open `expiresAfterDays`; optional `startsAt` / `endsAt`
    bound the whole form. `batchIds` limits it to some batches (empty = all).
    Periodic/once forms only ask about coaches the student actually attended a
    class with.
- **Where it appears** (`placements`, any combination): the class-ended summary
  screen, a pop-up on the student dashboard (at most one per visit), and a card
  at the top of the student dashboard until answered.
- **Who sees results** — admins see every response with the student's name;
  a coach sees only their own, anonymously, and only from forms with
  `showToCoach` on. `allowSkip` lets students dismiss a request for good.
- "Pending" is computed on read (`feedback-pending.util.ts`), never stored. A
  submitted or skipped `FeedbackResponse` closes a request; its unique
  `(formId, studentId, coachId, contextKey)` stops double submission, and the
  server re-derives the target itself instead of trusting the client's ids.
- Answers snapshot the question text and type, so editing a form never rewrites
  past responses. A form with responses can't be deleted — deactivate it.
  None of these models are soft-deletable or Trash-registered.

## Chess Board Appearance

A single, centralized theme system drives the visual appearance of every
chessboard in the app (`apps/api/src/chess-appearance/`,
`apps/web/src/features/chess-appearance/`, routes `API_ROUTES.chessAppearance.*`,
user page `/chess-board`, admin page `/admin/chess-appearance`).

- **Three-layer resolver, same shape as pre-class settings**: system default
  (Nexa Classic) → admin global default → the user's own preference, last
  non-empty layer wins. `resolveChessAppearance` + the catalogs live in
  `@nexa-chess/types` (`chess-appearance.ts`) so the API and both settings
  pages can never disagree about what a theme is or how resolution works.
- **6 board themes** (Nexa Classic, Classic Green, Blue, Brown, Dark, Minimal)
  are self-authored CSS — a checkerboard built from two stacked
  `linear-gradient`s plus an optional subtle wood-grain layer, parameterized
  by CSS custom properties scoped under `[data-nexa-board-theme="<id>"]`. No
  image assets, no licensing concerns, and any two boards on the same page can
  run different themes at once.
- **5 piece sets** (Classic, Modern, Minimal, Tournament, Wooden) are vendored
  SVGs from lichess's open-source piece library
  (github.com/lichess-org/lila), filtered to commercially-safe licenses —
  most of lichess's own sets are non-commercial and were excluded. Full
  attribution in `apps/web/public/chess/pieces/LICENSES.md`. Scoped the same
  way, under `[data-nexa-piece-set="<id>"]`.
- **Every chessboard** (`ChessgroundBoard`, `PracticeBoard`, `PositionEditor`,
  `PuzzleBoardTile`, `PgnBoardViewer`, `SolutionEditor`, the recorder template)
  reads its theme, coordinates, animation, and highlight/legal-move/check
  toggles from `useChessAppearance()` (`ChessAppearanceProvider`, mounted once
  in `AppProviders.tsx`) instead of hardcoding them — purely cosmetic,
  per-browser state that never touches FEN/position/move history and is never
  broadcast over a live-class data channel.
- **Live preview without saving**: `ChessAppearancePreviewScope` shadows the
  app-wide context with unsaved draft values for its subtree, so the settings
  pages' preview board (a real, movable `PracticeBoard`) updates immediately
  as a form changes, with zero special-casing in the board components
  themselves.
- **A user-preference save merges onto the existing stored override**, not a
  wholesale replace — a single-field change (e.g. the board's `C` keyboard
  shortcut for coordinates) can't silently clobber a different field the user
  set earlier from the settings page. The same merge applies to the admin
  global default.
- **Admin can disable a built-in theme** (never delete one) to hide it from
  both picker UIs; a user who already had it selected keeps rendering it.

## Payments

Provider-agnostic checkout across **Razorpay**, **Cashfree** and **Stripe**,
UPI-first for India and card/wallet-first internationally. Business logic only
ever talks to `PaymentService`; a `PaymentRouter` picks the gateway, so adding a
fourth provider means writing one adapter and registering it — nothing else
changes.

```
PaymentService
      ↓
PaymentRouter                 ← admin-editable rules, /admin/payments → Gateways
      ↓
Razorpay │ Cashfree │ Stripe  ← apps/api/src/payments/providers/
```

### What each gateway is for

| Gateway | Role | Methods |
|---|---|---|
| Razorpay | Primary, India | UPI (intent/QR/collect via Checkout), cards, net banking, wallets, EMI, subscriptions |
| Cashfree | Secondary India / UPI failover | UPI, cards, net banking, wallets, EMI |
| Stripe | International | Cards, Apple Pay, Google Pay, Stripe-supported local methods, multi-currency, subscriptions |

**The app never touches a card number, CVV, UPI PIN or bank credential.** Every
one is entered on the gateway's own surface: Razorpay and Cashfree open their
SDK modal, Stripe redirects to a hosted Checkout Session. The only gateway value
that reaches a browser is a publishable key or a single-order session token, and
the API supplies it in the checkout response — nothing is baked into the web
build.

### Configuration

Each gateway is independent and optional. Unset credentials make that adapter
report itself unconfigured: the router skips it and the checkout screen stops
offering the methods only it could serve. With none configured the API still
boots — the catalogue and billing history read fine, and a checkout attempt is a
clean 503. See `.env.example` for the full block, including which webhook events
to subscribe to.

```env
PAYMENTS_ENABLED=true
PAYMENTS_MODE=sandbox          # selects provider hostnames only
RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET=
CASHFREE_APP_ID= CASHFREE_SECRET_KEY= CASHFREE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY= STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET=
```

Webhook endpoints to register in each dashboard:

```
POST https://<api-host>/payments/webhooks/razorpay
POST https://<api-host>/payments/webhooks/cashfree
POST https://<api-host>/payments/webhooks/stripe
```

### Pricing a batch

An admin sets what a batch costs from the batch itself: **Batches → (a batch) →
Pricing**. A batch can carry several price options at once — a monthly
subscription beside a one-time fee — each with its own tax, access length and
allowed payment methods.

```
Batch "Intermediate B"
├─ Monthly       ₹999   + 18% GST   UPI, Cards      → subscription
└─ Lifetime    ₹4,999   + 18% GST   all methods     → one-time
```

Those options **are** `Plan` rows carrying the batch id — there is deliberately
no second pricing model, so the checkout, the invoice, the entitlement and the
admin's idea of "what this batch costs" are all the same object. Plan codes are
generated from the batch name and interval; nobody has to invent one.

Changing a price never re-prices anything already sold: an order freezes its
amounts at checkout and a subscription freezes its amount at subscribe time.

### One-time vs subscription

`ONE_TIME` takes a single payment. `MONTHLY`, `QUARTERLY` and `YEARLY` open a
**mandate at the gateway** instead — the provider bills each cycle and we mirror
its state from webhooks, never charging on our own clock. The router is told the
plan recurs and only considers a gateway that can actually mandate the chosen
method, which is why §13's warning matters: net banking and most wallets cannot
hold a mandate, so they are not offered for a recurring plan.

Members cancel from **Billing**, and cancelling at period end keeps the access
they already paid for.

### Payment methods, twice over

Two independent controls, and they only ever narrow:

| Where | Scope | Use it for |
|---|---|---|
| **Payments → Gateways → Payment methods** | Platform-wide | Turning a method off everywhere, and rewording its checkout line |
| **A batch's price option → Payment methods** | One price option | "This plan is UPI-only" |

A method is offered only if *both* allow it and a configured gateway can serve
it. A method absent from the platform-wide map is **enabled** — adding a new
method to the codebase never silently disables it on an existing install.

### Discounts

**Payments → Discounts.** One mechanism covers every kind of offer, because a
launch code, a UPI-only deal and a batch-specific promotion are the same object
with a different scope:

| Field | Effect |
|---|---|
| `PERCENTAGE` / `FIXED` | 25% off, or ₹500 off. A percentage can be capped |
| `methods` | How "10% off on UPI" is expressed — the code only prices once that method is chosen |
| `batchIds` / `planIds` | Restrict to certain batches or price options |
| `minOrderAmount` | Minimum order value |
| `startsAt` / `endsAt` | Validity window |
| `maxRedemptions` / `maxPerUser` | Total uses, and uses per account |

Rules that shape the implementation:

- **Priced server-side, always.** The checkout preview runs the same
  `computeDiscount` the server does, but the order's `discountAmount` only ever
  comes from a fresh server-side resolve. A code that expired between preview
  and pay is simply not applied — the purchase still goes through at the honest
  price rather than failing.
- **Tax is charged on the discounted subtotal.** Taxing the list price would
  overcharge the buyer by the tax on money they never paid.
- **A code is consumed when money arrives, not when a checkout opens.** An
  abandoned cart never burns a limited code, and a replayed webhook never
  consumes a second use (the redemption is unique per order).
- A code can never make an order negative — one worth more than the order makes
  it free.
- The receipt shows the discount as its own negative line, naming the code, so
  a member can see both what they paid and what they saved.

Deleting a code that has already been claimed **deactivates** it instead: the
orders that used it point at the row, and a receipt has to keep making sense.

### The rule that shapes everything

**The payment gateway is not the source of truth for access.** A frontend
saying "success" grants nothing, and neither does a gateway status on its own:

```
Provider → server-side verification → Payment → Order → Entitlement → access
```

Only an `Entitlement` row unlocks anything, it is written inside the same
transaction that marks the payment PAID, and it is unique per `(orderId,
planId)` — so a replayed webhook, a status-check and a reconciliation sweep all
converge on one grant and one batch enrolment.

### Money

Always **integer minor units** (paise, cents) in `Int` columns — never a float,
never a Decimal a rounding bug can shave. `toMinorUnits` / `toMajorUnits` /
`formatMoney` in `@nexa-chess/types` are the only conversions; Cashfree, which
speaks rupees, converts at its adapter boundary and nowhere else.

### Duplicate and double-charge protection

| Hazard | What stops it |
|---|---|
| Double click, refresh, back/forward, second tab | Unique index on `orders.idempotencyKey`; the client holds one key per plan in `sessionStorage` and the server replays the original order |
| Webhook delivered twice | Unique `(provider, eventId)` on `payment_webhook_events` — the redelivery collides on insert |
| Out-of-order webhooks | `PAYMENT_STATUS_RANK`: a status may only move forward, so a stale `PENDING` (or a sibling attempt's `FAILED`) cannot un-pay a captured payment |
| Benefit granted twice | Unique `(orderId, planId)` on `entitlements` |
| Retry against another gateway | Off by default (`failoverEnabled`). A provider is only excluded after its attempt reached a *settled* failure — never while it is unclear whether money moved |
| Browser closed mid-payment | The reconciliation cron asks the gateway directly and applies the answer through the same funnel |
| Wrong amount captured | Parked at `PROCESSING` with `amount_mismatch`; access is withheld for review |

### Refunds

Admins refund in full or in part from `/admin/payments`. A refund is **never**
marked complete because the provider's API accepted the request — only a webhook
or a reconciliation read settles it. A *transport* failure deliberately leaves
the refund PENDING rather than FAILED, because the gateway may have taken it and
"failed" invites a second refund for the same money.

### Manual / offline payments

Cash, a coach's personal UPI/GPay, or a bank transfer collected outside the
app — tracked the same way as a gateway payment, without one. An admin or a
coach records it from **Payments → Manual payments** (admin) or **Payments**
(coach, scoped to their own batches). It never goes through `PaymentRouter` or
a provider adapter: `ManualPaymentService` builds an ordinary `Order` +
`Payment` (`provider: MANUAL`) directly and reaches `PAID` through the exact
same `PaymentService.applyProviderState` funnel a gateway capture uses, so the
entitlement, invoice and `PAYMENT_RECEIVED` message are unchanged code paths.

- **A coach's record is `PENDING` until an admin approves it.** Approving
  reaches `PAID`; rejecting reaches `FAILED` with a reason the coach can see —
  both through `applyProviderState`, so nothing about the access/invoice/
  messaging logic is duplicated. **An admin's own record is auto-approved.**
- **The offline method (Cash, UPI/GPay, bank transfer, …) is an
  admin-managed catalogue** (`OfflinePaymentMethod`), not a hardcoded list —
  deactivate instead of delete once a record references one.
- **A record can carry an optional proof-of-payment attachment** (a
  screenshot or a PDF receipt), stored the same private/authenticated way as
  an invoice PDF (`manual-payment-attachment.storage.ts`) and streamed back
  through the API, never a bare Cloudinary URL.
- **Never refundable through this system** — there is no gateway to call.
  `verify`/`reconcile`/`retry`/refund all reject provider `MANUAL` with a
  clear error rather than the opaque "no adapter registered" a missing
  `ProviderRegistry` entry would otherwise produce.
- **A coach only ever sees the manual entries they themselves submitted** —
  never a student's online payment history. Money between a student and the
  academy otherwise stays admin-only, unchanged.

### Invoices and credit notes

Issued once, inside the capture transaction, numbered gaplessly per year from
`InvoiceSequence` (`NEXA-INV-2026-000123`). Everything the invoice asserts —
line items, the buyer's billing identity, the seller's registered details, the
tax split — is **frozen onto the row at issue time**, so a receipt someone
downloaded a year ago renders identically today.

**The line names the purchase**, not just the plan: a batch's price is a `Plan`
usually called something like "Term fee", so the line is built as
`<plan> — <batch> (<interval>)` — "Term fee — Saturday Intermediate (Monthly)".
That string is copied at issue time, so renaming or deleting the plan later
never rewrites a receipt someone already downloaded.

**PDFs** are rendered server-side with **pdfmake** (`invoice-pdf.service.ts`),
not headless Chrome: this box already runs LiveKit egress' Chromium during
recordings and a second browser competing for two vCPUs is how a class loses its
recording. pdfmake's table primitive paginates on its own, and the Roboto it
bundles carries real glyphs for ₹, €, £ and •, so no extra font ships in the
image. A printable HTML version is served alongside for anyone who would rather
print.

**Storage is private.** A rendered PDF is archived to Cloudinary as an
`authenticated` `raw` asset (`invoice-storage.service.ts`) — there is no
permanently-public URL for a financial document. Downloads always stream through
the authenticated API route, so changing the id in the URL reaches someone
else's invoice only if you are an admin. Cloudinary is **optional**: with the
credentials unset nothing is archived and PDFs are rendered on demand instead,
so local dev needs no account.

**Rendering runs on BullMQ** (`invoice` queue, `invoice.processor.ts`). The
capture enqueues a job keyed on the invoice row, so two redelivered webhooks
collapse into one render, and a container restarted mid-render picks the work
back up instead of losing it. Queues are optional as everywhere else: with
`REDIS_URL` unset the service renders inline rather than letting
`createDisabledQueue` drop the job, so `npm run dev:api` still works without
Docker. `pdfStatus` remains the source of truth and the sweep remains the net —
the queue is a nudge.

**A failed render never touches the payment.** Generation runs *after* the
capture commits. A failure parks the invoice at `pdfStatus: FAILED` — the
financial `status` stays `PAID` — and the retry sweep picks it up. If the
archive is missing when someone asks for their receipt, it is re-rendered on the
spot, so a background failure is invisible to the customer.

**The invoice is delivered on WhatsApp as the PDF itself**, not a link. Once the
render succeeds, the `INVOICE_ISSUED` messaging rule fires through
`MessagingDispatchService` like every other outbound message. When the rule has
WhatsApp enabled, the PDF is uploaded to Meta first and the resulting media
handle is attached to the outbox row, so the delivery worker sends a `document`
message (or a template with a DOCUMENT header, when the rule names one) and a
parent receives the receipt in the chat. Nothing is uploaded for an in-app-only
rule, and a failed upload degrades to the download link in the body rather than
dropping the message. It is addressed to the **invoice's** billing phone — the
parent — not the student's account number.

**Tax** is computed by the shared engine in `@nexa-chess/types`
(`invoices.ts`): `resolveTaxTreatment` decides CGST+SGST (intra-state),
IGST (inter-state) or zero-rated export from the seller's and buyer's place of
supply — never assumed — and the admin preview calls the same function the
server does. Tax is always charged on the **discounted** subtotal.

**A refund never edits the invoice.** It records `amountRefunded` and moves the
status; the document that accounts for the reversal is a separate, numbered
`CreditNote` (`NEXA-CN-2026-000001`), idempotent on the unique `refundId`, with
tax reversed in the proportion it was charged.

**Business details are configuration**, never constants in the template:
Admin → Invoices → Billing & invoicing (`InvoiceSettings`, a singleton seeded
from the legacy `PAYMENTS_*` env vars on first read).

Surfaces: student `/student/billing` (invoices, credit notes, billing details)
and `/student/billing/invoices/[id]`; admin `/admin/finance/invoices` with
per-currency roll-ups, filters, CSV export, PDF retry, email resend and the
audit trail. Routes are `API_ROUTES.invoices.*` / `.adminInvoices.*`.

### Background work

| Job | Cadence | What it does |
|---|---|---|
| `PaymentReconciliationService.sweep` | 5 min (advisory lock `73002060`) | Asks each gateway about in-flight payments; expires unpaid orders past their TTL |
| `PaymentWebhookService.recoverFailedEvents` | 10 min | Replays stored webhook events whose handler threw |
| `InvoiceProcessor` (BullMQ `invoice` queue) | on demand | Renders + archives an invoice or credit-note PDF, then emails and WhatsApps it. 5 attempts with exponential backoff; failures kept 7 days |
| `InvoiceGenerationService.sweepFailedGenerations` | 10 min (advisory lock `73002070`) | Retries failed/pending invoice PDFs, and reclaims rows stuck `GENERATING` over 15 min |
| `RefundService.reconcilePending` | 30 min | Reads the gateway for refunds it has not reported on |
| `InvoiceGenerationService.sweepUnsentEmails` | 30 min | Re-sends invoice emails that failed after a successful render |
| `EntitlementService.expireLapsed` | hourly | Marks entitlements past `endsAt` as expired |
| `ProviderHealthService.pruneOldEvents` | daily | Trims provider telemetry past 30 days |

### Verifying it

Unit tests run with the rest of the suite (`npm run test -w apps/api`) and cover
the status machine, routing, signature verification, status mapping, the capture
funnel, entitlements and refunds.

Two database-backed checks go further. They need a built `dist` and a seeded
database, and they clean up everything they create:

```bash
npm run build -w apps/api && npm run db:seed
npm run test:payments:integration -w apps/api   # capture → entitlement → invoice → enrolment
npm run test:payments:webhooks -w apps/api      # real signed webhooks from all three gateways
npm run test:payments:pricing -w apps/api       # batch pricing, discounts, discounted tax
```

The webhook check signs payloads with each gateway's own scheme (Razorpay hex
HMAC, Cashfree base64 HMAC over timestamp+body, Stripe `t=`/`v1=` with its
tolerance window), so it exercises the real verification code — including that a
forged signature, a replayed Cashfree timestamp and an expired Stripe signature
are all rejected.

### Admin dashboard

`/admin/payments` — revenue (net of refunds, bucketed in the admin's own
timezone), a filterable transaction table with CSV export, refunds,
subscriptions, the plan catalogue, discount codes, gateway health, the
per-method switches and the routing rules. The
routing preview runs the same `resolvePaymentProvider` the server does, so what
an admin sees is exactly what a checkout would pick.

Adding a plan there is what makes anything buyable: a plan carries its price,
currency, billing interval, tax percent and — optionally — the batch a
successful purchase enrols the student into. For a batch, pricing it from the
batch's own **Pricing** tab is usually easier (see above).

## Rate Limiting

`@nestjs/throttler` runs as a global `APP_GUARD` (100 req/min; auth routes drop
to 5/min, password reset to 3/min — see `auth.controller.ts`). Counters live in
Redis when `REDIS_URL` is set, so they **survive a restart**: in-memory counters
reset on every deploy, which hands an attacker a fresh allowance against the
login and reset limits.

Storage is built in `common/throttler/throttler-storage.factory.ts` and wrapped
by `ResilientThrottlerStorage`. Because the guard is global, a storage that
threw would turn a Redis blip into a 500 on *every* route — so the wrapper falls
back to in-process counting when Redis fails, stops calling Redis for 10s, and
logs once on the way down and once on recovery. Limits stop being shared and
reset during that window; the API stays up.

The client is deliberately configured to fail fast (`enableOfflineQueue: false`,
`commandTimeout: 1000`) — a hung Redis must become a fast fallback, not a
stalled request. Keys are namespaced `<QUEUE_PREFIX>:throttle:`.

With `REDIS_URL` unset the module keeps its in-memory default and logs a warning
at boot.

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
- **Persistence**: Both PostgreSQL and Redis use Docker named volumes for persistent data storage across restarts.
- **Pinned Versions**: Container images are explicitly pinned to stable versions that support `ARM64` architecture (e.g. `postgres:15.6-alpine`, `redis:7.2.4-alpine`, `livekit/livekit-server:v1.6.0`).

## Project Rule

When implementing or updating a feature, update the relevant README in the same change so setup, commands, env variables, and behavior stay current.
