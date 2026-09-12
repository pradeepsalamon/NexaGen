# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository. Read this before making changes. Human-oriented conventions live in [docs/PROJECT_RULES.md](docs/PROJECT_RULES.md); non-negotiable rules live in [.agents/AGENTS.md](.agents/AGENTS.md).

---

## 1. What this project is

**Nexa Chess** (package name `nexa-chess`, product name "NexaGen") is a chess-academy platform: batch/class management, live video classes with a synced chessboard, attendance tracking, and role-based dashboards for Super Admin / Admin / Coach / Student.

npm-workspaces monorepo driven by **Turborepo**.

| Workspace | Package | Stack |
|---|---|---|
| `apps/web` | `@nexa-chess/web` | Next.js 14 (App Router), React 18, TypeScript, Tailwind, shadcn-style UI, TanStack Query, Zustand, axios, react-hook-form + Zod |
| `apps/api` | `@nexa-chess/api` | NestJS 10, Prisma 6 / PostgreSQL, JWT auth via HTTP-only cookies, `@nestjs/throttler`, `@nestjs/schedule`, LiveKit server SDK, Cloudinary, Nodemailer |
| `packages/types` | `@nexa-chess/types` | Shared request/response types, Zod schemas, and `API_ROUTES` route registry |
| `packages/config` | `@nexa-chess/config` | Env parsing/validation (`getApiEnv`, `getWebEnv`) with Zod |
| `packages/tsconfig` | `@nexa-chess/tsconfig` | Shared base tsconfig |

Infra: `docker-compose.yml` (web, api, postgres, redis, livekit), self-hosted on an Oracle Cloud ARM64 Ubuntu box. CI in `.github/workflows/deploy-production.yml` SSHes to the VPS and runs `scripts/deploy-production.sh` on push to `main`.

---

## 2. Environment & commands

- **Platform: Windows.** Primary shell is PowerShell; a Bash tool is also available. Use forward slashes in paths.
- Node package manager: **npm** (`npm@11.15.0`). Never use `pnpm`/`yarn` (a stray `pnpm-lock.yaml` exists in `packages/types` — ignore it).
- API env file: `apps/api/.env` (not committed). Root `.env` is for docker-compose. Examples: `.env.example`, `apps/api/.env.example`.

### Common commands (run from repo root)

```bash
npm install
npm run dev              # web + api together (turbo --parallel)
npm run dev:web          # web only            npm run dev:api         # api only
npm run dev:web:clean    # clears .next        npm run dev:api:clean   # clears dist
npm run typecheck        # turbo typecheck across all workspaces
npm run build            # turbo build
npm run lint             # turbo lint
npm run test             # API Jest suite (runInBand) — this is the ONLY test suite in `npm test`
```

### Prisma (from root)

```bash
npm run db:generate                       # prisma generate
npm run db:migrate:dev -- --name <name>   # create + apply migration (local)
npm run db:migrate:create                 # create migration without applying
npm run db:migrate:deploy                 # apply committed migrations (prod)
npm run db:migrate:status
npm run db:seed                           # idempotent; refuses NODE_ENV=production
npm run db:reset                          # DESTRUCTIVE
```

Seeded accounts (password `Test@12345`): `superadmin@nexa.test`, `coach@nexa.test`, `student@nexa.test`.

Local URLs: web `http://localhost:3000`, api `http://localhost:3001`.

### E2E (Playwright)

`playwright.config.ts` + `e2e/*.spec.ts` (attendance, analytics, recording, live-board-sync, analysis-board, pre-class-settings, puzzles, live-class-puzzle). Uses `.env.e2e`. Not part of `npm test`; run with `npx playwright test`. Several specs are opt-in behind a `RUN_*_E2E=1` env var (they mutate the shared dev DB and/or need LiveKit) — check the header comment.

### Verification before you claim done

Always run, scoped to what you touched:

```bash
npm run typecheck -w apps/api      # and/or -w apps/web
npm run lint -w apps/api           # eslint
npm run test -w apps/api           # if you touched API logic
npm run build -w apps/web          # if you touched web (catches RSC/client boundary errors)
```

For **UI / responsive / layout** changes, also screenshot the affected routes
across a device matrix and confirm no horizontal overflow (needs web + api
running; `npx playwright install chromium` once):

```bash
npm run shots -- --path <route> --devices all
npm run shots -- --paths <a,b> --login <coach|student|admin> --devices mobile,tablet --theme both
npm run shots -- --live-class <roomId> --login student --devices mobile,mobile-landscape
```

Output + gallery in `scripts/responsive/shots/<timestamp>/`. Tool docs:
[`scripts/responsive/README.md`](scripts/responsive/README.md). Breakpoint
system, per-area responsive spec, full device test matrix and checklist:
[`docs/RESPONSIVE.md`](docs/RESPONSIVE.md).

The pre-commit hook (`.husky/pre-commit`) runs `npm run typecheck` + `npm run lint`. `package.json`'s `precommit` script additionally runs tests but the hook itself does not.

---

## 3. Architecture & the patterns you MUST follow

### 3.0 Before implementing a new feature

**Read [docs/BACKLOG.md](docs/BACKLOG.md) § "Root causes" first.** It records
recurring traps found during the 2026-08-29 remediation. The two that will waste
your time:

- **The backend half may already exist.** Before designing an endpoint, grep
  `API_ROUTES` in `packages/types/src/api-endpoints.ts` and the target route name
  across `apps/web`. Multiple features shipped with the route + request/response
  type + service authorization done and only the frontend missing. If so, your
  job is `features/<x>/api/*Api.ts` + a hook + a component — not new contract.
- **Orphaned code from the `.ai/` autonomous manager.** Code with no consumer and
  an `NEXA-####` commit may be half-reverted autonomous output. Confirm it is
  actually wanted before extending it — deleting it is often the fix.

If the feature you are adding is listed in BACKLOG.md, update that entry (move it
to "Resolved" or narrow it) in the same change.

### 3.1 Shared contract: `packages/types`

- Every API request/response shape lives in `packages/types/src/index.ts` as a TypeScript type, often derived from a Zod schema (`z.infer`).
- Every endpoint path lives in `packages/types/src/api-endpoints.ts` as `API_ROUTES`. Path-param routes are functions: `API_ROUTES.batches.update(id)`. Controllers use the no-arg form (which returns `/batches/:id`), clients pass the real id.
- **Never hardcode an API path** in either app. Add it to `API_ROUTES` and reference it.
- When you add/change an endpoint: update `API_ROUTES`, add the request/response types, then wire both sides.

### 3.2 API auth pattern (important — there are NO NestJS guards)

Auth is **not** done with `@UseGuards` or param decorators. The established pattern:

1. **Controller** injects `@Req() request: Request` and has a private helper:
   ```ts
   private getAccessToken(request: Request) {
     return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
   }
   ```
   It passes the raw token string into the service method as the first argument.
2. **Service** has a private `getAuthenticatedUser(accessToken: string | undefined)` that:
   - throws `UnauthorizedException` if missing,
   - `jwtService.verifyAsync<AccessTokenPayload>(token, { secret: env.JWT_ACCESS_SECRET })`,
   - checks `payload.type === "access"`,
   - loads the user via Prisma and checks `user.status === UserStatus.ACTIVE`.
3. **Role checks** are private `assertCanX(user)` / inline `if (user.role !== ...) throw new ForbiddenException(...)` helpers in the service.
4. **Row-level visibility** is a private `getXVisibilityWhere(user)` returning a `Prisma.WhereInput` (admins get `{}`, coaches/students get scoped filters). See `batch.service.ts` for the reference implementation.

When adding a new module, **copy this pattern** — do not introduce a guard-based approach unless you are deliberately refactoring all modules and the maintainer agreed.

Cookies: `AUTH_COOKIE_NAMES` = `nexa_access_token` / `nexa_refresh_token` (see `apps/api/src/auth/types/`). Access TTL 15m, refresh 1d (no "remember me") or 7d (remember me). Refresh tokens rotate on every use and are bcrypt-hashed in `auth_sessions`. `main.ts` decides `sameSite`/`secure` from whether `FRONTEND_URL` is https.

### 3.3 Validation

- **Web forms**: react-hook-form + `@hookform/resolvers/zod`, schemas from `@nexa-chess/types` or `features/*/validation/`.
- **API**: two co-existing styles —
  - `class-validator` DTOs implementing the shared request type (`apps/api/src/batch/dto/batch.dto.ts`). Global `ValidationPipe({ transform: true, whitelist: true })` is on in `main.ts`.
  - Inline `ZodPipe` wrapping a shared Zod schema (`apps/api/src/coach/coach.controller.ts`). `nestjs-zod` is a dependency.
  - Match whatever the module you're editing already uses.

### 3.4 Prisma & soft delete

- `PrismaService` (`apps/api/src/prisma/prisma.service.ts`) wraps `PrismaClient` and **manually re-exports a getter per model**. **If you add a model to `schema.prisma`, you MUST add its getter here** or the build breaks. (`.agents/AGENTS.md` rule.)
- **Always create a migration** for schema changes: `npm run db:migrate:dev -- --name <name>`. Never rely on `db push`. Migrations live in `apps/api/prisma/migrations/`.
- Soft delete is centralized in `apps/api/src/prisma/soft-delete.extension.ts` (a Prisma `$extends` query extension that injects `isDeleted: false` into reads) + the `trash` module. Soft-deletable models: `User`, `StudentProfile`, `CoachProfile`, `Batch`, `BatchCoach`, `BatchStudent`.
- Feature delete routes go through `TrashRepository.softDelete(tx, "<Model>", id, userId)` inside a `$transaction` — see `batch.service.ts#delete`. This keeps audit logging (`trash_audit_logs`) and retention consistent.
- Adding a new trash-enabled model: follow the 7-step checklist in `README.md` § "Trash And Soft Delete" (schema fields + indexes, `softDeleteModels`, `trashEntities`, `relationToModel`, `filterableRelationNames`, partial unique indexes `WHERE "isDeleted" = false`, shared types, Trash UI).
- To read including deleted rows, pass `includeDeleted: true` in query args (the extension strips it) or use `prisma.withDeleted`.
- **Uniqueness pre-checks MUST use `prisma.withDeleted`.** `users.email`/`users.username` are uniquely indexed across deleted rows, so a filtered read misses the conflict and the write dies with P2002 → unhandled 500. A deleted user's email stays permanently reserved by design (see `docs/PROJECT_RULES.md` §4.6).
- **Timestamps are UTC, stored tz-naive.** `DateTime` columns map to `timestamp WITHOUT time zone` and Prisma round-trips UTC wall-clock through them — consistent *only* while the Prisma ORM is the sole reader/writer. In raw SQL (`$queryRaw`/`$executeRaw`), never put a bound JS `Date` (Prisma sends it as `timestamptz`) or a `::timestamptz` cast next to one of these columns: PostgreSQL coerces through the session timezone, a no-op on a UTC box (prod) but an offset shift everywhere else (any non-UTC dev box). Bind `${d.toISOString()}::timestamp` — the ISO digits are UTC and `::timestamp` keeps them. Analytics bucketing (`date_trunc(... AT TIME ZONE tz)`) depends on this naive-UTC convention. Services serialize dates with `.toISOString()` and never pre-format (Node would use the server's zone — AUDIT H11). See `.agents/AGENTS.md` "Date & Time Rule".

### 3.5 Web data-fetching pattern

Per feature under `apps/web/src/features/<feature>/`:

- `api/<x>Api.ts` — thin functions calling `apiFetch<ResponseType>(API_ROUTES...., { method, body })`. `apiFetch` (`src/lib/api.ts`) is the axios wrapper: `withCredentials`, automatic 401 → refresh → retry with a request queue, global toast on network errors, normalized error messages.
- `hooks/use<X>Api.ts` — `useQuery` / `useMutation` wrappers. Query keys come from the central `src/lib/queryKeys.ts` factory. Mutations `invalidateQueries` on success.
- `components/` — feature components. Page files under `src/app/**` stay thin: server component checks for the auth cookie and `redirect("/login?reason=unauthorized")`, then renders a `"use client"` `<XClient />`.

`middleware.ts` gates `/admin`, `/coach`, `/student` on cookie presence and redirects logged-in users away from `/login`. It base64-decodes the JWT payload only to pick a dashboard path — it does not verify.

Client session state: `useAuthStore` (Zustand, persisted to `localStorage` key `nexa-auth`, only `user` persisted). `SessionBootstrap` calls `/auth/me` on load.

### 3.6 UI conventions

- **shadcn/ui-style primitives in `apps/web/src/components/ui/`. Reuse before creating.** Prefer composition over new components. See `README.md` § "UI Component Standards" for the full policy and component list.
- Styling: Tailwind with CSS-variable tokens. Use theme tokens (`bg-app-surface`, `text-app-text`, `text-app-muted`, `border-app-border`, `bg-primary`, `text-primary`, `bg-app-background`, `rounded-app`/`rounded-control`/`rounded-panel`, `shadow-card`/`shadow-soft`). Tokens are defined in `src/styles/globals.css` (`:root` and `:root[data-theme="dark"]`); Tailwind maps them in `tailwind.config.ts`. Dark mode = `[data-theme="dark"]` selector.
- **Data-table action buttons** (Edit/Delete/Archive/Restore/Download) MUST be `rounded-full` icon buttons with `aria-label`, `size="icon"`, `className="size-8 rounded-full border-[color] p-0 ... hover:bg-[color] hover:text-white"`, and the Lucide icon needs `strokeWidth={2.5}`. Exact template in `.agents/AGENTS.md`.
- Icon-only buttons always need an `aria-label` + a visible hover/focus label via Tooltip/Popover.
- **Tooltips: use the reusable `SimpleTooltip` (`components/ui/Tooltip.tsx`), not the native `title=` attribute**, on interactive elements: `<SimpleTooltip label="Grant board control"><button aria-label="Grant board control">…</button></SimpleTooltip>`. `title=` is only acceptable on non-interactive nodes (decorative bars) and elements that are already an `asChild` trigger for another Radix primitive (e.g. a `PopoverTrigger` button) where double-wrapping breaks composition — keep the `aria-label` there. The global `TooltipProvider` lives in `AppProviders.tsx`.
- **Confirmations: never use `window.confirm`.** Create/update/delete/archive undo goes through the shared `useUndoableMutation` hook (`lib/undo/useUndoableMutation.ts`) — `strategy: "immediate"` runs the action now and reverses it via a real endpoint on Undo (create/update/delete/archive/restore all use this), `strategy: "defer"` delays the action itself until the toast times out (for anything with no reverse endpoint, or bulk/optimistic-hide UIs — see `TrashManagementClient.tsx`). Policy exclusions (permanent delete, force-mute, mid-class settings broadcasts, etc.) are listed in `lib/undo/README.md` — check it before wrapping a new mutation. Raw `useToast().undoable({ title, message?, onCommit })` still exists underneath for one-off cases that don't need the hook's plumbing.
- Button variants (CVA): `primary`, `destructive`, `ghost`, `outline`, `secondary`.
- Toasts: `sonner`, wrapped by `useToast()` (`providers/ToastProvider.tsx`) — `success`/`error`/`warning`/`info`/`loading`/`promise`/`undoable`.
- **Dates/times: never `new Date(iso).toLocale*()` in a component.** The API sends ISO-8601 UTC strings only (it must never pre-format — Node would use the *server's* zone, AUDIT H11). Format with `lib/datetime.ts` (`formatTime`, `formatFullDate`, `formatLongDate`, `formatDateTime`, `formatRelativeDay`, `formatDuration`, or the generic `formatDate(iso, tz, opts)`), passing the zone from `useUserTimeZone()` (the user's saved `User.timezone` → browser fallback). Analytics has its own `features/analytics/lib/format.ts` whose `formatDate`/`formatDateTime`/`relativeTime` take an optional `timeZone` — pass `useUserTimeZone()` (the analytics API already buckets every series in `User.timezone`). Duration helpers take seconds and carry no zone. Date-only values (`"YYYY-MM-DD"`, e.g. an analytics range bound) format with `"UTC"` so they don't drift a day.

### 3.6b Background jobs (BullMQ)

`apps/api/src/queue/` — `QueueModule.forRoot()` in `app.module.ts`, backed by the
`redis` service LiveKit and egress already share (`QUEUE_PREFIX` namespaces the
keys). **Queues are optional**: with `REDIS_URL` unset the API boots, no worker
runs, and every `@InjectQueue()` resolves to `createDisabledQueue` — a stand-in
that logs the job and drops it — so `npm run dev:api` needs no Docker. An
enqueue is therefore best-effort; anything that must survive persists its own
row with a status column first and treats the enqueue as a nudge.

There is **no central queue-name registry** — a feature module declares its own
constant and imports `QueueModule.registerQueue(NAME)`. Processors take
`buildWorkerOptions(getApiEnv())` for concurrency; retries/retention come from
`DEFAULT_JOB_OPTIONS` (5 attempts, exponential backoff, failed jobs kept 7d).
Pass a `jobId` derived from your own row for idempotency. See README
§ "Background Jobs (BullMQ)".

### 3.6c Rate limiting

`ThrottlerModule.forRootAsync` in `app.module.ts` (global `APP_GUARD`, 100/min;
auth routes 5/min, password reset 3/min). Counters go to Redis when `REDIS_URL`
is set so they survive a deploy, via
`common/throttler/throttler-storage.factory.ts` +
`ResilientThrottlerStorage`, which falls back to in-process counting (with a 10s
cooldown) if Redis fails — the guard is global, so a throwing storage would 500
every route. The client uses `buildRequestPathConnection` (fail-fast:
`enableOfflineQueue: false`, `commandTimeout: 1000`), **not** the queue's
connection, whose `maxRetriesPerRequest: null` is the opposite policy. Keys are
namespaced `<QUEUE_PREFIX>:throttle:` — ioredis applies `keyPrefix` to the
storage's Lua `eval` KEYS.

### 3.7 Live class / LiveKit

- `apps/api/src/live-class/` + `apps/web/src/features/live-class/`. LiveKit webhook at `POST /webhooks/livekit` — `main.ts` parses `application/webhook+json` as raw text for signature verification; don't break that.
- Attendance is driven off LiveKit join/leave/disconnect events → `attendance` module → `class_attendance` / `attendance_logs` / `coach_attendance` tables, scored against the active `AttendancePolicy`.
- Board sync: `apps/web/src/features/chessboard/` (chessground + chess.js, Zustand `boardStore`) bridged into the meeting via `LiveBoardSyncBridge` (single sync engine + `BoardSyncContext`; consume with `useBoardSync()`) / `useLiveBoardSyncBridge`. Board control is keyed by full LiveKit participant identity, is **multi-student**, and is **per colour**: `boardControlStudents: Record<identity, BoardControlSide>` (`"white" | "black" | "both"`) in `LiveClassProvider` (grant/revoke/toggle/`setBoardControlSide` helpers) → `permissionMode` `SELECTED_STUDENT` + `selectedStudentIds: string[]` / `selectedStudentSides` in `createBoardStore`, broadcast via `UPDATE_PERMISSIONS`. A grant arriving without a side means `"both"` (older clients). A single-colour grant only unlocks the board on that colour's turn (`movableColor` in `ChessgroundBoard`) and is re-checked on receipt against the colour that actually played the move (`moverColorFromFen`), so a white-only student cannot drive black by hand-crafting a packet. Coach UI: the Crown popover in the Participants panel and the board sidebar's "Class" panel, both using `BoardControlSideToggle`. The shared chess clock and per-client detach also live in `createBoardStore`. Sync-permission rule: `features/chessboard/lib/boardSyncRules.ts`.
- **Mini player (Picture-in-Picture)**: `providers/PipProvider.tsx` detects the best mechanism the browser offers and exposes it as `mode`. `document` (Chromium 116+) is Document Picture-in-Picture — a real window we render DOM into, so `components/meeting/MiniPlayer.tsx` React-portals a full mini UI (name pill, raised-hand count, mic/camera/back controls) into `pipWindow.document.body`; that window's document starts empty and inherits nothing, so `copyStylesTo` clones every stylesheet across (same-origin rule by rule, cross-origin re-linked by href) and `syncThemeTo` mirrors `data-theme`. `video` (Safari, iOS, and Chromium as fallback) is standard `<video>` PiP driven by `components/meeting/VideoPipSurface.tsx`: one offscreen `<video>` whose `srcObject` follows the spotlight — swapping it mid-PiP keeps the window alive (verified) — falling back to a hand-painted canvas `captureStream` when that person's camera is off. The browser draws that frame itself, so there are no in-window controls. `null` is Firefox, whose PiP is user-driven chrome with no scriptable API; the toolbar row hides itself. Detection is capability-based, so a browser that later ships the standard API picks it up with no code change. Spotlight choice is shared by both modes in `hooks/useSpotlightTrack.ts`. **Auto-open on tab switch is not a `visibilitychange` call** — that has no user activation and is rejected; it is Chrome's automatic PiP for video calls, reached by registering the `enterpictureinpicture` Media Session action handler (in `PipProvider`), which the browser invokes itself — but **only while the tab is actively capturing camera or mic**. So `components/meeting/PipMicCaptureBridge.tsx` (rendered in `MeetingRoom`) holds a microphone capture open for the whole class the way Google Meet does: `createLocalAudioTrack` → `mute()` → `publishTrack` (create-mute-publish order, so no audio is ever transmitted), and the toolbar's mute button just flips that same track. It is a no-op off Chromium-with-Document-PiP (Safari / Firefox / phones), when the class forces the student mic off, when a mic publication already exists, or when the permission prompt is declined. Safari has no automatic PiP at all: the user opens it once and the window survives the tab switch.
- **Recording**: `POST /live-class/:id/recording/start` → `LiveKitService.startRecording` → `startRoomCompositeEgress` with `customBaseUrl` = `RECORDING_TEMPLATE_BASE_URL` + `/recorder/:classId`. That template (`apps/web/src/app/recorder/[classId]`) is the *only* reason a recording contains the chessboard — egress' built-in grid renders published video tracks, and the board is synced as `board_sync` data packets, not a track. It is deliberately outside the auth/provider stack (egress carries no cookie; `middleware.ts` gates only /admin, /coach, /student) and authorises purely on the LiveKit token egress mints. It signals readiness with `console.log("START_RECORDING")` and teardown with `"END_RECORDING"`, which is the contract egress' headless Chrome watches for. Because the template joins hidden + subscribe-only it cannot ask for board state, so `requestBoardSyncForRecorder` injects `REQUEST_SYNC` server-side and the coach answers with `FORCE_SYNC`. **Audio**: room-composite egress records the headless tab's audio *output*, so `RecorderClient` has to attach every remote mic / screen-share audio track to an unmuted, playing `<audio>` element (`.recorder-audio-sink`) — the camera `<video>` tiles stay `muted`. Nothing plays those tracks ⇒ a silent recording.
- **Coach moderation (force-mute)**: `POST /live-class/:id/moderate` (`API_ROUTES.liveClass.moderate`, `LiveClassService.moderateParticipant`, coach-owner/admin, class must be LIVE) switches off one participant's already-published `microphone` / `camera` / `screen_share` via `mutePublishedTrack`. **Mute only — there is deliberately no server-side unmute**: re-opening someone's microphone for them is a privacy hole, and the participant turns it back on themselves unless the class policy locks that source off. It then injects a `ModerationNotice` on topic `LIVE_CLASS_MODERATION_TOPIC` (`moderation`), which `MeetingEventToasts` shows **only to the identity it names** — nobody else's business. Coach UI: the mic/camera/screen icons in the People panel become buttons (`TrackStateControl` in `MeetingParticipants`) when a coach looks at a live track.

- **Private chat (student ↔ coach only)**: room chat stays `useChat` (a LiveKit broadcast). A private message rides its own topic, `LIVE_CLASS_DIRECT_CHAT_TOPIC` (`private_chat`), addressed with `destinationIdentities` so the SFU never puts it on a third participant's wire, and is persisted through the same `POST /live-class/:id/chat` with a `recipientId`. **There is no student ↔ student case, by design**, and `privateChatRecipientAllowed` in `@nexa-chess/types` is the single place that decides it — the API rejects the write, `ChatProvider` hides the option, *and* a receiving client drops an inbound packet that breaks the rule (the packet never passes through the API, so receiver-side enforcement is what actually binds). Sender identity always comes from the LiveKit envelope, never the payload. `GET .../chat` returns room messages plus only the threads the caller is party to. Threads live in `ChatProvider` (`ROOM_THREAD` + one per counterpart user id) with per-thread unread counts; UI is `ChatThreadBar`. Policy gate: `student.privateChat` (`ENABLED` default).

- **Event toasts**: `MeetingEventToasts` (joins/leaves, screen share, board share, force-mute, chat arriving with the panel closed) and `BoardControlToasts` (board control granted/revoked — shown *only* to the student it affects, since the grant packet is broadcast to everyone). Joins and leaves are pooled over a 1.2s window and collapse to `"N people joined"` at three or more, because a class opening produces a burst. Colour is assigned centrally in `lib/meetingToasts.ts` — green for something gained, slate for neutral room activity, amber for something taken away — so the same kind of event always looks the same.

- **Mobile audio** (`AudioSessionBridge`): capturing the mic puts iOS Safari into a voice-call audio session that routes playback to the *earpiece*, so the class sounds like a muted phone call. The bridge sets `navigator.audioSession.type = "play-and-record"` while connected (restored to `"auto"` on leave), turns the first tap anywhere in the room into `room.startAudio()` so autoplay policy never leaves a student in silence when they miss the `<StartAudio>` prompt, and keeps `<RoomAudioRenderer>`'s `<audio>` elements unmuted / `playsinline` / playing across backgrounding. Every call is capability-detected.

- **Puzzle Library** (`apps/api/src/puzzle/`, `apps/web/src/features/puzzles/`, routes `API_ROUTES.puzzles.*`): a standalone catalogue of reusable chess-training objects (position + solution line + topic + type + difficulty + ownership + lifecycle). `PuzzleTopic` (admin-authored only) → many `Puzzle`; both are soft-deletable and registered in the Trash module. `Puzzle.visibility` is `GLOBAL` (admin-authored, every coach sees it) or `PRIVATE` (coach-authored, author + admins only) — the service **forces coaches to PRIVATE** and admins to `GLOBAL` by default; a coach can never publish `GLOBAL` and `canManage` blocks a coach editing an admin puzzle. Lifecycle `status` is `DRAFT`/`PUBLISHED`/`ARCHIVED` (reversible toggles), distinct from the Trash soft delete. **Server move evaluation reuses `AssignmentEvaluationService`** (`normalizeSolution`, `evaluateSolveLine`, `solveLineFeedback`) — exported from `AssignmentModule`, injected into `PuzzleService` / `PuzzleAttemptService` — so there is exactly one SOLVE_LINE engine. Auth is the token-string pattern via `puzzle-auth.helper.ts` (`authenticateUser` / `assertAdmin` / `assertStaffOrCoach` / `assertStudent`), no guards. Students see `PUBLISHED` `GLOBAL` puzzles plus `PUBLISHED` `PRIVATE` puzzles whose author coaches one of their batches; `PuzzleAttempt` rows are server-scored. Web: `PuzzleForm` (position via `PositionEditor`, solution via the shared `SolutionEditor`), `PuzzleSolver` (built on `PracticeBoard`, client-side prefix-match for the coach preview, server-backed for student attempts).

- **Live-class puzzle assignment + leaderboard** (`apps/api/src/puzzle/live-class-puzzle.{service,controller}.ts`, `apps/web/src/features/live-class/**` `PuzzleBridge` / `MeetingPuzzlePanel` / `PuzzleAssignModal` / `InRoomPuzzleSolver`, routes `API_ROUTES.liveClass.puzzle` / `.puzzleAttempt` / `.puzzleLeaderboard`): a coach mid-class pushes a `PUBLISHED` puzzle into the room; students solve it privately (server-scored) and a leaderboard ranks them by score↓ then time↑. `LiveClassPuzzleAssignment` **references** `puzzleId` (never copies), is NOT soft-deletable / not Trash-registered (like `Assignment`), and a partial unique index (`WHERE status = 'ACTIVE'`) enforces one live puzzle per class. `PuzzleAttempt.liveClassId` holds the `CoachClass.id`. **The service lives in `PuzzleModule`** (which now `imports: [LiveClassModule]` for `LiveKitService` + the `LiveClassService.resolveParticipant` / `resolveClassManager` helpers). **`startAttempt` is the only new attempt route** — it delegates to `PuzzleAttemptService.start(token, puzzleId, { liveClassId })`; move-save / submit / hint reuse the existing `/puzzles/:id/attempts/:attemptId/*` routes, which now also call `assertLiveAssignmentOpen` (reject once the coach ends the puzzle or the timer + 15s grace elapses). Lifecycle rides `LIVE_CLASS_PUZZLE_TOPIC` (`PUZZLE_ASSIGNED` / `PUZZLE_ENDED` server-injected, `LEADERBOARD_DIRTY` sent by a student's client on submit); the leaderboard itself is a polled query. Timed mode + a coach "hide leaderboard from students" toggle live on the assignment row.

- **Pre-class settings** (`live-class-settings.service.ts` / `live-class-preset.service.ts`, routes `API_ROUTES.liveClassSettings` / `.liveClassPresets`): four inheriting layers — system `LiveClassPolicy` singleton → `Batch.liveClassSettings` → `CoachClass.liveClassSettings` → `LiveClassPreset` (copied into the class, never referenced). The **shared resolver + LiveKit grant deriver live in `@nexa-chess/types` (`live-class-settings.ts`)** — `resolveLiveClassSettings`, `deriveLiveKitGrants`, `resolveJoinState`; use them, don't reimplement. Effective config is frozen onto `LiveSession.effectiveSettings` at `startClass` (§snapshot); a null snapshot means "started before this feature" → pre-feature token grants. Settings-change audit rows go to `TrashAuditLog` with `action: "LIVE_SETTINGS_CHANGE"`. **Mid-class change**: `PUT /live-class/:id/live-settings` (`liveClass.updateLiveSettings`, coach-owner/admin) re-persists the class override, refreezes the snapshot, `RoomServiceClient.updateParticipant` + `mutePublishedTrack` for every connected student, then server-injects a `SETTINGS_UPDATE` data packet on topic `LIVE_CLASS_SETTINGS_TOPIC` — `LiveClassSettingsBridge` (rendered in `MeetingRoom` + the board page) feeds it to `LiveClassProvider.applySettingsUpdate` so locks/board default re-derive without a rejoin. Coach UI: `InRoomClassControls` in the meeting Settings panel. **Config surfaces**: coach per-class = `LiveClassSettingsSection` on the class start page; coach personal presets = `/coach/presets`; admin platform defaults + org presets = `/admin/live-class` (`AdminLiveClassSettingsClient`); batch defaults = "Class Settings" tab in the admin `BatchForm` (`BatchLiveClassSettingsTab`). `PresetFormModal` takes a `scope` prop (`"ORG"` is admin-only). Preset authz lives in `live-class-preset.service.ts` (`canManage`: ORG⇒admin, PERSONAL⇒owner; `isSystem` never deletable). **Student pre-join**: `GET /live-class/:id` returns `preClassSettings` (resolved, pre-token) so `PreJoinCard` previews the policy (plain-language summary) and hides the toggle for a `FORCED_OFF` device; the `[roomId]` page auto-joins (skips the card) when `resolveJoinState().autoJoin`, pre-flighting `getUserMedia` and falling back to the card on denial. **Last used**: after a coach saves class settings (either surface), the override is remembered per user in `localStorage` (`settings/lastUsed.ts`) and pre-selected — unsaved, badged, dismissible — on the next class that has no override of its own. It is a convenience only: nothing resolves differently until the coach saves. **Audit surfacing**: `GET /live-class-settings/audit` (admin, `LiveClassSettingsService.getAuditLog`, last 50 `LIVE_SETTINGS_CHANGE` rows with resolved actor/entity names) → `LiveClassAuditLog` on `/admin/live-class`.

---

## 4. Code style

- **TypeScript strict.** No `any` (`@typescript-eslint/no-explicit-any` is `warn` — don't add new ones). Prefix intentionally-unused vars with `_`.
- API: NestJS module/controller/service structure. One feature = one folder with `<x>.module.ts`, `<x>.controller.ts`, `<x>.service.ts`, `dto/`, and `<x>.service.spec.ts`.
- Object keys and imports are generally kept alphabetized in this codebase — match the file you're in.
- Services return the shared response types from `@nexa-chess/types`, mapping Prisma rows through private `toX()` helpers (dates → `.toISOString()`, `Decimal` → `.toString()`, exclude soft-deleted relations).
- Prefer `import type { ... }` for type-only imports.
- Web components: `"use client"` only when needed (hooks, browser APIs, event handlers). Keep `app/**/page.tsx` as server components where possible.

---

## 5. Testing

- API unit tests: Jest + ts-jest, files `*.spec.ts` next to source under `apps/api/src/`. `jest.config.ts` sets `rootDir: src`, path alias `@/` → `src/`. Coverage excludes `main.ts`, `*.module.ts`, `*.dto.ts`.
- Existing specs: auth (`auth.service`, `auth.controller`, `auth.utils`), admin, user, mail, prisma (`prisma.service`, `soft-delete.extension`), attendance calculations.
- `UNIT_TEST_PLAN.md` is the reference test plan.
- When you change API business logic, add/update the co-located spec. Run `npm run test -w apps/api`.
- No web unit tests currently; user-flow coverage is Playwright in `e2e/`.

---

## 6. Deployment & ops (context — don't run these yourself)

- Push to `main` → GitHub Action detects whether `apps/web/**` / `apps/api/**` / `packages/**` changed → SSH to VPS → `scripts/deploy-production.sh <sha> <services>` → `docker compose up -d --build` for the affected services only.
- `scripts/deploy-production.sh` applies `prisma migrate deploy` from the newly built image *before* replacing the running API, so a failed migration aborts the deploy without downtime. `apps/api`'s `entrypoint.sh` also runs it on container start (idempotent; the safety net for manual starts).
- DB backup: `scripts/backup_db.sh` via cron (OCI CLI to object storage). Restore procedure in `docs/DATABASE_RESTORE.md`. Prod-container commands in `docs/PROD_DOCKER_COMMANDS.md`.
- `NEXT_PUBLIC_*` vars are build-time — they must be set before `docker compose build` for web.

---

## 7. The rules that will silently break the build if ignored

1. **New Prisma model → add a getter in `prisma.service.ts`.**
2. **Schema change → generate a migration** (`db:migrate:dev`), never just `db push`.
3. **New/changed endpoint → update `API_ROUTES` and `packages/types`** before touching either app.
4. **New API module → copy the token-string auth pattern** (`getAccessToken` in controller, `getAuthenticatedUser` in service). No guards.
5. **Soft-deletable feature deletes → route through `TrashRepository.softDelete` in a `$transaction`.**
6. **Update the relevant README/doc in the same change** when setup, commands, env vars, or behavior change (project rule in `README.md`).
7. **Table action buttons → `rounded-full` icon template** with `strokeWidth={2.5}`.
8. Reuse `components/ui/` primitives before writing new UI.
9. **Dates: store UTC, localize in the browser.** No `toLocaleDateString`/`toLocaleTimeString`/`new Date(iso).toLocaleString()` in a web component (ESLint blocks it) — use `lib/datetime.ts` + `useUserTimeZone()`. No bound `Date`/`::timestamptz` next to a `timestamp` column in raw SQL — bind `${d.toISOString()}::timestamp`. API serializes with `.toISOString()`, never pre-formats. (`.agents/AGENTS.md` "Date & Time Rule".)

---

## 7b. The autonomous agent system (`.nexa-agent/`)

Not a workspace member (the npm globs are `apps/*` / `packages/*`), and not part
of `npm test`. It orchestrates worker CLI agents that develop this repo on
isolated `agent/<task-id>` branches cut from `dev_vps`.

You will not normally run it, but two things matter if you touch this repo:

- **`dev_vps` is the base branch** those tasks branch from and merge back into,
  and `vps_dev` is the database. The names are near-anagrams of each other and
  are easy to swap by accident.
- **A merge into `dev_vps` only ever happens on explicit human approval**
  (`npm run agent -- approve`). Passing tests are not permission.

Talk to it with `cd .nexa-agent && npm run agent -- chat`. Its own docs are
`.nexa-agent/README.md`; the safety boundary that all of it enforces is
`.nexa-agent/config/SAFETY.md`.

## 8. Where to look first when debugging

| Symptom | Start here |
|---|---|
| 401 loops / session drops | `src/lib/api.ts` interceptor, `auth.service.ts#refresh`, cookie `sameSite`/`secure` in `auth.controller.ts` + `main.ts`, `middleware.ts` |
| "model X does not exist on PrismaService" | missing getter in `prisma.service.ts` |
| Deleted rows still showing / unique constraint on re-create | `soft-delete.extension.ts` relation filters, missing partial unique index |
| Prod missing a table | migration not committed / `db push` was used |
| Web: unstyled HTML or missing `.next/server` chunk | `npm run dev:web:clean` |
| API: missing module from `dist` | `npm run dev:api:clean` |
| Live class attendance wrong | `attendance` module calc + `AttendancePolicy` row, LiveKit webhook parsing in `main.ts` |
| Attendance duration absurdly large locally / `Left: —` beside a real duration | LiveKit webhooks can't reach `localhost`, so `participant_left` never arrives and finalize closes the session itself. `finalizeClassAttendance` clamps every session (open or closed) to the class end and derives `joinedAt`/`leftAt` from the logs — if a duration is still hours long, the raw SQL in `closeOpenAttendanceLogs` must bind the cutoff as `${iso}::timestamp` (the columns are `timestamp WITHOUT time zone` holding UTC; a `Date` param is `timestamptz` and PG shifts it by the box's offset unless the DB runs in UTC) |
| No class audio on a phone / sounds like an earpiece call | `AudioSessionBridge` — `navigator.audioSession.type` routing, the first-tap `room.startAudio()` fallback, and the `<audio>` element sweep. A browser without the Audio Session API can only be fixed by the user's own volume/route |
| A private message reached the wrong person, or a student DM'd a student | `privateChatRecipientAllowed` in `packages/types/src/live-class-moderation.ts` — it gates the API write, the composer, *and* the inbound-packet filter in `ChatProvider`. All three must agree |
| Coach's mute button does nothing | `POST /live-class/:id/moderate` needs the class LIVE and the caller to own it; a `muted: false` response means that source was already off, not a failure |
| Raise hand does nothing (students) | it must ride the `hand_raise` **data channel** (`features/live-class/lib/handRaise.ts` + `HandRaiseBridge`), never `participant.setAttributes` — attributes and metadata share the `canUpdateOwnMetadata` grant, which students are deliberately issued as `false` so they cannot forge the signed `{ role }` metadata. Students do hold `canPublishData` |
| LiveKit webhook rejected (401) | signature check in `attendance-webhook.controller.ts` — every payload is verified, there is no bypass header; the `sha256` claim must be **base64** (see `e2e/fixtures.ts#createWebhookSignature`) |
| Recording won't play / download | `nexa_egress` container up + `./recordings` volume mounted on `api` and `egress`; local files stream via `/live-class/:id/recording/stream` (signed `st` token, 15m), otherwise fall back to OCI (`OCI_*` env still required); `RECORDING_MIN_RETENTION_DAYS` guards auto-prune |
| Recording never produces a file (`StartRoomCompositeEgress` times out) | `docker logs nexa_egress` on boot — "not enough cpu for some egress types" means the node advertises itself as unable to run a composite and *no* node picks the request up. Lower `cpu_cost.room_composite_cpu_cost` in the `egress` `EGRESS_CONFIG_BODY` (this 2-vCPU box uses 1.5) and keep the API's `EncodingOptionsPreset` within it |
| Recording has video tiles but no chessboard | `RECORDING_TEMPLATE_BASE_URL` unset (or unreachable from the `egress` container) → egress falls back to its built-in grid template, which renders published video tracks only. The board is data-channel state, not a track, so it only appears via the custom template at `apps/web/src/app/recorder/[classId]` |
| Recording has video but no audio | `RecorderClient` must `track.attach()` every remote **audio** track to an unmuted, playing element — room-composite egress records the tab's audio output, and the `<video>` tiles are `muted`. Check the `.recorder-audio-sink` div is populated and `--autoplay-policy` isn't blocking egress' Chrome |
| Recorder template films a blank board | the coach never answered `REQUEST_SYNC`. `LiveClassService.requestBoardSyncForRecorder` injects it on topic `board_sync` at 4s and 9s after egress starts; the template joins hidden + subscribe-only so it cannot ask for itself |
| Recording completes but the file isn't on disk | `RECORDING_STORAGE_TARGET` — `local` (default) writes into the mounted volume, `oci` makes egress upload straight to the bucket and the quota / retention prune / storage analytics then see nothing |
| CORS / cookie not set in prod | `CORS_ORIGIN` (comma-separated), `FRONTEND_URL` must be https for `secure` cookies; `COOKIE_DOMAIN` (auto-derives `.registrable.tld` from `FRONTEND_URL`) shares the session across `api.`/`www.` subdomains; `TRUST_PROXY_HOPS` (nginx = 1) for X-Forwarded-* |
| Rate limits reset unexpectedly / not shared | `REDIS_URL` unset (in-memory counters, gone on restart), or `ResilientThrottlerStorage` logged "counting rate limits in-process" — Redis is unreachable and it degraded on purpose rather than 500 every route |
| Queued jobs never run | `REDIS_URL` unset → `QueueModule` logged "background queues are disabled" at boot and every producer hits `createDisabledQueue`. Otherwise check the worker is a provider in a module that imported `QueueModule.registerQueue(<name>)`, and that `QUEUE_PREFIX` matches between producer and worker |
| Type mismatch web↔api | `packages/types` is the single source; rebuild/typecheck both |
| Admin analytics numbers look stale | in-process 5-min cache in `analytics-cache.ts`; hit Refresh (adds `?fresh=1`) or set `ANALYTICS_CACHE_TTL_SECONDS=0`. Storage growth/forecast empty until ~14 `storage_snapshots` rows exist (daily `AnalyticsScheduler` cron, advisory lock `73002050`) |
| Analytics endpoint 403 for an admin | `assertCanViewAnalytics` allows only `ADMIN`/`SUPER_ADMIN`; coaches/students get 403 by design |
| `DAU/WAU/MAU` shows "Data unavailable" | no `analytics_events` rows yet — they accrue from deploy (login / class-join / assignment-attempt / recording-watch) |
| Analytics timezone off by a day | all bucketing goes through `zonedDayBounds`/`zonedMonthBounds` + `date_trunc(... AT TIME ZONE tz)` using the requesting admin's `User.timezone`; check that column |
