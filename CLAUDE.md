# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository. Read this before making changes. Human-oriented conventions live in [docs/PROJECT_RULES.md](docs/PROJECT_RULES.md); non-negotiable rules live in [.agents/AGENTS.md](.agents/AGENTS.md).

---

## 1. What this project is

**Nexa Chess** (package name `nexa-chess`, product name "NexaGen") is a chess-academy platform: batch/class management, live video classes with a synced chessboard, attendance tracking, and role-based dashboards for Super Admin / Admin / Coach / Student.

npm-workspaces monorepo driven by **Turborepo**.

| Workspace | Package | Stack |
|---|---|---|
| `apps/web` | `@nexa-chess/web` | Next.js 14 (App Router), React 18, TypeScript, Tailwind, shadcn-style UI, TanStack Query, Zustand, axios, react-hook-form + Zod |
| `apps/api` | `@nexa-chess/api` | NestJS 11 (Express 5), Prisma 6 / PostgreSQL, JWT auth via HTTP-only cookies, `@nestjs/throttler`, `@nestjs/schedule`, LiveKit server SDK, Cloudinary, Nodemailer |
| `packages/types` | `@nexa-chess/types` | Shared request/response types, Zod schemas, and `API_ROUTES` route registry |
| `packages/config` | `@nexa-chess/config` | Env parsing/validation (`getApiEnv`, `getWebEnv`) with Zod |
| `packages/tsconfig` | `@nexa-chess/tsconfig` | Shared base tsconfig |

Infra: `docker-compose.yml` (web, api, postgres, redis, livekit), self-hosted on an Oracle Cloud ARM64 Ubuntu box. CI in `.github/workflows/deploy-production.yml` waits on `ci.yml` (also run on PRs into `main`/`dev`), then SSHes to the VPS and runs `scripts/deploy-production.sh` on push to `main`.

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
npm run test:integration # API *.int-spec.ts against real Postgres (needs INTEGRATION_DATABASE_URL, see §5)
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
- **Orphaned code from the retired autonomous managers.** Code with no consumer
  and an `NEXA-####` (old `.ai/` manager) or `agent/task_*` (`.nexa-agent/`)
  commit may be half-reverted autonomous output. Both systems were removed
  2026-09-08; leftovers in `apps/**` may remain. Confirm it is actually wanted
  before extending it — deleting it is often the fix.

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
2. **Service** has a private `getAuthenticatedUser(accessToken: string | undefined)` that calls
   **`authenticateUser(this.jwtService, this.prisma, accessToken)` from `auth/authenticate.ts`** —
   the single implementation: missing token / bad or expired signature / non-`access` type /
   user not `ACTIVE` all become a 401 (never the 500 a raw `TokenExpiredError` turns into).
   Pass `{ include: { … } }` as a 4th argument to load relations; `verifyAccessToken` is the
   no-DB variant. **Never hand-roll `jwtService.verifyAsync` for an access token** — the 25
   copies this replaced had drifted (admin/backup skipped the ACTIVE check, Stockfish trusted
   the token's role). The module `*-auth.helper.ts` files re-export it.
3. **Role checks** are private `assertCanX(user)` / inline `if (user.role !== ...) throw new ForbiddenException(...)` helpers in the service.
4. **Row-level visibility** is a private `getXVisibilityWhere(user)` returning a `Prisma.WhereInput` (admins get `{}`, coaches/students get scoped filters). See `batch.service.ts` for the reference implementation.

When adding a new module, **follow this pattern** — do not introduce a guard-based approach unless you are deliberately refactoring all modules and the maintainer agreed. `common/security/route-auth.spec.ts` fails any route handler that never passes its `request` to something (i.e. can't be reading the cookie); a deliberately public route goes on its `PUBLIC_ROUTES` list.

**Two-factor (TOTP)** lives in `auth/mfa/` (`MfaService`, `MfaController`, routes `API_ROUTES.auth.mfa*`, table `user_mfa`). With `MFA_ENCRYPTION_KEY` set, a correct password for an MFA-enabled account — or any account whose role is in `MFA_REQUIRED_ROLES` (default `SUPER_ADMIN,ADMIN`) — returns `{ mfaRequired: "VERIFY" | "SETUP", challengeToken }` instead of cookies; `/auth/mfa/verify` (code or single-use recovery code) or `/auth/mfa/enable` (first enrollment) then finishes the login via `AuthService.completeLogin`. The challenge is a 10-minute JWT of `type: "mfa_challenge"`, so it can never pass as an access token. Secrets are AES-256-GCM encrypted; `lastUsedStep` blocks code replay. Wrong codes are 400 (not 401) so the web client's refresh-and-retry doesn't fire. Students can't enroll. Lost device + no recovery codes: `DELETE FROM user_mfa WHERE "userId" = '…'`, and the next login forces setup again. Changing `MFA_ENCRYPTION_KEY` invalidates every enrolled authenticator.

Cookies: `AUTH_COOKIE_NAMES` = `nexa_access_token` / `nexa_refresh_token` (see `apps/api/src/auth/types/`). Access TTL 15m, refresh 1d (no "remember me") or 7d (remember me). Refresh tokens rotate on every use and are sha256-hashed in `auth_sessions` (bcrypt would only read the JWT's first 72 bytes; old bcrypt rows still verify). A rotation sets `rotatedAt` (claimed atomically); `revokedAt` means logout / password reset / reuse and is **never** revived. Within 30s of a rotation the old token may mint a sibling in the same `familyId` (concurrent tabs); after that a replay revokes the whole family. Logout revokes the family. `getCookieBaseOptions` (`@nexa-chess/config/api`) sets every cookie: `secure` when `FRONTEND_URL` is https, `sameSite` from `COOKIE_SAME_SITE` (default `lax` — web and API are same-site subdomains). **CSRF defence**: `app.setup.ts` `configureApp` (shared by `main.ts` and the integration test app) registers only the JSON body parser (no urlencoded), then defaults a missing body to `{}` (body-parser 2 leaves it undefined; Express 4 didn't), and `common/security/origin-check.ts` rejects a POST/PUT/PATCH/DELETE whose `Origin` (or `Referer`) is not in `CORS_ORIGIN` with 403; webhook paths are exempt. A new webhook route must be added to that exempt list.

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
- **Financial/payroll relations to `User` (and within the payment/invoice/payroll chain) are `onDelete: Restrict`, never `Cascade`** — the 30-day trash purge hard-deletes users, and a cascade would erase invoices and payroll. The purge skips a user with such history (`TrashRepository.findUserIdsWithRetainedHistory`); add any new financial model there.
- To read including deleted rows, pass `includeDeleted: true` in query args (the extension strips it) or use `prisma.withDeleted`.
- **Uniqueness pre-checks MUST use `prisma.withDeleted`.** `users.email`/`users.username` are uniquely indexed across deleted rows, so a filtered read misses the conflict and the write dies with P2002 → unhandled 500. A deleted user's email stays permanently reserved by design (see `docs/PROJECT_RULES.md` §4.6).
- **Timestamps are UTC, stored tz-naive.** `DateTime` columns map to `timestamp WITHOUT time zone` and Prisma round-trips UTC wall-clock through them — consistent *only* while the Prisma ORM is the sole reader/writer. In raw SQL (`$queryRaw`/`$executeRaw`), never put a bound JS `Date` (Prisma sends it as `timestamptz`) or a `::timestamptz` cast next to one of these columns: PostgreSQL coerces through the session timezone, a no-op on a UTC box (prod) but an offset shift everywhere else (any non-UTC dev box). Bind `${d.toISOString()}::timestamp` — the ISO digits are UTC and `::timestamp` keeps them. Analytics bucketing (`date_trunc(... AT TIME ZONE tz)`) depends on this naive-UTC convention. Services serialize dates with `.toISOString()` and never pre-format (Node would use the server's zone — AUDIT H11). See `.agents/AGENTS.md` "Date & Time Rule".

### 3.5 Web data-fetching pattern

Per feature under `apps/web/src/features/<feature>/`:

- `api/<x>Api.ts` — thin functions calling `apiFetch<ResponseType>(API_ROUTES...., { method, body })`. `apiFetch` (`src/lib/api.ts`) is the axios wrapper: `withCredentials`, automatic 401 → refresh → retry with a request queue, global toast on network errors, normalized error messages.
- `hooks/use<X>Api.ts` — `useQuery` / `useMutation` wrappers. Query keys come from the central `src/lib/queryKeys.ts` factory. Mutations `invalidateQueries` on success.
- `components/` — feature components. Page files under `src/app/**` stay thin: a server component that renders a `"use client"` `<XClient />`. **Pages do not check the auth cookie** — `middleware.ts` is the single gate.

**Route RBAC lives in one table, `src/lib/routeAccess.ts`** (`ROUTE_RULES`: `/admin` staff, `/admin/{backups,classes,demo-classes,trash}` SUPER_ADMIN, `/coach` COACH, `/student` STUDENT, `/checkout` `/classes` `/plans` `/profile` `/chess-board` any signed-in user). `middleware.ts` redirects a visitor with no session cookie to `/login?reason=unauthorized`, and a wrong role to their own dashboard — reading the role from the access-token payload *without verifying it* (an expired token still names the role). A refresh-only session has no role cookie, so `SessionBootstrap` applies the same `canAccessPath` once `/auth/me` resolves. It is a routing affordance only; the API enforces every role. **A new protected route = a `ROUTE_RULES` entry + a `matcher` entry in `middleware.ts`**, never a per-page cookie check.

Client session state: `useAuthStore` (Zustand, persisted to `localStorage` key `nexa-auth`, only `user` persisted). `SessionBootstrap` calls `/auth/me` on load.

### 3.6 UI conventions

**Read [docs/UI_RULES.md](docs/UI_RULES.md) before any UI work.** It is the single source for colour tokens (`-ink` for coloured text, no `dark:` colour overrides), radius/shadow tokens, which shared component to use for every control, right-aligned controls, and the pre-PR checklist. The bullets below are the highlights.

- **shadcn/ui-style primitives in `apps/web/src/components/ui/`. Reuse before creating.** Prefer composition over new components. See `README.md` § "UI Component Standards" for the full policy and component list.
- Styling: Tailwind with CSS-variable tokens. Use theme tokens (`bg-app-surface`, `text-app-text`, `text-app-muted`, `border-app-border`, `bg-primary`, `text-primary`, `bg-app-background`, `rounded-app`/`rounded-control`/`rounded-panel`, `shadow-card`/`shadow-soft`). Tokens are defined in `src/styles/globals.css` (`:root` and `:root[data-theme="dark"]`); Tailwind maps them in `tailwind.config.ts`. Dark mode = `[data-theme="dark"]` selector.
- **Data-table action buttons** (Edit/Delete/Archive/Restore/Download) MUST be `rounded-full` icon buttons with `aria-label`, `size="icon"`, and the Lucide icon needs `strokeWidth={2.5}`. **Prefer `RowActions` (`components/ui/RowActions.tsx`)**: it renders them filled in the action's colour (`tone`: default blue / warning saffron / danger red) with a lighter hover, identical in both themes (it uses the `ghost` variant because the `outline` variant's `dark:` overrides would repaint them white). Hand-written action buttons use the same filled classes. The older outlined template is in `.agents/AGENTS.md`.
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

**Cron single-runner: `JobLockService.runExclusive(JOB_LOCKS.x, run)`**
(`prisma/job-lock.service.ts`, global via `PrismaModule`). A lease row in
`job_locks` (DB time, renewed every ttl/3, expires if the process dies), so it
holds no connection while the job runs. **Never use session
`pg_try_advisory_lock` / `pg_advisory_unlock` through Prisma**: the pool can run
the two on different connections, the unlock no-ops and the lock leaks, and the
cron then silently skips on every other connection. Add each new cron's name to
`JOB_LOCKS` (one name per job — two crons once shared id `73002080`). Specs
provide `createJobLockStub()` from `prisma/job-lock.testing.ts`.

**Retention sweep** (`apps/api/src/retention/`): one daily cron (4 AM, job lock
`retention.sweep`) deletes operational rows nothing reads any more, in batches
of 5,000, per `RETENTION_RULES`: expired `auth_sessions` and reset/verification
tokens (+1 day), `processed_webhook_events` (30 days), and `visitor_sessions`
idle 180 days with no lead. Before this, every 15-minute token refresh left a
row behind for good. A new log-style table that only ever grows belongs in
`RETENTION_RULES`. Business and audit records (chat, notifications, message
deliveries, analytics events, payment webhooks) are deliberately excluded —
their retention is a policy decision.

### 3.6c Rate limiting

`ThrottlerModule.forRootAsync` in `app.module.ts` (global `APP_GUARD`, 100/min;
auth routes 5/min, password reset 3/min). The guard is `UserThrottlerGuard`
(`common/throttler/user-throttler.guard.ts`): a request with a valid access
token counts against `user:<id>`, so a classroom behind one NAT IP doesn't share
one budget; anonymous requests and every `/auth/*` route stay keyed by IP. Counters go to Redis when `REDIS_URL`
is set so they survive a deploy, via
`common/throttler/throttler-storage.factory.ts` +
`ResilientThrottlerStorage`, which falls back to in-process counting (with a 10s
cooldown) if Redis fails — the guard is global, so a throwing storage would 500
every route. The client uses `buildRequestPathConnection` (fail-fast:
`enableOfflineQueue: false`, `commandTimeout: 1000`), **not** the queue's
connection, whose `maxRetriesPerRequest: null` is the opposite policy. Keys are
namespaced `<QUEUE_PREFIX>:throttle:` — ioredis applies `keyPrefix` to the
storage's Lua `eval` KEYS.

### 3.6d Outbound WhatsApp

`apps/api/src/whatsapp/` — `WhatsAppModule` exports `WhatsAppService` (Meta
Cloud API). Optional like the queues: unset `WHATSAPP_ACCESS_TOKEN` /
`WHATSAPP_PHONE_NUMBER_ID` ⇒ `isConfigured()` false and a send throws
`ServiceUnavailableException`. `sendText` only lands inside the 24h
customer-service window — outside it use `sendTemplate` with a template approved
in WhatsApp Manager. Numbers normalize to E.164 digits with no `+`
(`WHATSAPP_DEFAULT_COUNTRY_CODE` expands a national number); an unresolvable one
is a `BadRequestException` and no request goes out. **One network attempt per
call** — retries belong to a BullMQ job, which should branch on
`WhatsAppSendError.retryable`. `trySendText` / `trySendTemplate` / `sendTextToMany`
return outcomes instead of throwing, for paths that must survive WhatsApp being
down. See README § "WhatsApp Messaging".

### 3.6d2 Error reporting (Sentry)

`@sentry/nestjs` (API) + `@sentry/nextjs` (web), hosted Sentry, one project per
app. **Optional**: unset `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` ⇒ `init` never
runs and nothing is sent. Errors only — no tracing, replay or logs.

- **API**: `src/instrument.ts` is the first import in `main.ts` (Sentry must patch
  http/express before they load). It reads `SENTRY_*` itself — `getApiEnv()` must
  not be called there, because `apps/api/.env` is otherwise only loaded later by
  Prisma. `SentryGlobalFilter` (`APP_FILTER`) reports unexpected errors only; any
  `HttpException` (4xx, a deliberate 503) is skipped. Cron, `@OnEvent` and BullMQ
  processor failures are captured by the SDK automatically.
- **Web**: `src/instrumentation.ts` (server + edge, `onRequestError`),
  `src/instrumentation-client.ts` (browser), `app/global-error.tsx`. Options are
  in `lib/sentry.ts`. `next.config.mjs` imports `withSentryConfig` from
  `@sentry/nextjs/config` (not the package root in v11), uploads source maps only
  when `SENTRY_AUTH_TOKEN` is set at build, and tree-shakes tracing.
- **Privacy (students are minors)**: SDK v11 collects bodies, cookies, query
  params, local variables, DB query data and job args **by default**, so both
  apps set a restrictive `dataCollection` *and* scrub in `beforeSend` /
  `beforeBreadcrumb` (`common/sentry/sentry-scrub.ts`, `lib/sentry.ts`): only
  `user.id` + a `role` tag, no query strings (they carry signed tokens). Never
  `setUser` with an email/name, and never loosen `dataCollection` without
  checking the privacy policy.
- The user id is set in `authenticateUser` (API, request-scoped) and
  `SessionBootstrap` (web). `SENTRY_RELEASE` = the commit SHA, exported by
  `scripts/deploy-production.sh`.

### 3.6e Admin messaging rules

`apps/api/src/messaging/` + `apps/web/src/features/messaging/`, page
`/admin/messaging`, routes `API_ROUTES.messaging.*` / `.announcements.*`. One
`MessagingRule` row per `MessagingEvent` (10 events; `CLASS_REMINDER` and
`CLASS_REMINDER_COACH` are the two sides of the same moment, each with its own
lead time, channels and copy, swept separately in `messaging.scheduler.ts`) holds enabled + per-channel
toggles (WhatsApp / in-app) + audience + lead time + `{{placeholder}}` templates.
**The catalogue, defaults and renderer live in `@nexa-chess/types`
(`messaging.ts`)** — `MESSAGING_EVENT_DEFINITIONS`, `DEFAULT_MESSAGING_RULES`,
`renderMessageTemplate`, `findUnknownTemplateVariables`, `sampleVariablesFor`;
use them, don't reimplement, or the admin preview stops matching the send.

- **`MessagingDispatchService.dispatchInBackground(request)` is the only entry
  point** a feature service calls. It never throws — messaging must not fail
  class creation. Add a new trigger by extending `DispatchRequest` + its
  `resolveRecipients` branch, never by calling WhatsApp/Notification directly.
- **Dispatch queues; it does not send.** It writes PENDING `message_deliveries`
  rows (body/title/template params rendered *at queue time*) and
  `MessagingDeliveryWorker` (`@Cron(EVERY_MINUTE)`) delivers them: claim with
  `FOR UPDATE SKIP LOCKED` + `claimedAt`, send, then SENT / retry-with-backoff
  (`nextAttemptAt`, cap `MESSAGE_MAX_ATTEMPTS`) / FAILED. Only a `retryable`
  provider failure is retried. **The claim SQL binds `${iso}::timestamp`, never
  a `Date`** — these are `timestamp WITHOUT time zone` columns (§3.4).
- **Send timing is per recipient**: `computeScheduledFor` (messaging.schedule.ts)
  resolves a rule's DAILY/WEEKLY wall-clock time in the recipient's own
  `User.timezone`, DST-corrected. Lead-time events bypass it — `usesLeadTime`.
- `MessagingRuleService.getRule` seeds a missing row from the shared defaults, so
  no seed migration is needed. `NotificationType` (Prisma + zod) mirrors
  `MessagingEvent` — adding an event means adding to both enums.
- The outbox row IS the idempotency guard: `dedupeKey` is unique per
  `(channel, key)` and the row is written before any send, so a repeated sweep
  collides on insert (P2002 → "already queued") instead of racing a send. The
  two lead-time crons in `messaging.scheduler.ts` also take job locks
  (§3.6b).
- `INVOICE_ISSUED` ships **enabled, in-app only**, and is the one event that can
  carry an attachment: `DispatchRequest` takes an optional `document`
  (`mediaId`/`link`/`filename`) which the CALLER resolves — dispatch persists it
  onto `message_deliveries` and the worker sends it as a WhatsApp document.
- `ASSIGNMENT_DUE_SOON` + `ASSIGNMENT_GRADED` ship **enabled, in-app only** —
  they absorbed the old unconditional notifications (`NotificationScheduler` is
  deleted; `assignment-attempt.service` now dispatches instead of notifying).
- Announcements (`apps/api/src/announcement/`) publish the feed row then fire the
  ANNOUNCEMENT rule; **the announcement's own audience picks recipients**, not
  the rule's. `student.service` filters the dashboard feed by that audience.

### 3.6f Payments (Razorpay / Cashfree / Stripe)

`apps/api/src/payments/` + `apps/web/src/features/payments/`, pages
`/plans`, `/checkout/[planId]`, `/student/billing`, `/admin/payments`, routes
`API_ROUTES.payments.*` / `.adminPayments.*`. Provider-agnostic and UPI-first
for India.

- **Business logic talks to `PaymentService` and nothing else.** It asks
  `PaymentRouterService` for a gateway; the router answers from the
  admin-editable config. **Never import a provider adapter outside
  `payments/providers/`** — no provider status string may exist past that folder.
- **The shared contract lives in `@nexa-chess/types` (`payments.ts`)**:
  `PaymentStatus` + `PAYMENT_STATUS_RANK` + `canTransitionPaymentStatus`,
  `resolvePaymentProvider`, `DEFAULT_PAYMENT_ROUTING`, `formatMoney`,
  `toMinorUnits`/`toMajorUnits`. The admin routing preview calls the *same*
  `resolvePaymentProvider` the server does, so the two cannot drift.
- **Money is always integer minor units** (paise, cents) — `Int` columns, never
  a float or Decimal. `toMinorUnits` is the only major→minor conversion, and
  Cashfree (which speaks rupees) converts at its adapter boundary only.
- **`applyProviderState` is the single state funnel.** Webhooks, the client's
  `verify` callback, the "Check payment status" button and the reconciliation
  cron are four doors into one transactional room. It applies the rank guard, so
  a stale `PENDING` redelivered after a capture — or a `FAILED` for a sibling
  attempt — cannot un-pay anything. A captured amount that differs from the
  order parks the payment at `PROCESSING` with `failureCode: amount_mismatch`
  rather than granting.
- **Access is an `Entitlement` row, never a gateway status (§21).** Provider →
  verification → payment → order → entitlement → access.
  `EntitlementService.grant` runs inside the capture transaction and is
  idempotent on the unique `(orderId, planId)`; batch enrolment is an `upsert`
  (BatchStudent is soft-deletable and its unique key spans deleted rows).
  **Nothing else in the codebase may enrol a student off a payment.**
- **Double-payment protection is the unique index on `orders.idempotencyKey`**,
  not a check-then-insert. The web client holds one key per plan in
  `sessionStorage` (`features/payments/lib/checkoutKey.ts`), so a double click,
  refresh, back-navigation or second tab replays it and the server returns the
  original order.
- **A retry is a new `PaymentAttempt` on the same `Order`.** `retry` reconciles
  first and refuses while anything is in flight. §17: a provider is only
  excluded from re-routing once its attempt reached a settled failure, and
  `failoverEnabled` is **off by default** — never re-route while it is unclear
  whether money moved.
- **Webhooks are public but never trusted.** `/payments/webhooks/{razorpay,
  cashfree,stripe}`; `main.ts` mounts `express.text` on those three paths so the
  raw bytes survive for signature verification — **do not let a JSON parser
  claim them**. The unique `(provider, eventId)` on `payment_webhook_events` is
  the idempotency guard (a redelivery collides on insert); an unsigned payload
  is persisted for audit and then rejected, and a handler failure marks the row
  FAILED for the 10-minute recovery sweep rather than asking the provider to
  retry forever.
- **A refund is never SUCCEEDED because the API accepted it (§14)** — only a
  webhook or a reconciliation read settles it. A *transport* failure leaves it
  PENDING, deliberately: the gateway may have taken it, and marking it failed
  invites a second refund.
- Invoices are issued inside the capture transaction, numbered gaplessly from
  `InvoiceSequence`, and rendered as printable HTML (no PDF dependency on the
  ARM box). Line items are copied, so a later plan rename never rewrites a
  receipt someone already downloaded.
- Payment messaging rides the existing rules: `PAYMENT_RECEIVED`,
  `PAYMENT_FAILED`, `REFUND_PROCESSED`, `SUBSCRIPTION_RENEWAL_FAILED` ship
  **enabled, in-app only** via `MessagingDispatchService`. Every figure is read
  back from the payment row, so a caller cannot assert an amount.
- **A batch's price IS a `Plan` row carrying its `batchId`** — there is no second
  pricing model. `BatchPricingService` + the "Pricing" tab in the admin
  `BatchForm` are how an admin sets what a batch costs, and a batch may hold
  several options at once (a monthly subscription beside a one-time fee). Plan
  codes are generated from the batch name + interval, never typed.
- **A recurring plan opens a mandate, not a charge.** `createCheckout` branches
  on `isRecurringInterval(plan.interval)` into `SubscriptionService.start`, and
  the router is passed `recurring: true` so only a gateway that can actually
  mandate that method is a candidate. The provider bills each cycle; we mirror
  its state from webhooks and never charge on our own clock.
- **Discounts are the ONE mechanism that changes what someone pays.** A launch
  code, a UPI-only offer and a batch deal are the same `Discount` row with a
  different scope (`planIds` / `batchIds` / `methods`). The arithmetic is
  `computeDiscount` in `@nexa-chess/types`, shared with the checkout preview.
  **Tax is charged on the DISCOUNTED subtotal** — taxing the list price would
  overcharge. A code is re-resolved server-side at checkout; the client's figure
  is never trusted, and an invalid one is simply not applied rather than
  refusing the purchase.
- **A code is consumed at CAPTURE, not at checkout** — `DiscountService.redeem`
  runs in the capture transaction, idempotent on the unique `orderId`, so an
  abandoned cart never burns a limited code and a replayed webhook never
  consumes a second use.
- **Per-method switches live in `PaymentRoutingConfig.methodSettings`** (a
  *partial* record — an absent method is enabled, so adding one never silently
  disables it). `isMethodEnabled` gates the router AND the picker, so one switch
  takes a method out everywhere. A plan's `allowedMethods` then narrows further;
  it can restrict but never widen.
- **None of these models are soft-deletable** and none are Trash-registered — a
  financial record is never trashed. Plans archive (`isActive: false`) instead.
- Every gateway is optional. Unset credentials ⇒ that adapter reports
  `isConfigured()` false, the router skips it, and the checkout screen stops
  offering the methods only it could serve. With none configured the API still
  boots and a checkout attempt is a clean 503.
- **Manual / offline payments (cash, a coach's personal UPI/GPay, bank
  transfer) are tracked the same way without a gateway.**
  `apps/api/src/payments/manual-payment.service.ts` builds an ordinary
  `Order` + `Payment` (`provider: MANUAL`, never routed to by
  `PaymentRouterService` or given a provider adapter) and reaches `PAID`
  through the SAME `PaymentService.applyProviderState` funnel a gateway
  capture uses — same entitlement, same invoice, same `PAYMENT_RECEIVED`
  message. Admin → Payments → "Manual payments" (`ManualPaymentsPanel.tsx`);
  coach → Payments (`/coach/payments`, `CoachManualPaymentsClient.tsx`),
  scoped to their own batches via `BatchCoach`/`BatchStudent`. **A coach's
  record is `PENDING` until an admin approves it** (`ManualPaymentRecord`,
  its own approval workflow, not soft-deletable/Trash-registered like the
  rest of this module) — **an admin's own record is auto-approved**. The
  offline method itself (Cash, UPI/GPay, …) is an admin-managed catalogue
  (`OfflinePaymentMethod`, seeded lazily on first read), not hardcoded. An
  optional proof-of-payment attachment (screenshot or PDF) is stored the
  same private/authenticated way as an invoice PDF
  (`manual-payment-attachment.storage.ts`) and streamed back through the API.
  **Never refundable through this system** — `verify`/`reconcile`/`retry`
  and `RefundService.create` all reject provider `MANUAL` with a clear error
  instead of the opaque "no adapter registered" a bare `ProviderRegistry`
  lookup would otherwise produce. The shared `PaymentSource` type
  (`RAZORPAY | CASHFREE | STRIPE | MANUAL`, in `packages/types/src/
  payments.ts`) is deliberately kept separate from the narrower
  `PaymentProvider` (the 3 routable gateways) — only fields that reflect an
  actual stored payment/refund/subscription widen to `PaymentSource`;
  routing, checkout handoff and gateway health stay on `PaymentProvider` and
  never see `MANUAL`.

### 3.6g Invoices, PDFs and credit notes

`apps/api/src/payments/invoice*.ts` + `credit-note.service.ts` +
`billing-profile.service.ts`, `apps/web/src/features/invoices/`, pages
`/student/billing/invoices/[id]` and `/admin/finance/invoices`, routes
`API_ROUTES.invoices.*` / `.adminInvoices.*`.

- **The line item names what was actually bought.** `describePurchase`
  (payment.service.ts) builds it from the plan name + the batch the plan prices
  + the billing interval — a batch plan is usually named "Term fee", which alone
  tells a parent nothing. It is copied onto the invoice, so a later plan rename
  never rewrites an issued receipt, and it is **deliberately defensive**: it runs
  inside the capture transaction, so a missing field costs a nicer label, never
  the payment.
- **An invoice is a frozen snapshot.** `InvoiceService.issue` copies the lines,
  the buyer's billing identity, the seller's registered details and the whole
  tax split onto the row inside the capture transaction. Nothing is resolved by
  joining a live plan, profile or settings row afterwards — a receipt downloaded
  a year ago must render identically today. Idempotent on the unique `orderId`.
- **The tax engine lives in `@nexa-chess/types` (`invoices.ts`)** —
  `resolveTaxTreatment`, `computeTax`, `computeCreditBreakdown`,
  `sumInvoiceLines`, `formatDocumentNumber`, `isValidGstin`,
  `stateCodeFromGstin`. Use them, don't reimplement, or the admin preview stops
  matching the issued document. **Never assume CGST+SGST or IGST**: the
  treatment is derived from the seller's and buyer's place of supply, and a sale
  abroad is a zero-rated export whatever the plan's rate says. Tax is charged on
  the **discounted** subtotal.
- **PDF generation NEVER touches the payment (§20).** It runs after the capture
  commits, on the BullMQ `invoice` queue. A failure sets `pdfStatus: FAILED` and
  leaves the financial `status: PAID` alone; `sweepFailedGenerations` (10 min,
  job lock `invoice.pdf-sweep`) retries, and a download of a missing archive
  re-renders on the spot. Do not move generation into the capture transaction.
- **The queue is a nudge, not the source of truth.** `pdfStatus` + the sweep is
  what guarantees a PDF exists; BullMQ just means a restart mid-render does not
  lose the work. With `REDIS_URL` unset the service renders **inline** rather
  than letting `createDisabledQueue` drop the job. **A `jobId` must not contain
  a colon** — BullMQ joins its Redis keys on `:` and rejects one ("Custom Id
  cannot contain :"), which silently breaks every enqueue; the helpers in
  `invoice-queue.ts` use `--`.
- **WhatsApp delivery goes through `MessagingDispatchService`, never
  `WhatsAppService` directly** (§3.6e). The `INVOICE_ISSUED` rule carries it.
  The PDF is uploaded to Meta at dispatch time and the media handle is stored on
  the outbox row, so the delivery worker attaches a real document rather than a
  link — and the worker never has to reach back into the payments module to
  build one. Upload only happens when the rule actually enables WhatsApp; a
  failure degrades to the link. The message is addressed to the invoice's
  `billingPhone` (the parent), not the account's number.
- **pdfmake, not headless Chrome** (`invoice-pdf.service.ts`). Egress' Chromium
  already competes for this box's two vCPUs. pdfmake's table paginates itself
  and its bundled Roboto has real ₹ / € / £ / • glyphs — no extra font ships.
- **Storage is private and optional.** Cloudinary `type: "authenticated"`,
  `resource_type: "raw"`. There is no permanently-public URL for a financial
  document, and downloads always stream through the authenticated API route.
  With `CLOUDINARY_*` unset nothing is archived and PDFs render on demand.
- **A refund never edits an issued invoice (§19).** `recordRefund` only moves
  `amountRefunded` + `status`; the reversal is a separate numbered `CreditNote`,
  idempotent on the unique `refundId`, with tax reversed proportionally.
- **The invoice email is claimed before it is sent.** `emailSent` is set by a
  conditional `updateMany` *before* the send, so two redelivered webhooks
  produce one email; a failed send releases the claim for the retry sweep.
- **Billing identity is its own row.** A student is usually paid for by a
  parent, so `BillingProfile` → `StudentProfile.parent*` → the account is the
  resolution order. Never bill a student invoice to the student's own profile
  without checking.
- **Business details are `InvoiceSettings`, never template constants** — a
  singleton seeded from the legacy `PAYMENTS_*` env vars on first read, edited
  at Admin → Invoices → Billing & invoicing.
- `Invoice`, `CreditNote`, `InvoiceSettings`, `InvoiceAuditLog` and
  `BillingProfile` are **not soft-deletable** and not Trash-registered — a
  financial record is never trashed.

### 3.6h Chess board appearance

`apps/api/src/chess-appearance/` + `apps/web/src/features/chess-appearance/`,
pages `/chess-board` (any role, personal preference) and
`/admin/chess-appearance` (admin, global default), routes
`API_ROUTES.chessAppearance.*`. Centralizes the visual appearance of every
chessboard in the app — board theme, piece set, coordinates, animation,
highlight/legal-move/check toggles — behind one resolver, so no board
component hardcodes its own styling.

- **Same 3-layer resolver shape as pre-class settings** (§3.7's
  `resolveLiveClassSettings`): system default (Nexa Classic) → admin global
  default (`ChessAppearanceSettings` singleton) → the caller's own
  `UserChessAppearancePreference` row, last non-empty layer wins.
  `resolveChessAppearance` + `BOARD_THEME_CATALOG` / `PIECE_SET_CATALOG` live
  in `@nexa-chess/types` (`chess-appearance.ts`) — use them, don't reimplement.
- **A preference save merges onto the caller's existing stored override**,
  never replaces it wholesale (`mergeChessAppearanceOverrides`). A
  single-field patch — the live board's `C` keyboard shortcut for
  coordinates, say — must not silently erase a different field the user set
  from the settings page. Applies to both the user and admin update paths.
- **Board themes are self-authored CSS**, not images: a checkerboard from two
  stacked `linear-gradient`s plus an optional wood-grain layer, parameterized
  by `--nexa-*` CSS custom properties scoped under
  `[data-nexa-board-theme="<id>"]` (`features/chess-appearance/styles/boards.css`).
  Lichess's own board textures are photographic with no documented license,
  and a screenshot/photo background is explicitly ruled out — real interactive
  squares only. Coordinates are drawn inside the edge squares, lichess-style
  (ranks top-right of the right column, files bottom-left of the bottom row),
  each in the opposite square's `--nexa-light`/`--nexa-dark` colour — so a new
  theme needs no coordinate colour of its own.
- **Piece sets are vendored SVGs from lichess's open-source piece library**
  (github.com/lichess-org/lila), filtered to commercially-safe licenses —
  most lichess sets are CC BY-NC-SA (non-commercial) and were excluded.
  Attribution: `apps/web/public/chess/pieces/LICENSES.md`. Scoped the same
  way, under `[data-nexa-piece-set="<id>"]`
  (`features/chess-appearance/styles/pieces.css`), referenced by file URL
  (not inlined) so the browser only fetches a set once it actually renders.
- **Every chessboard reads from `useChessAppearance()`**
  (`ChessAppearanceProvider`, mounted once in `AppProviders.tsx`;
  CSS imported once via `features/chess-appearance/styles/index.css`), not
  hardcoded values: `ChessgroundBoard`, `PracticeBoard`, `PositionEditor`,
  `PuzzleBoardTile`, `PgnBoardViewer`, `SolutionEditor` (via `PracticeBoard`),
  and the recorder template (`RecorderClient`, which has no authenticated
  user, so always resolves to the system/admin default). **Purely cosmetic**:
  never affects FEN/position/moves/puzzle solution/game state, and — like
  board theme picks generally — is deliberately **not** synced over any
  `LIVE_CLASS_*` data-channel topic, so each participant keeps their own
  appearance independent of the coach's.
- **`ChessAppearancePreviewScope`** shadows the app-wide context with draft
  values for its subtree, so a settings page's live preview (a real, movable
  `PracticeBoard`) updates immediately as the form changes, with no special
  "preview mode" plumbing in any board component.
- **Disabling a built-in theme is the only lifecycle action** — admin can
  never delete one (`ChessAppearanceSettings.disabledBoardThemeIds` /
  `.disabledPieceSetIds`). A disabled theme disappears from both picker UIs;
  a user who already had it selected keeps rendering it unchanged.
- `ChessAppearanceSettings` and `UserChessAppearancePreference` are **not
  soft-deletable** and not Trash-registered — cosmetic, not an audit-worthy
  record.

### 3.6i Coach feedback & ratings

`apps/api/src/feedback/` + `apps/web/src/features/feedback/`, pages
`/admin/feedback` and `/coach/feedback`, routes `API_ROUTES.feedback.*` /
`.adminFeedback.*`. Admin-authored `FeedbackForm`s (questions as a JSON array of
`FeedbackQuestion` with stable ids) decide **when** a student is asked
(`trigger`: `AFTER_CLASS` every Nth attended class per coach / `RECURRING` every
N days per coach / `ONE_TIME`) and **where** (`placements`: `CLASS_END` on
`ClassSummary`, `DASHBOARD_POPUP`, `DASHBOARD_CARD` — both on `/student`).

- **Pending is computed, never stored.** `computePendingFeedback`
  (`feedback-pending.util.ts`, pure + unit-tested) derives open requests from
  live forms, the student's attended COMPLETED batch classes and existing
  responses. `contextKey` names what a response answers: `class:<id>`,
  `period:<n>`, `once`.
- **Submit/skip never trust the client's target** — `resolveOwnCandidate`
  recomputes pending and requires an exact match. The unique
  `(formId, studentId, coachId, contextKey)` is the double-submit guard (P2002 →
  409).
- `FeedbackAnswer` snapshots the question label/type at submit time;
  `FeedbackResponse.overallRating` is the mean of its RATING answers, and the
  coach rating is the mean of those. Coaches only see responses from
  `showToCoach` forms, with the student stripped (`toResponseDto(row, true)`).
- A form with responses cannot be deleted (FK is `Restrict`) — it is
  deactivated. None of these models are soft-deletable or Trash-registered.
- Shared types, labels and `averageRating` live in `@nexa-chess/types`
  (`feedback.ts`).

### 3.6j Fonts & text size (typography)

`apps/api/src/typography/` + `apps/web/src/features/typography/`, pages
`/admin/typography` (admin, platform default) and the "Text & fonts" section on
`/profile` (any role, personal), routes `API_ROUTES.typography.*`.

- **Same 3-layer resolver as chess appearance** (§3.6h): system default
  (Outfit headings + Nunito Sans body, "Default" size) → admin
  `TypographySettings` singleton → the caller's `UserTypographyPreference`.
  `locked` on the singleton skips the user layer and refuses personal saves.
  `resolveTypography`, `mergeTypographyOverrides`, `FONT_CATALOG` and
  `TEXT_SCALE_FACTORS` live in `@nexa-chess/types` (`typography.ts`).
- **Fonts are OFL Google Fonts loaded by `next/font`** in `app/fonts.ts`, one
  loader per `FONT_CATALOG` id, each exposing `--font-<id>` on `<html>`. Only the
  two defaults preload. **Adding a font = add it to `fontIdSchema` +
  `FONT_CATALOG` AND a loader in `app/fonts.ts`** — the id is the CSS variable
  suffix, so the two must match.
- **Applied by repointing CSS variables, not by component props.**
  `--font-heading` / `--font-body` / `--text-scale` on `<html>`;
  `--font-sans` (Tailwind `font-sans`, the body default) and `--font-display`
  (`font-display` utility, every `h1`–`h6`) derive from them, and
  `html { font-size: calc(100% * var(--text-scale)) }` scales every rem size.
  Arbitrary `text-[13px]` values do **not** scale — prefer rem-based sizes.
  `TypographySync` (in `AppProviders`) applies the resolved config and caches it
  in `localStorage` `nexa-typography`, which the pre-paint script in
  `app/layout.tsx` reads so there is no font flash on reload.
- Neither model is soft-deletable or Trash-registered (cosmetic).

### 3.6i2 Puzzle-set assignments (multi-puzzle homework)

`activityType: PUZZLE_SET` on the existing `Assignment` (README § Features has
the routes). The set is ordered `AssignmentPuzzle` rows that **reference**
library puzzles (Cascade on a Trash purge, like `PuzzleAttempt`), each with its
resolved `PuzzleScoring` frozen at save. Students solve through ordinary
`PuzzleAttempt`s (`context: ASSIGNMENT`, `studentAssignmentId`), so
`PuzzleAttemptService` stays the only puzzle attempt engine — it calls
`AssignmentPuzzleSetService.startContext` / `refreshRollup` /
`assertHintsAllowed` for those attempts, and an assignment admits its puzzles
without the library visibility check.

- **Points are never stored.** `computePuzzleSetResults`
  (`assignment/puzzle-set-results.util.ts`, pure + specced) takes each puzzle's
  best finished try (ABANDONED never counts), sums them, ranks, and
  `studentLeaderboardView` applies the set's leaderboard options server-side.
  `refreshRollup` *recomputes* the `StudentAssignment` columns — never
  increments — so a replayed submit can't double-count.
- Authoring rules (`resolvePuzzles`): published only; an admin set (a shared
  library item) holds GLOBAL puzzles only; a coach may add GLOBAL or their own
  PRIVATE ones.
- One open attempt per (studentAssignmentId, puzzleId) is a hand-written partial
  unique index (migration `20261011100000`), and `submit` claims the attempt
  with `updateMany where status = IN_PROGRESS` (409 on a second submit).
- Web: `features/assignments/components/puzzle-set/*` — `PuzzleSetEditor`
  (form), `PuzzleSetResults` (coach dialog), `StudentPuzzleSet` +
  `AssignmentPuzzleSolver` (reuses `usePuzzleAttempt` with the set's start
  route) + `PuzzleSetLeaderboard`.
- **Assigning from the library is a PUZZLE_SET** — one puzzle or many, it is
  the same referenced set (never a copied SOLVE_LINE). Two doors, one dialog:
  "New assignment" opens on a source choice (Academy Library puzzles vs. build
  an activity), and the Puzzle Library has row checkboxes (selection kept
  across tabs/pages, in pick order) + a per-row and bulk "Assign" that open
  `AssignmentFormDialog` with `initialPuzzles` (assign-now on, title/difficulty
  prefilled). `assignBlocker` in `PuzzleLibraryClient` mirrors the API rule:
  published only, and an admin's set global only. `PuzzleQuickPreviewDialog`
  (board + stepped solution + tags) serves both. Targets are still batches
  only — there is no per-student or group deployment.
- **Homework-approved folders** (Super Admin only, academy-wide): approval is
  `PuzzleTopic.homeworkApprovedAt/ById` — on the folder, never per coach, so a
  coach who joins later is covered and adding coaches resets nothing. Routes
  `API_ROUTES.puzzles.topicHomework` (GET set / PUT approve / DELETE revoke;
  `PuzzleTopicService` → `AssignmentPuzzleSetService.folderHomework`). One rule,
  `folderHomeworkBlocker` in `@nexa-chess/types`: approved, not a system folder,
  no live subfolders, 1–`MAX_ASSIGNMENT_PUZZLES` live PUBLISHED GLOBAL puzzles
  filed directly in it. The API applies it on approve, on `create` with
  `sourceTopicId` (the server takes the puzzles — a client `puzzleIds` beside it
  is a 400) and on **every `deploy`** of a set with `Assignment.sourceTopicId`
  (403 once revoked). Editing such a set's puzzle list detaches it (sets
  `sourceTopicId` null). Web: the Homework column in `TopicManager` (Super Admin
  approve/revoke, on `/admin/puzzles` — `/coach/*` is COACH-only) and
  `AssignFolderDialog` in `PuzzleLibraryClient` (coach, `/coach/puzzles` Topics
  tab) → `AssignmentFormDialog` with `sourceFolder`.

### 3.6j1 Class timing rules (start window, upcoming / past, not held)

`@nexa-chess/types` `class-availability.ts` is the one place that decides where
a class sits in time — use it, don't re-derive from `status`:
`resolveClassDisplayStatus` (adds `NOT_HELD` = SCHEDULED whose `endsAt` passed;
the stored status is never rewritten), `isUpcomingClass` / `isPastClass`
(cancelled is never upcoming, and past only once its date arrives),
`getClassStartAvailability` (start allowed from `CLASS_EARLY_START_MINUTES`
before `startsAt` until `endsAt` — `LiveClassService.startClass` enforces it,
since ending a class is what marks it COMPLETED) and `canJoinClass` (LIVE /
IN_PROGRESS only). Web: `ClassStatusBadge` takes `endsAt` to show "Not held";
calendars use `CLASS_STATUS_DOT` + `ClassStatusLegend`. `/classes/:id` renders
`StudentClassDetailsClient` (`GET /student/classes/:id`) for students and
`StaffClassDetailsClient` for coach/admin. Batch dates bound their sessions —
`common/batch-dates.ts` (schedules, regeneration, class requests, and
narrowing a batch's dates cancels the future SCHEDULED sessions outside them).

### 3.6j2 Batch type & dashboard upcoming classes

`BatchType` (`GROUP` / `INDIVIDUAL` / `BUDDY`, `@nexa-chess/types`
`batch-type.ts`) resolves in three layers via `resolveBatchType`: roster size
(1 → Individual, 2 → Buddy, else Group) → `Batch.batchType` (admin, BatchForm
"Batch Type") → `CoachClass.batchType` (one class only, coach). Both columns are
nullable; null inherits. The coach sets/clears a class's override through the
existing `PATCH coach.updateClass` (`batchType: null` clears) — it never writes
the batch or sibling classes.

- **Coach `/coach`**: "Latest Upcoming Classes" (`features/coach/components/upcoming/`)
  = `GET coach.upcomingClasses?limit=3` (same not-over/`SCHEDULED|LIVE` rule as the
  schedule page; `CoachClass` now carries `students`, `level`, `batchType*`). Inline
  topic + class-type edits go through `useUpdateUpcomingClass` (immediate + Undo).
  `StartClassButton` reuses `useStartLiveClass` + redirect, with a confirm when
  starting more than 15 min early.
- **Student `/student`**: `nextClasses` on the dashboard payload (next three not
  over, a live one included). `upcomingClasses` is unchanged — `/student/live-classes`
  still reads it. Join is enabled only while the class is `LIVE`/`IN_PROGRESS`.

### 3.6k Demo classes (guest access, invites, static schedules)

`apps/api/src/demo-class/` (`DemoInviteService`, `DemoScheduleService`) +
`AdminService` demo methods + `LiveClassDemoService.getDemoInfo`/`joinDemoClass`;
web `features/admin/components/DemoClass*` + `demo-classes/*`, public page
`app/demo/[classId]`; routes `API_ROUTES.admin.demoClass*` / `.demoSchedule*`,
`API_ROUTES.liveClass.demoInfo` / `.demoJoin`. Super-admin only (admin side).

- **A guest is a `DemoClassRegistration`, not a user.** One row per
  `(classId, contactMethod, contactValue)`; `contactValue` is the normalized
  phone (`WhatsAppService.normalizeRecipient`, so `98765…` and `+91 98765…`
  match) or lowercased email. **Any existing row admits its contact in every
  access mode** — an invite, a lead booking, or an earlier self-registration.
- **Access mode** (`CoachClass.demoAccessMode`): `PUBLIC` / `PASSCODE`
  (`demoPasscode`, stored readable so the admin can share it; compared
  case-insensitively in constant time) / `INVITE_ONLY`. The mode only gates a
  *new* registration. An uninvited guest of an `INVITE_ONLY` class is **never
  turned away**: their row is `approval: PENDING` and appears in the room's
  existing waiting-room list as `studentId: "guest:<registrationId>"`, so the
  coach admits/denies with the same People-panel UI (`resolveWaitingRoomEntry`
  branches on the prefix). `POST .../demo/:id/join` is throttled to 20/min.
- **Personal invite links**: every admin-added guest (lead or new invitee) gets
  a unique `inviteToken`; `/demo/<classId>?invite=<token>` admits them with no
  typing. The phone/email is the fallback. Invitations go out by email /
  WhatsApp free text (best effort — outside the 24h window WhatsApp won't
  deliver; an approved template is the fix).
- **`DemoInviteService` is the only way to add a guest** — both the demo-class
  "Invite guests" panel and the leads CRM's "assign demo class" go through
  `bookLead` / `addInvitees`, so lead status/timeline stay consistent. A lead
  who actually joins is moved to `DEMO_ATTENDED` (`markLeadAttended`).
- **Static demo schedules** (`DemoSchedule`, admin → Demo Classes →
  Schedules): weekly slots + one permanent `/demo/<slug>` link that resolves to
  the LIVE occurrence, else the next one. Occurrences are ordinary demo
  `CoachClass` rows with `demoScheduleId`, generated `DEMO_SCHEDULE_HORIZON_DAYS`
  ahead on save and by an hourly cron (job lock `demo-schedule.top-up`), idempotent on
  unique `(demoScheduleId, startsAt)`. A slot that clashes with the coach's
  other classes is skipped, not double-booked. An edit/pause deletes only
  **unbooked** future occurrences and re-generates; booked ones are kept. A
  cancelled occurrence keeps its row, so it is not re-created. Rescheduling an
  occurrence by hand detaches it from the schedule.
- None of these models are soft-deletable or Trash-registered.

### 3.7 Live class / LiveKit

- **Render cost in the room** (mobile is the budget): `LiveClassProvider` is a per-room zustand store — read it as `useLiveClassState("activePuzzle", "setPuzzleSolverOpen")` (or `useOptionalLiveClassState((s) => …)`) so a component re-renders only for those fields; the no-arg form subscribes to everything. Plain `useParticipants()` / `useTracks()` re-render on every active-speaker and connection-quality event — use `useRoster()` when you only need who is present, `useGridTracks()` for tile lists, and keep hooks with LiveKit subscriptions out of `MeetingLayout` itself (`MeetingLayoutEffects` is the leaf for room-wide hooks). Board-store reads take a selector (`useBoardStore((s) => s.fen)` or `useShallow`), never the bare `useBoardStore()`.
- `apps/api/src/live-class/` + `apps/web/src/features/live-class/`. LiveKit webhook at `POST /webhooks/livekit` — `main.ts` parses `application/webhook+json` as raw text for signature verification; don't break that.
- **API service layout**: `LiveClassService` is only the lifecycle (start / token / mid-class settings / end / stale sweep). Each in-room concern has its own service in `live-class/` (`-access`, `-waiting-room`, `-pull`, `-demo`, `-chat`, `-screen-share`, `-moderation`, `-recording`), and each one gets auth and the participant/manager checks from `LiveClassAccessService`, so add new in-room features as a sibling service, not into `LiveClassService`. Attendance follows the same split: `AttendanceService` (events, finalize, policy), `AttendanceReportService`, `AttendanceMonitoringService`, plus the pure `attendance-calc.util.ts`. Specs register `LIVE_CLASS_SERVICES` from `live-class.testing.ts`.
- Attendance is driven off LiveKit join/leave/disconnect events → `attendance` module → `class_attendance` / `attendance_logs` / `coach_attendance` tables, scored against the active `AttendancePolicy`.
- Board sync: `apps/web/src/features/chessboard/` (chessground + chess.js, Zustand `boardStore`) bridged into the meeting via `LiveBoardSyncBridge` (single sync engine + `BoardSyncContext`; consume with `useBoardSync()`) / `useLiveBoardSyncBridge`. Board control is keyed by full LiveKit participant identity, is **multi-student**, and is **per colour**: `boardControlStudents: Record<identity, BoardControlSide>` (`"white" | "black" | "both"`) in `LiveClassProvider` (grant/revoke/toggle/`setBoardControlSide` helpers) → `permissionMode` `SELECTED_STUDENT` + `selectedStudentIds: string[]` / `selectedStudentSides` in `createBoardStore`, broadcast via `UPDATE_PERMISSIONS`. A grant arriving without a side means `"both"` (older clients). A single-colour grant only unlocks the board on that colour's turn (`movableColor` in `ChessgroundBoard`) and is re-checked on receipt against the colour that actually played the move (`moverColorFromFen`), so a white-only student cannot drive black by hand-crafting a packet. Coach UI: the Crown popover in the Participants panel (and the legacy board page's "Class" panel), both using `BoardControlSideToggle`. The shared chess clock and per-client detach also live in `createBoardStore`. Sync-permission rule: `features/chessboard/lib/boardSyncRules.ts`. **Durable recovery**: the coach's authoritative window saves the shared board (`toLiveBoardState`: fen, full PGN + viewed ply, orientation, annotations, tab, clock) to `LiveSession.boardState` via `PUT` `API_ROUTES.liveClass.boardState`. Saves are throttled to one per 2s, plus a keepalive flush on `pagehide`, in `useBoardPersistence`. A refreshed coach restores the board from it before answering anything: a `RestoreGate` in `useBoardSyncEngine` holds back FORCE_SYNC until the restore finishes, otherwise the empty start position would wipe every student's board. A signed-in student reads the snapshot on mount and keeps it only if no coach FORCE_SYNC arrived first. Board-control grants are not saved; the coach re-grants after a refresh.
- **Mini player (Picture-in-Picture)**: `providers/PipProvider.tsx` detects the best mechanism the browser offers and exposes it as `mode`. `document` (Chromium 116+) is Document Picture-in-Picture — a real window we render DOM into, so `components/meeting/MiniPlayer.tsx` React-portals a full mini UI (name pill, raised-hand count, mic/camera/back controls) into `pipWindow.document.body`; that window's document starts empty and inherits nothing, so `copyStylesTo` clones every stylesheet across (same-origin rule by rule, cross-origin re-linked by href) and `syncThemeTo` mirrors `data-theme`. `video` (Safari, iOS, and Chromium as fallback) is standard `<video>` PiP driven by `components/meeting/VideoPipSurface.tsx`: one offscreen `<video>` whose `srcObject` follows the spotlight — swapping it mid-PiP keeps the window alive (verified) — falling back to a hand-painted canvas `captureStream` when that person's camera is off. The browser draws that frame itself, so there are no in-window controls. `null` is Firefox, whose PiP is user-driven chrome with no scriptable API; the toolbar row hides itself. Detection is capability-based, so a browser that later ships the standard API picks it up with no code change. Spotlight choice is shared by both modes in `hooks/useSpotlightTrack.ts`. **Auto-open on tab switch is not a `visibilitychange` call** — that has no user activation and is rejected; it is Chrome's automatic PiP for video calls, reached by registering the `enterpictureinpicture` Media Session action handler (in `PipProvider`), which the browser invokes itself — but **only while the tab is actively capturing camera or mic**. So `components/meeting/PipMicCaptureBridge.tsx` (rendered in `MeetingRoom`) holds a microphone capture open for the whole class the way Google Meet does: `createLocalAudioTrack` → `mute()` → `publishTrack` (create-mute-publish order, so no audio is ever transmitted), and the toolbar's mute button just flips that same track. It is a no-op off Chromium-with-Document-PiP (Safari / Firefox / phones), when the class forces the student mic off, when a mic publication already exists, or when the permission prompt is declined. Safari has no automatic PiP at all: the user opens it once and the window survives the tab switch. Returning to the tab closes the window unless the user **pinned** it (More menu or the pin in the window; `localStorage` `nexa-live-class-pip-pinned`). Only a window the user closes *while the tab is hidden* counts as dismissed — our own close sets `closingRef` so its `pagehide` isn't mistaken for one (that used to block every second auto-open). The window's size button steps through `SIZES` via `resizeTo` (remembered in `nexa-live-class-pip-size`); dragging its edges works too.
- **Recording**: `POST /live-class/:id/recording/start` → `LiveKitService.startRecording` → `startRoomCompositeEgress` with `customBaseUrl` = `RECORDING_TEMPLATE_BASE_URL` + `/recorder/:classId`. That template (`apps/web/src/app/recorder/[classId]`) is the *only* reason a recording contains the chessboard — egress' built-in grid renders published video tracks, and the board is synced as `board_sync` data packets, not a track. It is deliberately outside the auth/provider stack (egress carries no cookie; `middleware.ts` gates only /admin, /coach, /student) and authorises purely on the LiveKit token egress mints. It signals readiness with `console.log("START_RECORDING")` and teardown with `"END_RECORDING"`, which is the contract egress' headless Chrome watches for. Because the template joins hidden + subscribe-only it cannot ask for board state, so `requestBoardSyncForRecorder` injects `REQUEST_SYNC` server-side and the coach answers with `FORCE_SYNC`. **Audio**: room-composite egress records the headless tab's audio *output*, so `RecorderClient` has to attach every remote mic / screen-share audio track to an unmuted, playing `<audio>` element (`.recorder-audio-sink`) — the camera `<video>` tiles stay `muted`. Nothing plays those tracks ⇒ a silent recording. **UI state**: LiveKit's `room.isRecording` only drops once egress has finalized the file (many seconds after Stop), so start/stop also inject a `RecordingStateNotice` on `LIVE_CLASS_RECORDING_TOPIC` (`recording`); read recording state via `hooks/useRecordingState.ts`, whose override wins until LiveKit agrees (or 60s pass).
- **Remove from class (kick)**: `POST /live-class/:id/kick` (`API_ROUTES.liveClass.kick`, `LiveClassModerationService.kickParticipant`, students only) disconnects every tab of that user and writes a DENIED `LiveClassWaitingParticipant` row + cancels their pull. Without a waiting room, `getToken` turns that row into `REMOVED_FROM_CLASS` (`RemovedFromClass` screen); with one, the normal denied/request-again flow applies. **Pulling the student back in lifts it** (`pullStudent` flips DENIED → ADMITTED). The removed client sees `DisconnectReason.PARTICIPANT_REMOVED` and reloads onto that screen. Coach UI: the UserMinus button (confirm popover) on a student's People row.
- **Coach moderation (force-mute)**: `POST /live-class/:id/moderate` (`API_ROUTES.liveClass.moderate`, `LiveClassModerationService.moderateParticipant`, coach-owner/admin, class must be LIVE) switches off one participant's already-published `microphone` / `camera` / `screen_share` via `mutePublishedTrack`. **Mute only — there is deliberately no server-side unmute**: re-opening someone's microphone for them is a privacy hole, and the participant turns it back on themselves unless the class policy locks that source off. It then injects a `ModerationNotice` on topic `LIVE_CLASS_MODERATION_TOPIC` (`moderation`), which `MeetingEventToasts` shows **only to the identity it names** — nobody else's business. Coach UI: the mic/camera/screen icons in the People panel become buttons (`TrackStateControl` in `MeetingParticipants`) when a coach looks at a live track. **Room-wide**: `POST /live-class/:id/moderate-all` (`API_ROUTES.liveClass.moderateAll`, `LiveClassModerationService.moderateAll`) switches mic and/or camera off for every participant whose signed metadata role is `STUDENT` (same off-only rule, same per-student notice). `CoachRoomControls` at the top of the People panel has "Mute all" / "All cameras off" plus switches for locking student mics / cameras and **student reactions** — the switches are ordinary mid-class settings changes (`student.mic` / `student.camera` `FORCED_OFF`, `student.reactions`), so they also cover late joiners. Reactions are peer packets that never reach the API, so `ReactionProvider` enforces `student.reactions: DISABLED` on both ends: a student can't send (the picker hides), and every receiver drops a `REACTION` whose sender's signed role isn't `COACH` (puzzle-solve `CELEBRATE` bursts still show).

- **Screen-share request → coach approval** (`live-class-screen-share.service.ts`, routes `API_ROUTES.liveClass.screenShareRequests` / `.requestScreenShare` / `.resolveScreenShareRequest` / `.endScreenShare`): a per-student override on top of the class-wide `student.screenShare` policy — when it's `DISABLED`, a student can ask instead of being flatly locked out. `LiveClassScreenShareRequest` (one row per session+student, `PENDING`/`APPROVED`/`DENIED`/`REVOKED`) is the source of truth; `resolveScreenShareRequest` (coach-owner/admin) is idempotent via a status-filtered `updateMany`, same pattern as the waiting room's resolve. **Approval widens only that one participant's LiveKit grant** — `updateParticipantPermissions` replaces the whole permission set, so it's recomputed from `deriveLiveKitGrants` plus `screen_share`/`screen_share_audio`, never patched — and `getToken` re-applies an `APPROVED` row's widened grant on every reconnect, since token minting is otherwise the only place grants are computed. Denial/revocation narrows the grant back and mutes any live screen-share track, mirroring `applyLiveSettingsToRoom`'s "mute what fell out of the allowed set" step. The grant is taken back when the student's own client reports they stopped (`endScreenShare`), the coach revokes it, the `participant_left` webhook fires (crash/closed-tab cleanup), or the class ends. A `screen_share_request` data-channel nudge (`REQUESTED` / `RESOLVED`) mirrors `LIVE_CLASS_WAITING_ROOM_TOPIC`'s contract — REST is authoritative, the packet is cosmetic. Coach UI: a "Screen-share requests" section in the Participants panel (Approve/Deny/Revoke), mirroring the waiting room's Admit/Deny.

- **Presence + coach "pull into class"** (`apps/api/src/presence/`, `features/presence/`, `live-class-pull.service.ts`, routes `API_ROUTES.presence.heartbeat` / `.liveClass.pullRoster` / `.pullStudent` / `.cancelPull`): every signed-in tab posts `/presence/heartbeat` every `PRESENCE_HEARTBEAT_MS` (`PresenceBridge`, mounted in `AppProviders`), which throttle-writes `User.lastSeenAt` ("online" = within `PRESENCE_ONLINE_WINDOW_MS`; separate from the 10-min analytics `lastActiveAt`). For a student the response carries the class live for them now (→ the one-time "Your class is live" toast + the bottom-right `LiveClassFab`); for a coach it carries their own LIVE class, so the same pill (coach wording, no toast) leads back into it and any PENDING `LiveClassPull` whose session is LIVE. A pull is therefore delivered by the next beat to a student already in the app, or by the first beat after login to one who was offline — `PullHandler` routes to `/live-class/:id?pulled=1`, which skips the pre-join card. `getToken` flips the pull to JOINED, and a PENDING/JOINED pull counts as admission in `gateWaitingRoom`. It never yanks a student out of a *different* class (toast with Join instead). Coach UI: "Not in class" section at the bottom of the People panel (`PullStudentsSection`: batch roster with online/last-seen, Pull / Cancel, "Pull all online"). **Any active student can be pulled, not just the batch**: the unsearched roster lists the batch only (plus another batch's student while their pull is PENDING, so it can be cancelled) — nobody else in the academy is listed up front. `GET pullRoster?q=` (≥2 chars, a leading `@` ignored) searches **every** active student by name / username / email, the batch included, returns `username` (shown as `@handle`), and puts an exact username match first even beyond the 20-row page. A PENDING/JOINED pull is what lets a non-batch student pass `getAccessibleLiveSession` / `getToken` (with student grants). `LiveClassPull` is operational state — unique per (session, student), re-pull upserts back to PENDING, not soft-deletable.

- **Private chat (student ↔ coach only)**: room chat stays `useChat` (a LiveKit broadcast). A private message rides its own topic, `LIVE_CLASS_DIRECT_CHAT_TOPIC` (`private_chat`), addressed with `destinationIdentities` so the SFU never puts it on a third participant's wire, and is persisted through the same `POST /live-class/:id/chat` with a `recipientId`. **There is no student ↔ student case, by design**, and `privateChatRecipientAllowed` in `@nexa-chess/types` is the single place that decides it — the API rejects the write, `ChatProvider` hides the option, *and* a receiving client drops an inbound packet that breaks the rule (the packet never passes through the API, so receiver-side enforcement is what actually binds). Sender identity always comes from the LiveKit envelope, never the payload. `GET .../chat` returns room messages plus only the threads the caller is party to. Threads live in `ChatProvider` (`ROOM_THREAD` + one per counterpart user id) with per-thread unread counts; UI is `ChatThreadBar`. Policy gate: `student.privateChat` (`ENABLED` default).

- **Activity ordering** (`lib/participantActivity.ts` + `hooks/useParticipantActivity.ts`): the video grid (`useSortedTracks`) and the recorder rail sort with `compareByActivity` — sharing screen → speaking (held `SPEAKING_HOLD_MS` after they stop, so a pause doesn't bounce them) → hand raised (earliest first) → spoke within `RECENT_SPEAKER_MS` → camera/mic on → the rest, ties on name so the list only moves when activity changes. "Last heard" comes from `RoomEvent.ActiveSpeakersChanged` via `trackSpeakers`, which stamps people as they *drop out* of the speaker list (LiveKit only reports changes). The grid and recorder pin screen shares then the coach before applying it; the People panel does **not** use it — it lists A–Z (`compareNatural`) inside its Coaches/Students sections (screen-sharers pinned on top), as does its "Not in class" roster. The recorder reads raised hands straight off the broadcast `hand_raise` topic, so a hand raised before recording began shows up only once it is re-announced.

- **Event toasts**: `MeetingEventToasts` (joins/leaves, screen share, board share, force-mute, chat arriving with the panel closed) and `BoardControlToasts` (board control granted/revoked — shown *only* to the student it affects, since the grant packet is broadcast to everyone). Joins and leaves are pooled over a 1.2s window and collapse to `"N people joined"` at three or more, because a class opening produces a burst. Colour is assigned centrally in `lib/meetingToasts.ts` — green for something gained, slate for neutral room activity, amber for something taken away — so the same kind of event always looks the same.

- **Media devices** (`providers/MediaDeviceProvider.tsx`, `lib/mediaDevices.ts`, `hooks/useMediaDeviceList.ts`, Settings → "Your devices" = `MeetingDeviceSettings`): the room connects with `audio={false} video={false}`, so the provider is what turns the mic / camera on at join — only when `resolveJoinState(settings, role, { mic, camera })` says so, the pref being the user's last pre-join toggle (it can only turn a policy default *off*). Device picks are **saved per browser in `localStorage` (`nexa-live-class-media`)** by id *and* label (ids rotate; the label finds the same hardware again) — the pre-join card (`persistUserChoices={false}`: LiveKit's own store would override the policy defaults), the in-room picker and `MeetingRoom`'s `audioCaptureDefaults` all read that one store. **Always select with a non-`exact` constraint** (`switchActiveDevice(kind, id, false)`, plain-id capture defaults): an `exact` id that has been unplugged makes the next mic toggle fail with `OverconstrainedError`. Every capture failure LiveKit raises arrives as `RoomEvent.MediaDevicesError`; the provider turns it into a toast (`describeMediaError`: blocked / not found / busy / insecure page) plus a per-device issue the Settings panel shows with "Try again" — toolbar/shortcut toggles pass `ignoreDeviceError` so they don't rethrow. It also announces an unplugged active device, offers a newly plugged one, switches back to the saved one when it returns, and warns on `LocalAudioSilenceDetected` (skipping the muted `PipMicCaptureBridge` capture, which waits for the provider's `initialApplied` so two captures never race). "Scan devices" asks for permission when the browser hides devices behind it — the usual cause of "no microphone found". Speaker choice needs `setSinkId`; Safari/iOS get a "use your system sound settings" note instead. **Back from the background (mobile)**: on `visibilitychange`/`pageshow` the provider restarts any capture the OS ended or muted and calls `resumeUpstream()` — LiveKit pauses upstream after 5s of OS mute and never resumes it once the track is restarted, which left the mic silent for everyone else.

- **Video effects (virtual background + auto-framing)** (`providers/VideoEffectsProvider.tsx`, `lib/videoEffects/*`, Settings → "Video effects" = `MeetingVideoEffects`, also More → "Background & framing"): a per-user camera processor — blur (two levels), one of the shipped images in `public/video-backgrounds/` (ids in `BACKGROUND_PRESETS` are persisted — never rename one), or an uploaded picture (scaled to 1280×720 JPEG, kept in `localStorage` `nexa-live-class-video-background`), plus Zoom-style auto-framing that zooms in and follows the face. Choice saved per browser in `nexa-live-class-video-effects`; never sent to the API. One `CameraEffectsProcessor` (`lib/videoEffects/processor.ts`) sits on the local camera track: `@livekit/track-processors`' `BackgroundTransformer` (MediaPipe selfie segmenter) subclassed so its output is cropped by `AutoFramer` (`framing.ts`, pure: target crop from the BlazeFace detections ~7×/s, dead zone, exponential glide, zoom back out after 2.5s without a face). Effects are swapped on the running processor (`apply`), so no restart flash; LiveKit keeps the processor across camera mute/restart, and the provider re-attaches it when the camera is re-published. Everyone in the room and the recording see the processed video. **The processor module (MediaPipe, ~1 MB) is only reached through a dynamic `import()`** — keep it out of static imports. MediaPipe WASM + models load from jsdelivr / storage.googleapis.com (`@mediapipe/tasks-vision` is pinned to the version `@livekit/track-processors` depends on — bump them together). Needs WebGL2 + `VideoFrame` + `OffscreenCanvas` (`canRunVideoEffects`); unsupported browsers see a notice, and a device averaging >45 ms/frame gets a one-time "effects are slowing your camera" toast.

- **Mobile audio** (`AudioSessionBridge`): capturing the mic puts iOS Safari into a voice-call audio session that routes playback to the *earpiece*, so the class sounds like a muted phone call. The bridge sets `navigator.audioSession.type = "play-and-record"` while connected (restored to `"auto"` on leave), turns the first tap anywhere in the room into `room.startAudio()` so autoplay policy never leaves a student in silence when they miss the `<StartAudio>` prompt, and keeps `<RoomAudioRenderer>`'s `<audio>` elements unmuted / `playsinline` / playing across backgrounding. Every call is capability-detected.

- **Puzzle Library** (`apps/api/src/puzzle/`, `apps/web/src/features/puzzles/`, routes `API_ROUTES.puzzles.*`): a standalone catalogue of reusable chess-training objects (position + solution line + topic + type + difficulty + ownership + lifecycle). `PuzzleTopic` (admin-authored only) → many `Puzzle`; both are soft-deletable and registered in the Trash module. **Topics are nested folders** (`parentId`, max `MAX_PUZZLE_TOPIC_DEPTH`): use the shared tree helpers in `packages/types/src/puzzle.ts` (`buildPuzzleTopicTree`, `collectPuzzleTopicSubtreeIds`, `puzzleTopicPath`); a `topicId` list filter includes subfolders unless `topicScope=direct`; archive/reassign act on the whole subtree (`TrashRepository.softDeleteGroup`, one `deleteGroupId`, so restoring any folder brings the group back); a topic whose parent is gone renders at the top level. **Copy** (`API_ROUTES.puzzles.copyTopic`, admin, `PuzzleTopicService.copy`) deep-copies a folder's subtree and live puzzles under a new parent, keeping author/visibility/status (a Lichess puzzle's copy becomes `NEXA`, sourceId cleared); the library's Folders tab offers Copy / Cut / Paste, and folders there start collapsed. `Puzzle.visibility` is `GLOBAL` (admin-authored, every coach sees it) or `PRIVATE` (coach-authored, author + admins only) — the service **forces coaches to PRIVATE** and admins to `GLOBAL` by default; a coach can never publish `GLOBAL` and `canManage` blocks a coach editing an admin puzzle. Lifecycle `status` is `DRAFT`/`PUBLISHED`/`ARCHIVED` (reversible toggles), distinct from the Trash soft delete. **Server move evaluation reuses `AssignmentEvaluationService`** (`normalizeSolution`, `evaluateSolveLine`, `solveLineFeedback`) — exported from `AssignmentModule`, injected into `PuzzleService` / `PuzzleAttemptService` — so there is exactly one SOLVE_LINE engine. **Any mate wins** on a line that itself ends in mate: `isAcceptedMateAlternative` (assignment-evaluation.service.ts) is the only place that decides it, mirrored in `puzzleSolverEngine.ts` — both run `SOLVE_LINE_MATE_FIXTURES` from `@nexa-chess/types`, so change them together. `puzzles.title` carries the ICU `natural_sort` collation (migration only — Prisma can't express it), so a title `orderBy` is natural order in SQL; don't reintroduce an in-memory sort. **Content identity**: `Puzzle.contentHash` = `puzzleContentHash(fen, solution)` (`puzzle/puzzle-content-hash.ts`, key from `puzzleContentKey` in `@nexa-chess/types`) — every write path that sets `fen` or the solution must set it (create, update, duplicate, seed, later materialise); the migration's SQL backfill builds the same key and `puzzle-content-hash.int-spec.ts` keeps the two equal. Indexed, never unique. **Origin**: `source` (`NEXA` / `LICHESS`) + `sourceId`, unique across soft-deleted rows; a `LICHESS` puzzle's position and line can't be edited (duplicate it — the copy is `NEXA`). `PuzzleAttempt.context` (`DIRECT` / `LIVE_CLASS` / `TRAINING`) is set by the server at `start`. The Lichess catalogue itself is `LichessPuzzle` / `LichessCatalogueRelease` (source data, written only by `scripts/lichess-puzzles-load.sh` from a release built off-box by `npm run puzzles:prepare -w apps/api` — README § "Lichess Puzzle Catalogue"; no FKs, excluded from backups) with its theme vocabulary in `LICHESS_THEMES` — see `docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md`; `Batch.puzzleTrainingEnabled` is the per-batch training switch (on by default, BatchForm → "Puzzle Training"). **Catalogue routes** (`puzzle-catalog.service.ts`, `API_ROUTES.puzzles.catalog*`, staff + coach): browse (keyset, no totals, **never a solution** — only `catalogPreview` returns one), `catalogMaterialise` (copy into the hidden system folder, slug `LICHESS_FOLDER_SLUG`) and `catalogAdopt` (admin, into a curated folder). Every copy goes through `PuzzleCatalogService.materialise` — one row per Lichess id, ever. `PuzzleService.list` hides the system folder unless it is the `topicId` asked for. Catalogue SQL runs in a transaction with `SET LOCAL statement_timeout` **and** `plan_cache_mode = force_custom_plan` (Prisma's prepared statements otherwise drift onto a generic plan); keep both on any new catalogue query. Web: `features/puzzles/components/catalog/CatalogBrowser` — the library's "Lichess catalogue" tab (admin selects + "Add to folder"; "Create homework" fetches the preview and prefills `AssignmentFormDialog` via `initialSolutionMoves`) and, as `variant="compact"`, the share dialog's "Lichess catalogue" tab (materialise, then the ordinary assign; it never moves the Ask / Load next cursor). Folder pickers drop the system folder with `isLichessFolder`; `PuzzleForm` hides the position/solution editors for a `LICHESS` copy. Auth is the token-string pattern via `puzzle-auth.helper.ts` (`authenticateUser` / `assertAdmin` / `assertStaffOrCoach` / `assertStudent`), no guards. **There is no student puzzle library page** (`/student/puzzles` redirects to `/student/practice`) — puzzles reach a student when a coach shares one in class, through a course module (`/student/puzzles/[id]`), or through **rated training** (`/student/training`, `PuzzleTrainingService`, `API_ROUTES.puzzles.training` / `.trainingNext`): the server picks one puzzle at a time near the student's rating with the pure policy in `@nexa-chess/types` `puzzle-training.ts` (slot cycle WEAK/EXPLORE/MIXED/REVIEW, form-adjusted target, per-slot rating offset), walks the Lichess catalogue (unseen by `contentHash`, through `materialise`) and falls back to the visible library, then opens a `TRAINING` attempt that `PuzzleAttemptService.start` resumes — solving uses the ordinary attempt routes, so rating/streak need nothing new. Skipping an unfinished training puzzle closes it as a rated miss. Spec §12. The API still scopes what a student may open: students see `PUBLISHED` `GLOBAL` puzzles plus `PUBLISHED` `PRIVATE` puzzles whose author coaches one of their batches; `PuzzleAttempt` rows are server-scored. Web: `PuzzleForm` (position via `PositionEditor`, solution via the shared `SolutionEditor`), `PuzzleSolver` (built on `PracticeBoard`, client-side prefix-match for the coach preview, server-backed for student attempts). **Multi-game PGN import**: library → "Import PGN" (`PuzzleImportDialog`) turns every game into a puzzle via `POST /puzzles/import` (`API_ROUTES.puzzles.import`, max `MAX_PUZZLE_IMPORT`, per-item failures reported, not fatal). Parsing is `parsePgnGames` in `features/assignments/lib/importLine.ts` — it splits games, strips the BOM, and repairs ChessBase's `0 0` FEN counters (chess.js rejects a fullmove of 0); a game with no moves imports as a DRAFT.

- **Live-class puzzle assignment + leaderboard** (`apps/api/src/puzzle/live-class-puzzle.{service,controller}.ts`, `apps/web/src/features/live-class/**` `PuzzleBridge` / `MeetingPuzzlePanel` / `PuzzleAssignModal` / `InRoomPuzzleSolver`, routes `API_ROUTES.liveClass.puzzle` / `.puzzleAttempt` / `.puzzleLeaderboard`): a coach mid-class pushes a `PUBLISHED` puzzle into the room; students solve it privately (server-scored) and a leaderboard ranks them by score↓ then time↑. `LiveClassPuzzleAssignment` **references** `puzzleId` (never copies), is NOT soft-deletable / not Trash-registered (like `Assignment`), and a partial unique index (`WHERE status = 'ACTIVE'`) enforces one live puzzle per class. `PuzzleAttempt.liveClassId` holds the `CoachClass.id`. **The service lives in `PuzzleModule`** (which now `imports: [LiveClassModule]` for `LiveKitService` + the `LiveClassService.resolveParticipant` / `resolveClassManager` helpers). **`startAttempt` is the only new attempt route** — it delegates to `PuzzleAttemptService.start(token, puzzleId, { liveClassId })`; move-save / submit / hint reuse the existing `/puzzles/:id/attempts/:attemptId/*` routes, which now also call `assertLiveAssignmentOpen` (reject once the coach ends the puzzle or the timer + 15s grace elapses). Lifecycle rides `LIVE_CLASS_PUZZLE_TOPIC` (`PUZZLE_ASSIGNED` / `PUZZLE_ENDED` server-injected, `LEADERBOARD_DIRTY` sent by a student's client on submit); the leaderboard itself is a polled query. Timed mode lives on the assignment row.
  - **Points & leaderboard rules** (`packages/types/src/puzzle-scoring.ts`): `PuzzleScoring` (points to solve, partial credit, **minus per wrong move**, minus per hint, speed bonus, first-solver bonuses, allow-negative, tries per student) + `PuzzleLeaderboardOptions` (students see it LIVE / AFTER_END / HIDDEN, rank by POINTS or SCORE_THEN_TIME, top-N, anonymize, show stats). Same 4-layer shape as pre-class settings: system defaults → admin `PuzzleScoringSettings` singleton (`/admin/puzzles/scoring`, `API_ROUTES.puzzles.scoringSettings`, seeded lazily) → `Puzzle.scoringJson` (puzzle form, optional) → the coach's picks in the share dialog (only touched fields are sent; last-used remembered in `localStorage`). The result is **frozen onto the assignment** (`scoringJson` / `leaderboardJson`); the coach edits it mid-puzzle via `PATCH` `liveClass.puzzle` (broadcasts `PUZZLE_UPDATED`) and hands out manual +/- via `liveClass.puzzleAdjust` (`adjustmentsJson`, applied after the zero floor). **Points are never stored** — `computePuzzlePoints` (shared with the preview) runs at leaderboard read time, so an edit re-scores everyone and first-solver order comes from `completedAt`. **Wrong moves are counted server-side** in `PuzzleAttemptService.saveProgress` (`PuzzleAttempt.wrongMoves`; each wrong move itself — SAN/UCI/`fenBefore`, recomputed with chess.js — goes to `wrongMovesJson`, never `movesJson`, and shows as red chips + an arrow on the coach's live boards). Students have no "Give up" in class, and the full line is only revealed once they are out of tries. The in-class **Hint** asks the server for a level-2 hint and only highlights the piece to move (never the move), costing `hintPenalty`. Tries are enforced in `startAttempt` (an in-progress attempt is always resumable). The leaderboard only counts attempts started after the assignment's `startedAt`, so re-sharing a puzzle starts a fresh board; rows shared before this feature fall back to score-then-time. Student visibility (own row only while hidden / before the end, top-N, "Student 3" names) is applied **server-side**, not in the UI.
  - **Grid tile**: `video-grid/PuzzleGridTile.tsx` puts the active puzzle first in `MeetingVideoGrid` (before the shared-board tile) — students get Solve / Continue / Try again / points + rank, the coach gets solved/solving/not-started counts. The tile, the Puzzle panel, the "Solve puzzle" pills and a new `PUZZLE_ASSIGNED` all set `puzzleSolverOpen` in `LiveClassProvider`, which swaps the student's main stage for `PuzzleStage` (no dialog) — the Puzzle stage tab in `ClassroomLayout` on desktop, `MeetingVideoGrid` on phones — so two boards never drive one attempt.
  - **Whole-class leaderboard** (`API_ROUTES.liveClass.puzzleClassLeaderboard` / `.puzzleClassLeaderboardAdjust`, `LiveClassPuzzleService.classLeaderboard`; "Whole class / This puzzle" switch in the Puzzles tab, Whole class by default — a student's panel opens on that tab): every assignment in the class scored exactly as its own board (`rankStudents`, including its per-puzzle adjustments), summed per student, plus the coach's class-level +/- in `LiveClassLeaderboardAdjustment` (unique `(liveClassId, studentId)`, atomic `increment`; not soft-deletable). Each assignment owns only the attempts started before the next one was shared, so a re-shared puzzle never counts an attempt twice. A student's totals only include puzzles whose own board they may see (LIVE, or AFTER_END once ended), and are anonymized if any counted puzzle is.
  - **Coach board buttons** (`ClassroomBoard` → `CoachPuzzleButtons`, under the board; the drawing colours sit in the header row): two hover menus (`HoverMenuButton` — hover on mouse, tap on touch). **Share** → previous / current / next; **Load** → previous / current / next; plus the folder button that opens `PuzzleAssignModal` (reopens in the folder last used; Share/Load open it when no folder is set). Share previous/next share the neighbouring puzzle in the coach's folder (by title) with the last share options the dialog remembers (`lib/puzzleShareOptions.ts`), replacing any active one, **and load it onto the main board**; Load previous/next only put it on the board (no assignment, timer or leaderboard); **Load current** puts the puzzle the class is solving back on the board. **Share current** opens `SharePositionDialog`: the main board's position (frozen on open) with title, time, points, negative points and a required solution (`SolutionEditor`), prefilled when the position is the active or cursor puzzle. It posts `API_ROUTES.liveClass.puzzleFromBoard` → `LiveClassPuzzleService.shareFromBoard`: an unchanged source puzzle is shared as itself, anything edited becomes a PRIVATE PUBLISHED puzzle in the hidden "Asked in class" system folder (`LIVE_CLASS_FOLDER_SLUG`; `isSystemPuzzleFolder` hides it — and the Lichess folder — from pickers, the library list, stats and duplicate checks). Each dialog row has **Load** (board only) beside **Share** (share + load). All stepping lives in `hooks/useLoadNextPuzzle.ts` (`useLoadPuzzleOnBoard` is null outside a `BoardProvider`, i.e. the phone sidebar, which then hides Load). Share and Load move **one** per-browser cursor (`lib/puzzleCursor.ts`, `localStorage` `nexa-live-puzzle-cursor`, `{ folderId, puzzleId }`). Sharing switches the coach's stage to Live boards; the coach's **Activity** stage tab (`PuzzleStage` → `CoachPuzzlePreview`) is a client-side `PuzzleSolver` copy of the active puzzle — no attempt, never on the leaderboard, independent of the main board.

- **Simul** (`apps/api/src/simul/`, `features/live-class/providers/SimulProvider.tsx` + `components/meeting/simul/*`, routes `API_ROUTES.liveClass.simul*`): the coach plays several students at once. `LiveClassSimul` (one `ACTIVE` per class — hand-written partial unique index) → one `LiveClassSimulGame` per student (unique `(simulId, studentId)`). **Moves are REST, never peer data packets**: `move` replays the game with chess.js (so threefold repetition sees the history), checks the mover's side, and writes with `updateMany where { ply, status: ONGOING }` — a lost race is a 409 and the client refetches. The API then injects the whole game on `LIVE_CLASS_SIMUL_TOPIC` (`live_class_simul`), broadcast room-wide; a student's client drops every game but their own, and `GET` strips other games for students. Clients merge packets by `ply` (`mergeSimulGame`), so a late packet never rewinds an optimistic move. **Engine moves are server-side** (`engineMove`, coach only, `StockfishService.getBestMove` at the chosen `skillLevel`) and are flagged `engine: true` on the move + counted in `engineMoves`; the coach's "Hint" reuses `/stockfish/analyze`. Coach queue order is `compareSimulGamesForCoach` in `@nexa-chess/types` (`live-class-simul.ts`): coach-to-move first, longest `turnSince` first, then student-to-move, then finished. Resign / draw offer-accept-decline / coach adjudication go through `action`; ending the simul leaves unfinished games `FINISHED` with `result: null` (`SIMUL_ENDED`). Not soft-deletable, not Trash-registered.

- **Student matches** (`apps/api/src/student-match/`, `features/live-class/providers/MatchProvider.tsx` + `components/meeting/match/*`, routes `API_ROUTES.liveClass.match*`): students play each other; the coach monitors every board (read-only grid + focused board) and can adjudicate/abort. `LiveClassMatchRound` (one `ACTIVE` per class — hand-written partial unique index) → `LiveClassMatchGame` (white/black students) + `LiveClassMatchChallenge` (one `PENDING` per round+from+to, partial index). `pairingMode` is `AUTO` (`autoPairPlayers` in `@nexa-chess/types` `live-class-match.ts`: by points, no rematches, White to whoever had it less) / `COACH` / `STUDENT_CHOICE` (challenge → accept; crossing challenges auto-accept), switchable mid-round via `PATCH`. Pairing and accepting lock the round row (`SELECT … FOR UPDATE`) and re-check "already playing". Eligible = batch roster + every student connected to the room (`LiveClassService.connectedUserIds`). Moves mirror Simul: REST, chess.js replay, `updateMany where { ply, status: ONGOING }` → 409 on a lost race, whole game injected on `LIVE_CLASS_MATCH_TOPIC` (`live_class_match`), students' `GET` stripped to their own games/challenges. **Clocks** are stored as remaining ms at `turnSince` and start after each side's first move (`MATCH_CLOCK_START_PLY`); the server only decides a flag on a move or a `CLAIM_TIMEOUT` (either player's `MatchClock`, or the coach's view, claims it at zero) — no timer job. A flag against a side with no mating material is a draw. Ending a round leaves unfinished games `FINISHED` with `result: null` (`ROUND_ENDED`). Not soft-deletable, not Trash-registered.

- **Single-page live class** (`components/meeting/classroom/*`): on `md+` `MeetingLayout` always renders `ClassroomLayout` — board left (`ClassroomBoard`: clock, flip, coach's navigation/drawing toolbars, `BoardActionsRow`), right column `ClassroomPanel` = `ClassroomVideo` (spotlight: a student sees the coach unless a screen is shared; the coach sees the speaker) + one tab bar (Moves, Chat, People, Puzzles; coach also Response, Engine, PGN, Games). A `StageSwitch` swaps the left side between Board, Video (`MeetingVideoGrid hideBoard`) and one tab per running activity — student: Puzzle (`PuzzleStage`), their Simul game, Matches; coach: Live boards (every student's puzzle board, `PuzzleLiveBoardsGrid`), Simul, Matches. **On md+ these are tabs, never pop-ups**: each tab mirrors the open flag the phone dialog uses (`puzzleSolverOpen`, `puzzleBoardsOpen`, simul/match `coachOpen`/`studentOpen`), so whatever opens an activity switches to its tab, and `SimulHost`/`MatchHost` render the dialogs only below md (the views take a `stageSwitch` prop to render inline). Between the panel's video and its tab bar a drag handle (lg+) sets the video height (`localStorage` `nexa-live-class-video-height`; double-click resets to 16:9). Coach board shortcuts: ←/→ step, **↑ start / ↓ end**, Space = engine move (`useEngineMove`), plus `S` setup position, `>`/`<` share next/previous, `]`/`[` load next/previous, `/` ask current (Share current) — one list in `lib/coachBoardShortcuts.ts` (`COACH_BOARD_SHORTCUTS` + `matchCoachBoardShortcut`, which skips typing, open dialogs/menus and Ctrl/Cmd/Alt chords) feeds the handlers, the Share/Load menu hints and the guide. The toolbar's `SetupPositionControl` (right of the camera) opens the board's own `SetupPositionDialog` through `useCoachBoardActions`, set only while the coach's `ClassroomBoard` is mounted; so the button and keys are off on other stages (sharing a puzzle switches to Live boards) and on phones. On lg+ a `PanelResizer` drag handle sets the panel width via the `--classroom-panel-w` CSS variable on `<html>` (so the floating toolbar, rendered outside the layout, re-centres too), remembered in `localStorage` `nexa-live-class-panel-width`; double-click resets. Below lg a solving student's panel is hidden so the puzzle gets the full height. **The coach's board is always shared on the single page**: `useCoachBoardOpen({ autoShare })` opens it and sets the `isChessboardOpen` attribute once connected — there is no toolbar "Share board" button and no pop-out window any more (`/live-class/:id/board` remains only for its e2e spec; if a `_board` identity is present, `useBoardSync`'s `suppressBroadcast` still defers to it). Chat/People/Puzzle sidebar requests (toolbar, toasts, "message privately") are redirected to the matching tab; chat read-state follows `classroomChatOpen` in `LiveClassProvider` as well as `activeSidebar`. Phones keep the video grid + `BoardStage`.
- **Response (move poll)** (`apps/api/src/move-poll/`, `components/meeting/move-poll/*`, routes `API_ROUTES.liveClass.movePoll` / `.movePollAnswer`): the coach asks "what would you play?" on the board's current position (single-page "Response" tab, `MovePollCoachPanel`); each student gets `MovePollStudentHost`'s dialog (mounted in `MeetingRoom`) and privately plays one legal move, changeable while `OPEN`. `LiveClassMovePoll` (`OPEN` → `CLOSED` → `ENDED`; a hand-written partial unique index allows one non-`ENDED` poll per class, and asking again ends the current one) + `LiveClassMovePollAnswer` (unique `(pollId, studentId)`, SAN computed server-side with chess.js). **Visibility is server-side**: a student's `GET` carries only their own answer until the coach closes *and* reveals, then anonymous counts + the marked answer; the coach sees names. The `move_poll` topic only nudges a refetch (`POLL_CHANGED` / `POLL_ANSWERED`). The coach's tally draws as arrows via the board store's local-only `overlayArrows` (chessground auto-shapes, never broadcast), hidden once the board leaves the poll's position. Not soft-deletable, not Trash-registered.

- **Interactives (classroom tools)** (`apps/api/src/classroom-tools/`, `components/meeting/interactives/*`, routes `API_ROUTES.liveClass.tools` / `.tool`): coach-only toolbar button left of Leave → popover of exactly 12 tools (`registry.ts`, order fixed; ids are `LIVE_CLASS_INTERACTIVE_IDS` in `@nexa-chess/types`, persisted — never rename one) → `InteractivePanel`, a portaled **non-modal** `role="dialog"` (so `matchCoachBoardShortcut` stays quiet while focus is in a tool). **Students have no launcher — they watch what the coach presents**: with the panel's "Show to class" switch on (default) the open tool is written to the class-scoped `PRESENTING` tool state, and `InteractivesProvider` (mounted once in `MeetingLayout`; also owns the packet listener and the timer driver, in a separate context so its ticks don't re-render the layout) opens it on every student's stage — the `interactive` activity tab in `ClassroomLayout` on md+ (centred `InlineStage`, same open-flag pattern as the other activities), `PresentedInteractiveOverlay` centred on phones — read-only (`isManager=false`). Personal tools share what the coach sees through `useSharedToolView` (`shared.tsx`: the coach publishes a debounced `view` snapshot ≤ `PRESENTED_VIEW_MAX_CHARS`; a watching student gets it, validated by the tool's own parser, and the tool hides its controls). `LiveClassToolState` = one row per (`scopeKey`, `LiveClassToolKind`); `LIVE_CLASS_TOOL_SCOPE` in `@nexa-chess/types` (`live-class-tools.ts`) makes MYSTERY_BOX / WALL_OF_MOMENTS / GM_MAPPER `batch:<id>` (carried between classes) and the rest `class:<id>`. PUT validates against `LIVE_CLASS_TOOL_STATE_SCHEMAS` (coach-owner/admin via `resolveClassManager`); GET is any participant; the `classroom_tools` packet only nudges a refetch. Catalogue ids (grandmasters, rewards, legends) live in `lib/interactives/*` and are persisted — never rename one. **The classroom timer is driven once per room by `InteractivesProvider`** (`useClassroomTimer`): server-time skew from `serverTime`, only the coach's client auto-advances an expired phase (next phase starts at the old one's end, so no drift), every client chimes + toasts the change. Chess Balance / Opening / Rating / Video keep nothing server-side; the video generator records a canvas with `MediaRecorder` and shows an "unsupported" state instead of a fake export when the browser can't. Not soft-deletable, not Trash-registered.

- **Student board stage, local flip, reactions**: on a phone a shared board is a tile in the student's video grid — it never takes over the stage on its own. The tile's expand button opens `video-grid/BoardStage.tsx` (board fills the stage, coach's camera in a draggable popup), which closes when the share ends. `FlipBoardButton` is role-aware: the coach's flips the synced `orientation` (broadcast to every student); a student's toggles `localFlip` in `createBoardStore`, which flips only their own view and is never broadcast. Emoji reactions ride their own `reaction` topic (`lib/reactions.ts`, `providers/ReactionProvider.tsx`, mounted in `MeetingRoom` and the coach's board tab); receivers drop anything outside `REACTION_EMOJIS`, and sounds are synthesized with Web Audio (no audio assets) — one per emoji in `EMOJI_SOUNDS` (👏 is filtered-noise claps, 🎉/🎊 a popper + sparkle), and a puzzle solve plays applause + popper + fanfare. Solving the class puzzle fires a `CELEBRATE` burst, naming the solver only when the leaderboard is `LIVE` and not anonymized. A shared puzzle opens the student's solver directly; the coach reaches puzzles from the toolbar and from the single page's "Puzzles" tab, and the share dialog browses topics as folders.

- **Admin "Live Now" / spectator seats** (`live-class-spectate.{service,controller}.ts`, `features/live-monitor/`, pages `/admin/live-classes` + `/admin/live-classes/[classId]`, routes `API_ROUTES.adminLiveClasses.list` / `.spectate`): ADMIN/SUPER_ADMIN see every LIVE class and can watch any of them with no invite, waiting room or coach approval. `spectate` mints `LiveKitService.generateSpectatorToken` — `hidden: true`, `canSubscribe` only (no publish, **no data**), metadata role `SPECTATOR`, identity `spectator_<userId>_<tab>` (`LIVE_CLASS_SPECTATOR_IDENTITY_PREFIX` / `isSpectatorIdentity` in `@nexa-chess/types`). Hidden ⇒ no client lists it; no data grant ⇒ it can never drive the board or chat. It cannot ask for the board itself, so `spectate` returns the `LiveSession.boardState` snapshot and server-injects `REQUEST_SYNC` (like the recorder). **Anything that turns room identities into user ids must skip `isSpectatorIdentity`** (the attendance webhook and the student dashboard count do). The client (`useSpectatorRoom`) is the recorder's receive-only model with UI; both render `ReadOnlySyncedBoard` + `reduceReadOnlyBoard` (`features/chessboard/{components/board,lib}/`). This is separate from an admin opening `/live-class/:id`, which still joins visibly with a coach-equivalent token.

- **Coach classes are academy-scheduled**: a coach cannot create, reschedule or re-batch a class (admin scheduling / `batch-schedule` generate them). `PATCH` `coach.updateClass` accepts only title/topic/description/objectives/homework/notes, before or after the class (not once cancelled) — `ClassNotesDialog`. A coach who needs an extra class or a new time **asks** (`apps/api/src/class-request/`, `features/class-requests/`, routes `API_ROUTES.classRequests.*`, admin page `/admin/class-requests`): a `ClassChangeRequest` (`EXTRA_CLASS` / `RESCHEDULE`, `PENDING` → `APPROVED` / `REJECTED` / `WITHDRAWN`). Approval runs in one transaction — a status-filtered `updateMany` claims the request (double-approve ⇒ 409), the coach's schedule is re-checked with `assertNoSchedulingConflict`, then the class is created (and `CLASS_SCHEDULED` dispatched) or moved if still `SCHEDULED`. A partial unique index (hand-written migration) allows one pending reschedule per class. Not soft-deletable.

- **Student progress** (`apps/api/src/progress/`, `features/progress/`, routes `API_ROUTES.progress.*`, page `/student/progress`, coach → Students → progress icon): a puzzle rating (Elo against the puzzle's own `rating`, else a fixed rating per difficulty via `puzzleOpponentRating`, maths in `@nexa-chess/types` `progress.ts`) and a daily practice streak. `ProgressRecorderService` is called fire-and-forget from `PuzzleAttemptService.submit` and `AssignmentAttemptService.submit` and never throws. Only the **first finished attempt at each puzzle** is rated (unique `(studentId, puzzleId)` on `puzzle_rating_changes`), so retries can't farm rating; a clean solve scores 1; hints *or* exactly one wrong move ½; hints plus a wrong move, or two or more wrong moves, 0 (D1, softened 2026-10-04 — `PuzzleAttempt.wrongMoves`, server-counted). History is never recalculated. The streak day is the student's own `User.timezone` day; `lastActiveDay` is `@db.Date` and the shown streak drops to 0 once a day is missed (`liveStreak`). A coach only sees students in a batch they coach.

- **Pre-class settings** (`live-class-settings.service.ts` / `live-class-preset.service.ts`, routes `API_ROUTES.liveClassSettings` / `.liveClassPresets`): four inheriting layers — system `LiveClassPolicy` singleton → `Batch.liveClassSettings` → `CoachClass.liveClassSettings` → `LiveClassPreset` (copied into the class, never referenced). The **shared resolver + LiveKit grant deriver live in `@nexa-chess/types` (`live-class-settings.ts`)** — `resolveLiveClassSettings`, `deriveLiveKitGrants`, `resolveJoinState`; use them, don't reimplement. Effective config is frozen onto `LiveSession.effectiveSettings` at `startClass` (§snapshot); a null snapshot means "started before this feature" → pre-feature token grants. Settings-change audit rows go to `TrashAuditLog` with `action: "LIVE_SETTINGS_CHANGE"`. **Mid-class change**: `PUT /live-class/:id/live-settings` (`liveClass.updateLiveSettings`, coach-owner/admin) re-persists the class override, refreezes the snapshot, `RoomServiceClient.updateParticipant` + `mutePublishedTrack` for every connected student, then server-injects a `SETTINGS_UPDATE` data packet on topic `LIVE_CLASS_SETTINGS_TOPIC` — `LiveClassSettingsBridge` (rendered in `MeetingRoom` + the board page) feeds it to `LiveClassProvider.applySettingsUpdate` so locks/board default re-derive without a rejoin. Coach UI: `InRoomClassControls` in the meeting Settings panel. **Config surfaces**: coach per-class = `LiveClassSettingsSection` on the class start page; coach personal presets = `/coach/presets`; admin platform defaults + org presets = `/admin/live-class` (`AdminLiveClassSettingsClient`); batch defaults = "Class Settings" tab in the admin `BatchForm` (`BatchLiveClassSettingsTab`). `PresetFormModal` takes a `scope` prop (`"ORG"` is admin-only). Preset authz lives in `live-class-preset.service.ts` (`canManage`: ORG⇒admin, PERSONAL⇒owner; `isSystem` never deletable). **Student pre-join**: `GET /live-class/:id` returns `preClassSettings` (resolved, pre-token) so `PreJoinCard` previews the policy (plain-language summary) and hides the toggle for a `FORCED_OFF` device; the `[roomId]` page auto-joins (skips the card) when `resolveJoinState().autoJoin`, pre-flighting `getUserMedia` and falling back to the card on denial. **Last used**: after a coach saves class settings (either surface), the override is remembered per user in `localStorage` (`settings/lastUsed.ts`) and pre-selected — unsaved, badged, dismissible — on the next class that has no override of its own. It is a convenience only: nothing resolves differently until the coach saves. **Audit surfacing**: `GET /live-class-settings/audit` (admin, `LiveClassSettingsService.getAuditLog`, last 50 `LIVE_SETTINGS_CHANGE` rows with resolved actor/entity names) → `LiveClassAuditLog` on `/admin/live-class`.

---

## 4. Code style

- **TypeScript strict.** No `any` (`@typescript-eslint/no-explicit-any` is `warn` — don't add new ones). Prefix intentionally-unused vars with `_`.
- API: NestJS module/controller/service structure. One feature = one folder with `<x>.module.ts`, `<x>.controller.ts`, `<x>.service.ts`, `dto/`, and `<x>.service.spec.ts`.
- Object keys and imports are generally kept alphabetized in this codebase — match the file you're in.
- Services return the shared response types from `@nexa-chess/types`, mapping Prisma rows through private `toX()` helpers (dates → `.toISOString()`, `Decimal` → `.toString()`, exclude soft-deleted relations).
- Prefer `import type { ... }` for type-only imports.
- **`Chess` comes from `@/lib/chess` (web) / `common/chess/chess` (API), never from `chess.js` directly** (ESLint enforces it). chess.js trusts a FEN's castling field and castles from wherever the king stands, so a set-up position with stale `KQkq` offered O-O from e4; the wrapper runs `sanitizeCastlingRights` (`@nexa-chess/types` `chess-fen.ts`) on every load, constructor and `loadPgn` included. The position editor's checkboxes lock while a king/rook is off its home square.
- Web components: `"use client"` only when needed (hooks, browser APIs, event handlers). Keep `app/**/page.tsx` as server components where possible.

---

## 5. Testing

- API unit tests: Jest + ts-jest, files `*.spec.ts` next to source under `apps/api/src/`. `jest.config.ts` sets `rootDir: src`, path alias `@/` → `src/`. Coverage excludes `main.ts`, `*.module.ts`, `*.dto.ts`.
- Existing specs: auth (`auth.service`, `auth.controller`, `auth.utils`), admin, user, mail, prisma (`prisma.service`, `soft-delete.extension`), attendance calculations.
- `UNIT_TEST_PLAN.md` is the reference test plan.
- When you change API business logic, add/update the co-located spec. Run `npm run test -w apps/api`.
- **DB integration tests**: `*.int-spec.ts` (`apps/api/jest.integration.config.ts`), run with `npm run test:integration`. They hit a real Postgres at `INTEGRATION_DATABASE_URL`, whose database name must end in `_int`, `_ci` or `_test`, because every test truncates all tables. Global setup applies migrations and sets the database timezone to `Asia/Kolkata`, so raw SQL that binds a `Date` next to a `timestamp` column fails here (§3.4). Use these for anything a mock can't prove: raw SQL, unique / partial indexes, the soft-delete extension, job locks. Helpers are in `src/test/integration/db.ts` (`resetDatabase`, `createUser`). `src/test/integration/app.ts` `createTestApp()` boots the **whole `AppModule`** through the production pipeline (`app.setup.ts` `configureApp`, shared with `main.ts`), crons stopped, and `call(user, method, path, body)` hits it over HTTP with a real signed access cookie. **Cross-user access suite**: `test/integration/access/cross-user-access.int-spec.ts` builds two mirror-image sides (`world.ts`: coach + batch + student + class + private puzzle + attempt + invoice + payroll record each) and asserts A can't reach B's rows, lists don't mention B, and wrong roles get 403. Every denial row has a positive control on the caller's own data. **A new endpoint that takes an id of something a user owns gets a row here.** Locally: `INTEGRATION_DATABASE_URL=postgresql://…/nexa_gen_int npm run test:integration`. CI runs them in the `migrations` job.
- No web unit tests currently; user-flow coverage is Playwright in `e2e/`.

---

## 6. Deployment & ops (context — don't run these yourself)

- Push to `main` → GitHub Action detects whether `apps/web/**` / `apps/api/**` / `packages/**` changed → **runs `.github/workflows/ci.yml` as a gate** (typecheck, lint, API unit tests, every migration applied to an empty Postgres + `prisma migrate diff --exit-code` against `schema.prisma`, DB integration tests on that Postgres, and `npm run build`; any failure means no deploy; skipped by the `pr-ci` job when the pushed commit has the same tree as the merged PR's head and that PR's latest CI run passed, since that run already tested this exact code) → SSH to VPS → `scripts/deploy-production.sh <sha> <services>` → `docker compose up -d --build` for the affected services only.
- Change detection only diffs the latest push, so a failed deploy is not retried by a later push that touches no app files. Redeploy with Actions → Deploy Production → **Run workflow** (`workflow_dispatch`, services `both`/`api`/`web`), which runs the full CI gate first.
- `scripts/deploy-production.sh` applies `prisma migrate deploy` from the newly built image *before* replacing the running API, so a failed migration aborts the deploy without downtime. `apps/api`'s `entrypoint.sh` also runs it on container start (idempotent; the safety net for manual starts).
- **Rollback restores images, never rebuilds.** Each service keeps `<image>:last-good` (live and healthy) and `<image>:previous` beside compose's `latest`. A failed `up` (including web's "dependency failed to start: container nexa_api is unhealthy") or health check restores `:last-good` within seconds, and a crash-looping container counts as failed immediately. A deploy that succeeded but misbehaves: Run workflow → `action: rollback` (or `scripts/deploy-production.sh --rollback [api|web]` on the box) → `:previous` + that commit's checkout, once per successful deploy, no CI, no build. Migrations are never reversed, so keep them additive. State (`last-good-commit`, `previous-commit`, `last-deploy-services`, `history.log`, the lock) lives in the gitignored `.deploy/` in the prod checkout.
- **Concurrency**: the workflow's `production` group runs one at a time (a newer pending run replaces an older pending one); on the box the script holds a flock on `.deploy/deploy.lock` and skips a commit that is an ancestor of the one live (`FORCE_DEPLOY=1` overrides). It runs from a temp copy of itself, since `git checkout -f` rewrites `scripts/deploy-production.sh` in place.
- DB backup: `scripts/backup_db.sh` via cron (OCI CLI to object storage). Restore procedure in `docs/DATABASE_RESTORE.md` — restores are CLI-only; the admin UI can list, download and trigger backups but deliberately has no restore. Every dump (that script, admin "Backup now") uses `--exclude-table-data` for `lichess_puzzles` / `lichess_puzzles_staging` — re-loadable source data; a restore reloads the release named in `lichess_catalogue_releases`. A new bulk source-data table gets the same treatment in both places. Prod-container commands in `docs/PROD_DOCKER_COMMANDS.md`.
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
9. **Payments: money is integer minor units, and access comes from an `Entitlement`, never from a gateway status or a frontend callback.** Every state change goes through `PaymentService.applyProviderState`; no provider adapter is imported outside `payments/providers/`.
10. **Invoices: a failed PDF never changes a payment.** Generation runs after the capture commits; a failure is `pdfStatus: FAILED`, not a rolled-back payment. Tax goes through the shared engine in `@nexa-chess/types`, never a local calculation, and an issued invoice is never edited — a refund gets a credit note.
11. **Dates: store UTC, localize in the browser.** No `toLocaleDateString`/`toLocaleTimeString`/`new Date(iso).toLocaleString()` in a web component (ESLint blocks it) — use `lib/datetime.ts` + `useUserTimeZone()`. No bound `Date`/`::timestamptz` next to a `timestamp` column in raw SQL — bind `${d.toISOString()}::timestamp`. API serializes with `.toISOString()`, never pre-formats. (`.agents/AGENTS.md` "Date & Time Rule".)

---

## 7b. The autonomous agent system

**Removed 2026-09-08.** Both prior autonomous managers — the original `.ai/`
(JS, `NEXA-####` tasks) and its successor `.nexa-agent/` (TS orchestrator) —
were deleted. A replacement built around Factory.ai's `droid` CLI is planned but
not started (blocked on `droid` being installed on the box). Recover either
old system from git history (`git log --all -- .nexa-agent`) if needed.

Two things still matter if you touch this repo:

- **`dev` is the base branch** for autonomous / VPS-side work and `vps_dev` is
  the database. (The old `dev_vps` branch was retired 2026-09-28; its last
  commit is kept as the tag `archive/dev_vps`.)
- **A merge into `dev` only ever happens on explicit human approval.**
  Passing tests are not permission.

The production/dev safety boundary any future agent system must enforce is
preserved at [`.agents/SAFETY.md`](.agents/SAFETY.md).

## 8. Where to look first when debugging

| Symptom | Start here |
|---|---|
| 401 loops / session drops | `src/lib/api.ts` interceptor, `auth.service.ts#refresh`, cookie options in `getCookieBaseOptions` (`COOKIE_SAME_SITE`), `middleware.ts`. A 403 "Request origin is not allowed" means the caller's origin is missing from `CORS_ORIGIN` |
| "model X does not exist on PrismaService" | missing getter in `prisma.service.ts` |
| Deleted rows still showing / unique constraint on re-create | `soft-delete.extension.ts` relation filters, missing partial unique index |
| Prod missing a table | migration not committed / `db push` was used |
| Web: unstyled HTML or missing `.next/server` chunk | `npm run dev:web:clean` |
| API: missing module from `dist` | `npm run dev:api:clean` |
| A class ended by itself / a class stayed LIVE after the coach left | `LiveClassService.sweepStaleClasses` (per-minute, job lock `live-class.stale-sweep`): coach absent mid-class → `coachAbsentSince` → ends after `LIVE_CLASS_COACH_ABSENT_GRACE_MINUTES`; coach absent after `endsAt` → ends at once; `LIVE_CLASS_MAX_OVERRUN_MINUTES` past `endsAt` → ends regardless (0 disables a rule). A coach-absence end records `endedAt` = when the coach left, so attendance excludes the grace minutes. A coach/admin who can't get back in can end it from `/classes/:id` or the Connection lost screen (`EndClassButton`) |
| Live class attendance wrong | `attendance` module calc + `AttendancePolicy` row, LiveKit webhook parsing in `main.ts` |
| "Start" refused / button says "Opens at …" | The start window (`getClassStartAvailability`, §3.6j1): at most `CLASS_EARLY_START_MINUTES` early, never after `endsAt`. A missed class is rescheduled through a class change request |
| Attendance duration absurdly large locally / `Left: —` beside a real duration | LiveKit webhooks can't reach `localhost`, so `participant_left` never arrives and finalize closes the session itself. `finalizeClassAttendance` clamps every session (open or closed) to the class end and derives `joinedAt`/`leftAt` from the logs — if a duration is still hours long, the raw SQL in `closeOpenAttendanceLogs` must bind the cutoff as `${iso}::timestamp` (the columns are `timestamp WITHOUT time zone` holding UTC; a `Date` param is `timestamptz` and PG shifts it by the box's offset unless the DB runs in UTC) |
| A student's attendance looks truncated (marked "left") while they were still in class | They likely had two tabs open. Session closing is `clientId`-scoped (`AttendanceLog.clientId`, `attendance-session.util.ts#selectSessionToClose`) so one tab's leave can't close a different tab's still-open session — if it did, something bypassed `AttendanceService.recordLeaveEvent`/`recordDisconnectEvent`'s clientId param. See `docs/RELIABILITY_DESIGN.md` §2.8 |
| "No microphone/camera found" or a device error toast in class | The toast/Settings text comes from `describeMediaError` (`lib/mediaDevices.ts`). "Access blocked" = site or OS permission; "busy" = another app/tab holds it; "not found" with devices plugged in usually means the browser is hiding them until permission — Settings → "Scan devices". A stale saved device should never fail a toggle: if it does, something selected with an `exact` constraint (see Media devices in §3.7). Saved picks live in `localStorage` key `nexa-live-class-media` |
| No class audio on a phone / sounds like an earpiece call | `AudioSessionBridge` — `navigator.audioSession.type` routing, the first-tap `room.startAudio()` fallback, and the `<audio>` element sweep. A browser without the Audio Session API can only be fixed by the user's own volume/route |
| A private message reached the wrong person, or a student DM'd a student | `privateChatRecipientAllowed` in `packages/types/src/live-class-moderation.ts` — it gates the API write, the composer, *and* the inbound-packet filter in `ChatProvider`. All three must agree |
| Coach's mute button does nothing | `POST /live-class/:id/moderate` needs the class LIVE and the caller to own it; a `muted: false` response means that source was already off, not a failure |
| Raise hand does nothing (students) | it must ride the `hand_raise` **data channel** (`features/live-class/lib/handRaise.ts` + `HandRaiseBridge`), never `participant.setAttributes` — attributes and metadata share the `canUpdateOwnMetadata` grant, which students are deliberately issued as `false` so they cannot forge the signed `{ role }` metadata. Students do hold `canPublishData` |
| API logs | JSON on stdout via `nestjs-pino` (`common/logging/logger.config.ts`): one line per request with `req.id` (also returned as `x-request-id`), method, path **without query string**, status, latency; `/health`, `/stockfish` and presence heartbeats aren't logged. `LOG_LEVEL` (default `info` in production). `docker logs nexa_api | grep '"req":{"id":"<id>"'` follows one request |
| LiveKit webhook returns 503 | Processing threw (usually the DB). The dedupe claim in `processed_webhook_events` is released first, so LiveKit's retry is processed rather than skipped. Look for "Error processing LiveKit webhook" in the API logs |
| LiveKit webhook rejected (401) | signature check in `attendance-webhook.controller.ts` — every payload is verified, there is no bypass header; the `sha256` claim must be **base64** (see `e2e/fixtures.ts#createWebhookSignature`) |
| Recording won't play / download | `nexa_egress` container up + `./recordings` volume mounted on `api` and `egress`; local files stream via `/live-class/:id/recording/stream` (signed `st` token, 15m), otherwise fall back to OCI (`OCI_*` env still required); `RECORDING_MIN_RETENTION_DAYS` guards auto-prune |
| Recording never produces a file (`StartRoomCompositeEgress` times out) | `docker logs nexa_egress` on boot — "not enough cpu for some egress types" means the node advertises itself as unable to run a composite and *no* node picks the request up. Lower `cpu_cost.room_composite_cpu_cost` in the `egress` `EGRESS_CONFIG_BODY` (this 2-vCPU box uses 1.5) and keep the API's `EncodingOptionsPreset` within it |
| Recording has video tiles but no chessboard | `RECORDING_TEMPLATE_BASE_URL` unset (or unreachable from the `egress` container) → egress falls back to its built-in grid template, which renders published video tracks only. The board is data-channel state, not a track, so it only appears via the custom template at `apps/web/src/app/recorder/[classId]` |
| Recording has video but no audio | `RecorderClient` must `track.attach()` every remote **audio** track to an unmuted, playing element — room-composite egress records the tab's audio output, and the `<video>` tiles are `muted`. Check the `.recorder-audio-sink` div is populated and `--autoplay-policy` isn't blocking egress' Chrome |
| Board went back to the start position after the coach refreshed | The restore in `useBoardPersistence` found no snapshot: either nothing had been saved yet (the first save lands up to 2s after a change), or the `PUT` was refused (it needs the class LIVE and the caller to be the coach/admin). Check `live_sessions.boardState` / `boardStateUpdatedAt` for the class |
| Recorder template films a blank board | the coach never answered `REQUEST_SYNC`. `LiveClassRecordingService.requestBoardSyncForRecorder` injects it on topic `board_sync` at 4s and 9s after egress starts; the template joins hidden + subscribe-only so it cannot ask for itself |
| Recording completes but the file isn't on disk | `RECORDING_STORAGE_TARGET` — `local` (default) writes into the mounted volume, `oci` makes egress upload straight to the bucket and the quota / retention prune / storage analytics then see nothing |
| CORS / cookie not set in prod | `CORS_ORIGIN` (comma-separated), `FRONTEND_URL` must be https for `secure` cookies; `COOKIE_DOMAIN` (auto-derives `.registrable.tld` from `FRONTEND_URL`) shares the session across `api.`/`www.` subdomains; `TRUST_PROXY_HOPS` (nginx = 1) for X-Forwarded-* |
| Rate limits reset unexpectedly / not shared | `REDIS_URL` unset (in-memory counters, gone on restart), or `ResilientThrottlerStorage` logged "counting rate limits in-process" — Redis is unreachable and it degraded on purpose rather than 500 every route |
| Queued jobs never run | `REDIS_URL` unset → `QueueModule` logged "background queues are disabled" at boot and every producer hits `createDisabledQueue`. Otherwise check the worker is a provider in a module that imported `QueueModule.registerQueue(<name>)`, and that `QUEUE_PREFIX` matches between producer and worker |
| A messaging rule doesn't fire | the rule is off by default — check `/admin/messaging`, then the Delivery log tab: a QUEUED row means the outbox has it (immediate rules send within a minute; a scheduled rule waits for its time, shown as "due ..."), RETRYING means the provider failed retryably, SKIPPED means no usable phone number |
| Messages sit QUEUED forever | `MessagingDeliveryWorker`'s cron isn't running (is `ScheduleModule.forRoot()` still in `app.module`?), or every row is stuck claimed — `claimedAt` is only reaped after 5 minutes |
| A rule fires twice | the `dedupeKey` differs between runs. Scheduled events key on the entity + the moment (`ASSIGNMENT_DUE_SOON:<id>:<dueDate>`), so a rescheduled deadline deliberately reminds again |
| Class reminder is late by a few minutes | `MessagingScheduler.classReminders` sweeps every 5 minutes — a 30-minute rule sends 30-35 minutes ahead, by design |
| WhatsApp message never arrives | `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` unset ⇒ `ServiceUnavailableException` before any request. Otherwise the logged failure carries Meta's own code: `131047` = outside the 24h window (send an approved template instead), `132xxx` = template name/params wrong, `190` = expired token, `130429`/`131056` = rate limited (retryable) |
| A discount code is refused | the API returns a `DiscountRejection` reason, not a generic error — check it against `DISCOUNT_REJECTION_MESSAGES`. `METHOD_NOT_ELIGIBLE` is the common one: a method-scoped code cannot be priced until the buyer picks that method |
| A code was applied but the order shows no discount | it is re-resolved at checkout, so it had expired, hit a limit, or did not match the chosen method by then. The order is correct; the preview was stale |
| A limited code shows fewer uses than expected | redemptions are recorded at CAPTURE — abandoned checkouts deliberately do not count |
| A batch's price does not appear at checkout | the price option is a `Plan` with that `batchId`; check it is `isActive`, and that its `allowedMethods` still intersect what the gateways can serve |
| A monthly plan charged once and never again | it opened a one-off payment instead of a mandate — check the router had a `supportsRecurring` gateway for that currency, and that the provider's subscription webhooks reach `/payments/webhooks/*` |
| Payment stuck "pending" forever | the reconciliation sweep (`payment-reconciliation.service.ts`, every 5 min, job lock `payments.reconciliation`) asks the gateway directly — check it is running and that the payment has a `providerPaymentId`/`providerOrderId` to ask about. A payment with neither never reached the gateway and expires after `PAYMENTS_ORDER_TTL_MINUTES` |
| Payment succeeded at the gateway but no access | the entitlement is what grants access, not the payment. Check `entitlements` for `(orderId, planId)`; if the payment is PAID and there is no row, the plan was deleted (logged) or the capture transaction rolled back. `POST /admin/payments/:id/reconcile` re-runs it safely |
| A coach's manual payment never grants access | expected — it sits `PENDING` until an admin approves it in Admin → Payments → "Manual payments". Check `ManualPaymentRecord.status`; an admin's own record instead auto-approves |
| "Manual payments don't reconcile with a gateway" / "have no gateway adapter" | expected — someone clicked reconcile/retry, or tried to refund, a `Payment` with `provider: MANUAL`. There is no gateway to ask; approve/reject the `ManualPaymentRecord` instead, and reversal is a separate operational step (§3.6f), not a refund |
| Manual payment "View proof" shows nothing / 404s | `CLOUDINARY_*` unset (`ManualPaymentAttachmentStorage.isConfigured()` false — the upload was silently skipped, same optional-storage pattern as invoice PDFs), or the file was never attached (it's optional at record time only, no edit-after route) |
| Webhook returns 400 "Invalid webhook signature" | the gateway's webhook secret does not match the env var, or a JSON parser claimed the route before `express.text` in `main.ts` and the raw bytes were re-serialised. Never "fix" this by skipping verification |
| A webhook fires twice and grants twice | it cannot — `(provider, eventId)` is unique and `(orderId, planId)` on entitlements is unique. If it did, something bypassed `PaymentService.applyProviderState` |
| Checkout says "no payment gateway is available" | every gateway is unconfigured (`RAZORPAY_KEY_ID` / `CASHFREE_APP_ID` / `STRIPE_SECRET_KEY` all unset), or `PAYMENTS_ENABLED=false`. Health alone never causes this — a degraded gateway is still used rather than refusing money |
| A method is missing from the checkout screen | `PaymentRouterService.availableMethods` only lists a method when the routed gateway's own adapter says it can serve it in that currency — Stripe deliberately reports no UPI flows |
| Refund stuck PROCESSING | normal for days; banks are slow. `RefundService.reconcilePending` (every 30 min) reads the gateway. A refund left PENDING after a timeout is deliberate — the gateway may have taken it, so never issue a second one without reconciling |
| Invoice PDF never renders and the log says "Custom Id cannot contain :" | A BullMQ `jobId` may not contain a colon. `invoice-queue.ts` uses `--`; anything reintroducing `:` makes every enqueue throw and leaves PDFs to the 10-minute sweep |
| Queued invoice PDFs never run | `REDIS_URL` unset means the service renders inline instead (check the boot log for "background queues are disabled"). Otherwise confirm `InvoiceProcessor` is a provider in PaymentsModule and that `QUEUE_PREFIX` matches between producer and worker |
| Invoice WhatsApp arrives without the PDF attached | The upload to Meta failed or WhatsApp is unconfigured, and it degraded to the link by design — the warning names the provider error. Outside the 24h window a free-form document is rejected: give the rule an approved template name whose header is a DOCUMENT |
| Invoice WhatsApp went to the student, not the parent | It is addressed to the invoice's `billingPhone`, which is snapshotted from the billing profile at issue time. An invoice issued before the parent's number was saved carries the account's instead |
| Invoice has no PDF / "Generation failed" | The payment is fine — only the artifact failed. `pdfError` on the row says why; `sweepFailedGenerations` retries every 10 min, and Admin → Invoices has a manual retry. A download still works: a missing archive is re-rendered on demand |
| Invoice PDF shows boxes instead of ₹ | The font lost the glyph. `invoice-pdf.service.ts` resolves pdfmake's bundled Roboto through `require.resolve("pdfmake/package.json")`; a bundler or Docker layer that drops `node_modules/pdfmake/fonts` is the usual cause |
| Invoice charged CGST+SGST when it should be IGST (or vice versa) | The treatment comes from `resolveTaxTreatment` — check the seller's GSTIN in Admin → Invoices → Billing & invoicing and the buyer's GSTIN on their billing profile. The first two digits of each GSTIN are the state code, and that comparison is the whole decision |
| An invoice is billed to the student, not the parent | `BillingProfileService.resolve` — the buyer has no saved `BillingProfile` and their `StudentProfile.parentName` is empty, so it fell through to the account. Billing details are frozen at issue, so fixing the profile only affects the next invoice |
| Invoice email never arrives / arrives twice | `emailSent` is claimed by a conditional update *before* the send, so a second webhook is a no-op by design. Never arriving means SMTP is unset, the invoice has no billing email, or an admin turned `emailOnIssue` off. Admin → Invoices → Resend is the deliberate override |
| Invoice number skipped a value | Expected. Numbers are allocated from `InvoiceSequence` and never reused, so a rolled-back capture consumes one permanently |
| Fonts or text size don't change after saving | `TypographySync` must be mounted in `AppProviders` and the font id needs a loader in `app/fonts.ts` (a missing `--font-<id>` variable silently falls back to system-ui). A locked `TypographySettings` row ignores personal preferences by design. A stale look on first paint comes from the `nexa-typography` cache and corrects itself once `/typography` resolves |
| A chessboard ignores the user's theme/piece-set choice | that board component isn't reading `useChessAppearance()` — check it has `data-nexa-board-theme`/`data-nexa-piece-set` on the same element chessground mounts onto, and that `features/chess-appearance/styles/index.css` is imported (once, in `AppProviders.tsx`) |
| A settings-page preference save wiped out a different saved field | shouldn't happen — `updateMyPreference`/`updateGlobalSettings` merge onto the existing stored override via `mergeChessAppearanceOverrides`, never replace wholesale. If it did, something bypassed `ChessAppearanceService` |
| Board looks unstyled for a split second / flashes brown | expected only while `ChessAppearanceProvider`'s query is loading — it should fall back to `DEFAULT_CHESS_APPEARANCE` (Nexa Classic), never blank chessground defaults; if it's showing chessground's own brown/cburnett, a component still imports `chessground/assets/*.css` directly instead of relying on the shared stylesheet |
| Type mismatch web↔api | `packages/types` is the single source; rebuild/typecheck both |
| A student's puzzle points look wrong | Points are computed on read by `computePuzzlePoints` from the assignment's frozen `scoringJson` (not the admin default *now*, and not the puzzle's current override) plus `adjustmentsJson`. Wrong moves come from `PuzzleAttempt.wrongMoves` — a client that never calls `saveProgress` for a move can't have it counted. A student who sees only their own row is being filtered by `leaderboardJson.visibility` / `topN` on purpose |
| `nexa_api` unhealthy / deploy aborted on the health gate | `curl localhost:3001/health/ready` on the box: `503` with `database: down` means the API can't reach Postgres (`DATABASE_URL`, `nexa_postgres` up?); the reason is in `docker logs nexa_api` as `Health check "database" failed: …`. `degraded` (Redis down) does not fail the healthcheck. `/health` alone answering means the process is up |
| `auth_sessions` / token tables keep growing | the retention sweep isn't running or can't take its lock — look for `Pruned …` / `Retention sweep failed for …` from `RetentionService` in `docker logs nexa_api`, and the `retention.sweep` row in `job_locks` |
| Nothing arrives in Sentry | DSN unset (API: `SENTRY_DSN` at runtime; web: `NEXT_PUBLIC_SENTRY_DSN` is baked in at **build** time, so rebuild web). An `HttpException` is never reported by design. Browser events can be blocked by ad blockers |
| Sentry web stack traces are minified | the web build had no `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_WEB_PROJECT`, so no source maps were uploaded. Turbo only passes them through because `turbo.json` declares them |
| Admin analytics numbers look stale | in-process 5-min cache in `analytics-cache.ts`; hit Refresh (adds `?fresh=1`) or set `ANALYTICS_CACHE_TTL_SECONDS=0`. Storage growth/forecast empty until ~14 `storage_snapshots` rows exist (daily `AnalyticsScheduler` cron, job lock `analytics.storage-snapshot`) |
| Analytics endpoint 403 for an admin | `assertCanViewAnalytics` allows only `ADMIN`/`SUPER_ADMIN`; coaches/students get 403 by design |
| `DAU/WAU/MAU` shows "Data unavailable" | no `analytics_events` rows yet — they accrue from deploy (login / class-join / assignment-attempt / recording-watch) |
| A student never gets asked for feedback | the form must be active and inside its `startsAt`/`endsAt`; an `AFTER_CLASS` form only counts classes that ended *after* the form's start (or creation), that were `COMPLETED`, belonged to a batch in `batchIds` (empty = all), and that the student attended (not `ABSENT`). `RECURRING`/`ONE_TIME` need at least one such class with that coach. Then check the placement — the class-end screen only shows `CLASS_END` forms |
| Feedback shows up again after the student answered | it's a different `contextKey` — the next class, or the next `RECURRING` period — by design. Same key twice would be a 409 |
| A demo guest is told to wait for the coach / can't get in | The class is `INVITE_ONLY` and their phone/email doesn't match an invite — normalization is `normalizeRecipient` (`WHATSAPP_DEFAULT_COUNTRY_CODE`). The coach admits them from the People panel's waiting list; an admin can also add them in Demo Classes → details, which approves the pending row |
| `/demo/<slug>` says "no upcoming session" | The schedule is paused, or every generated slot clashed with the coach's other classes (logged as "coach busy … slot skipped"), or the hourly top-up cron isn't running |
| Analytics timezone off by a day | all bucketing goes through `zonedDayBounds`/`zonedMonthBounds` + `date_trunc(... AT TIME ZONE tz)` using the requesting admin's `User.timezone`; check that column |
