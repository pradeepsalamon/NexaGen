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
  admin-managed `PuzzleTopic` (Fork, Pin, Back Rank, …). Admin puzzles are
  `GLOBAL` (every coach sees them); coach puzzles are `PRIVATE` (author + admins
  only) and can never be made global. Lifecycle is `DRAFT` → `PUBLISHED` →
  `ARCHIVED` (all reversible), with a separate soft delete through the Trash
  module. Students browse published puzzles and solve them; `PuzzleAttempt`
  rows are scored by the same `AssignmentEvaluationService` SOLVE_LINE engine.
- Live-class puzzle assignment: mid-class, a coach pushes a published puzzle
  into the room (`API_ROUTES.liveClass.puzzle*`); every student solves it on
  their own board and a leaderboard ranks them by score then time. Optional
  timer + a "hide leaderboard from students" toggle. `LiveClassPuzzleAssignment`
  references `puzzleId` (never copies) and is **not** trash-registered — it is a
  lightweight per-class row whose lifecycle is a `status` column, same as
  `Assignment`. The service is in `PuzzleModule` (which imports `LiveClassModule`);
  only starting an attempt is a new route, everything else reuses the puzzle
  attempt endpoints.
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

Soft-delete behavior is centralized in `apps/api/src/prisma/soft-delete.extension.ts` and exposed through the Trash module in `apps/api/src/trash`. Current trash entities are `User`, `StudentProfile`, `CoachProfile`, `Batch`, `BatchCoach`, `BatchStudent`, `Puzzle`, and `PuzzleTopic`.

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

The Trash list merges rows from all six tables in memory. Sorting and paging stay exact within the newest `MAX_TRASH_SCAN` (500) deleted rows per entity; deeper offsets are not supported.

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
| Welcome message | self-registration, or an admin creating an account |
| Account approved | an admin re-activating an account |

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

- Card (with CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- Dialog
- AlertDialog
- DropdownMenu

**Data Display**

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
