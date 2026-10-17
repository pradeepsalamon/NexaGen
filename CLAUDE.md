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

`playwright.config.ts` + `e2e/*.spec.ts` (attendance, analytics, recording, live-board-sync, analysis-board, pre-class-settings, puzzles, live-class-puzzle). Reads `.env.e2e` (gitignored, loaded by `playwright.config.ts`; copy `.env.e2e.example` — never put real `vps_dev`/production secrets in it). Not part of `npm test`; run with `npx playwright test`. Several specs are opt-in behind a `RUN_*_E2E=1` env var (they mutate the shared dev DB and/or need LiveKit) — check the header comment.

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
   user not `ACTIVE` / the token's `sessionId` missing or revoked in `auth_sessions` all become
   a 401 (never the 500 a raw `TokenExpiredError` turns into) — so logout, a password reset or
   refresh-token reuse ends the access token at once, not 15 minutes later.
   Pass `{ include: { … } }` as a 4th argument to load relations; `verifyAccessToken` is the
   no-DB variant. **Never hand-roll `jwtService.verifyAsync` for an access token** — the 25
   copies this replaced had drifted (admin/backup skipped the ACTIVE check, Stockfish trusted
   the token's role). The module `*-auth.helper.ts` files re-export it.
3. **Role checks** are private `assertCanX(user)` / inline `if (user.role !== ...) throw new ForbiddenException(...)` helpers in the service.
4. **Row-level visibility** is a private `getXVisibilityWhere(user)` returning a `Prisma.WhereInput` (admins get `{}`, coaches/students get scoped filters). See `batch.service.ts` for the reference implementation.

Policy (who may do what, per resource) and the 2026-10-16 audit live in
[docs/AUTHORIZATION.md](docs/AUTHORIZATION.md). Parse a param/query inside a
handler with `parseOrBadRequest` (`common/zod-body.pipe.ts`), never a bare
`schema.parse` — a ZodError is a 500, thrown before the handler has even
authenticated anyone. A single query value headed for a Prisma `where` goes
through `queryEnum` / `queryString` (`common/query-params.ts`): a repeated key
arrives as an array and an unknown enum value only fails inside Prisma, both
500s until checked (`test/integration/access/query-validation.int-spec.ts`).

**File uploads**: multer buffers the whole body in memory *before* the handler's auth runs, so every multipart route is `@UseInterceptors(RequireAccessTokenInterceptor, FileInterceptor("file", { limits: { fileSize, files: 1, fields } }))` — the interceptor (`common/security/`) rejects a missing/forged access token before any bytes are read, and `limits` makes an oversize file a 413 instead of an unbounded buffer. The handler still calls `authenticateUser`.

When adding a new module, **follow this pattern** — do not introduce a guard-based approach unless you are deliberately refactoring all modules and the maintainer agreed. `common/security/route-auth.spec.ts` fails any route handler that never passes its `request` to something (i.e. can't be reading the cookie); a deliberately public route goes on its `PUBLIC_ROUTES` list.

**Two-factor (TOTP)** lives in `auth/mfa/` (`MfaService`, `MfaController`, routes `API_ROUTES.auth.mfa*`, table `user_mfa`). Production refuses to boot without `MFA_ENCRYPTION_KEY` while `MFA_REQUIRED_ROLES` names a role (`NONE` opts out; an empty value falls back to the compose default) (`packages/config/src/api.ts`), so required MFA can't silently switch off. With `MFA_ENCRYPTION_KEY` set, a correct password for an MFA-enabled account — or any account whose role is in `MFA_REQUIRED_ROLES` (default `SUPER_ADMIN,ADMIN`) — returns `{ mfaRequired: "VERIFY" | "SETUP", challengeToken }` instead of cookies; `/auth/mfa/verify` (code or single-use recovery code) or `/auth/mfa/enable` (first enrollment) then finishes the login via `AuthService.completeLogin`. The challenge is a 10-minute JWT of `type: "mfa_challenge"`, so it can never pass as an access token. Secrets are AES-256-GCM encrypted; `lastUsedStep` blocks code replay. Wrong codes are 400 (not 401) so the web client's refresh-and-retry doesn't fire. Wrong codes are also counted **per account** (`user_mfa.failedAttempts`): the 5th (`MFA_MAX_FAILED_ATTEMPTS`) sets `lockedUntil` 15 minutes ahead, during which every code — even a correct one — is a 429. The route's IP throttle alone let guesses spread across many IPs; an admin stuck behind a lock can be cleared with `UPDATE user_mfa SET "lockedUntil" = NULL WHERE "userId" = '…'`. Students can't enroll. Lost device + no recovery codes: `DELETE FROM user_mfa WHERE "userId" = '…'`, and the next login forces setup again. Changing `MFA_ENCRYPTION_KEY` invalidates every enrolled authenticator.

**Login lockout**: wrong passwords are counted per account (`users.failedLoginAttempts`); the 10th (`LOGIN_MAX_FAILED_ATTEMPTS`) sets `loginLockedUntil` 15 minutes ahead, during which login is a 429 even with the right password. A correct password or a completed password reset clears it; by hand: `UPDATE users SET "loginLockedUntil" = NULL, "failedLoginAttempts" = 0 WHERE email = '…'`. The IP throttle (5/min) alone missed guessing spread across many IPs.

**Changing the account email** (`PATCH /auth/profile`) requires `currentPassword` (400 if missing or wrong; the route is throttled 10/min), revokes every other session family, and mails a notice to the old address — the email is what password reset trusts, so a stolen session alone must not move it.

Cookies: `AUTH_COOKIE_NAMES` = `nexa_access_token` / `nexa_refresh_token` (see `apps/api/src/auth/types/`). Access TTL 15m, refresh 1d (no "remember me") or 7d (remember me). Refresh tokens rotate on every use and are sha256-hashed in `auth_sessions` (bcrypt would only read the JWT's first 72 bytes; old bcrypt rows still verify). A rotation sets `rotatedAt` (claimed atomically); `revokedAt` means logout / password reset / reuse and is **never** revived. Within 30s of a rotation the old token may mint a sibling in the same `familyId` (concurrent tabs); after that a replay revokes the whole family. Logout revokes the family. `getCookieBaseOptions` (`@nexa-chess/config/api`) sets every cookie: `secure` when `FRONTEND_URL` is https, `sameSite` from `COOKIE_SAME_SITE` (default `lax` — web and API are same-site subdomains). **CSRF defence**: `app.setup.ts` `configureApp` (shared by `main.ts` and the integration test app) registers only the JSON body parser (no urlencoded), then defaults a missing body to `{}` (body-parser 2 leaves it undefined; Express 4 didn't), and `common/security/origin-check.ts` rejects a POST/PUT/PATCH/DELETE whose `Origin` (or `Referer`) is not in `CORS_ORIGIN` with 403; webhook paths are exempt. A new webhook route must be added to that exempt list. **Security headers**: the API sends `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and (over https) HSTS on every response (`common/security/security-headers.ts`); the invoice HTML routes add `INVOICE_HTML_CSP`. The web's headers live in `next.config.mjs` `securityHeaders()`: an enforced CSP of `frame-ancestors`/`object-src`/`base-uri` only, plus a **report-only** full CSP whose console violations are how to find origins before enforcing it — a new third-party script, iframe or fetch host needs adding there.

### 3.3 Validation

- **Web forms**: react-hook-form + `@hookform/resolvers/zod`, schemas from `@nexa-chess/types` or `features/*/validation/`.
- **API**: two co-existing styles —
  - `class-validator` DTOs implementing the shared request type (`apps/api/src/batch/dto/batch.dto.ts`). Global `ValidationPipe({ transform: true, whitelist: true })` is on in `main.ts`.
  - Inline `ZodPipe` wrapping a shared Zod schema (`apps/api/src/coach/coach.controller.ts`). `nestjs-zod` is a dependency.
  - Match whatever the module you're editing already uses.

### 3.4 Prisma & soft delete

- `PrismaService` (`apps/api/src/prisma/prisma.service.ts`) wraps `PrismaClient` and **manually re-exports a getter per model**. **If you add a model to `schema.prisma`, you MUST add its getter here** or the build breaks. (`.agents/AGENTS.md` rule.)
- **Always create a migration** for schema changes: `npm run db:migrate:dev -- --name <name>`. Never rely on `db push`. Migrations live in `apps/api/prisma/migrations/`. **Never hand-write the timestamp in a migration folder name** — let `db:migrate:dev` / `db:migrate:create` stamp the current UTC time. Hand-bumped names (`20261016…`–`20261020…`) ran ahead of the real date, so a newly created one can sort before already-applied migrations; until that date passes, name new ones after the latest folder. Never rename an applied migration (`_prisma_migrations` keys on the name; a rename re-runs it).
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

**Route RBAC lives in one table, `src/lib/routeAccess.ts`** (`ROUTE_RULES`: `/admin` staff, `/admin/{backups,classes,demo-classes,trash}` SUPER_ADMIN, `/coach` COACH, `/student` STUDENT, `/checkout` `/classes` `/plans` `/profile` `/chess-board` `/games` `/messages` any signed-in user). `middleware.ts` redirects a visitor with no session cookie to `/login?reason=unauthorized`, and a wrong role to their own dashboard — reading the role from the access-token payload *without verifying it* (an expired token still names the role). A refresh-only session has no role cookie, so `SessionBootstrap` applies the same `canAccessPath` once `/auth/me` resolves. It is a routing affordance only; the API enforces every role. **A new protected route = a `ROUTE_RULES` entry + a `matcher` entry in `middleware.ts`**, never a per-page cookie check. Its name goes in `lib/pageTitles.ts` (`PAGE_TITLES`): the tab title (`metadata.title: pageTitle(...)`) and header label both read it (docs/UI_RULES.md §4).

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

`apps/api/src/queue/`, BullMQ on the shared `redis` service. **Queues are optional**: with `REDIS_URL` unset no worker runs and every `@InjectQueue()` is `createDisabledQueue` (logs and drops), so an enqueue is best-effort — persist your own status row first and treat the enqueue as a nudge. Each module declares its own queue name; pass a `jobId` derived from your row (never containing `:`).

**Cron single-runner: `JobLockService.runExclusive(JOB_LOCKS.x, run)`** — add one `JOB_LOCKS` name per job. **Never use session `pg_try_advisory_lock` through Prisma** (the pool leaks the lock). A new ever-growing log table belongs in `RETENTION_RULES` (`apps/api/src/retention/`).

Details: [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md).

### 3.6c Rate limiting

Global `UserThrottlerGuard` (100/min; auth 5/min, password reset 3/min), keyed by `user:<id>` with a valid access token, else by IP (and always by IP on `/auth/*`). Redis-backed when `REDIS_URL` is set, with an in-process fallback — the storage must never throw. Details: [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md).

### 3.6d Outbound WhatsApp

`apps/api/src/whatsapp/` (`WhatsAppService`, Meta Cloud API). Optional — unconfigured ⇒ a send throws `ServiceUnavailableException`. Free text only lands inside the 24h window; otherwise use an approved template. One network attempt per call (retries belong to a job). **Features never call it directly** — they go through `MessagingDispatchService` (§3.6e). Details: [docs/MESSAGING.md](docs/MESSAGING.md).

### 3.6d2 Error reporting (Sentry)

`@sentry/nestjs` + `@sentry/nextjs`, optional (unset DSN ⇒ nothing sent), errors only; `HttpException`s are never reported. `apps/api/src/instrument.ts` must stay the first import in `main.ts` and must not call `getApiEnv()`. **Privacy — students are minors:** only `user.id` + a `role` tag, no query strings; never `setUser` with an email/name and never loosen `dataCollection`. Details: [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md).

### 3.6e Admin messaging rules

`apps/api/src/messaging/`, page `/admin/messaging`. One `MessagingRule` per `MessagingEvent`; catalogue, defaults and template renderer live in `@nexa-chess/types` (`messaging.ts`) — use them. **`MessagingDispatchService.dispatchInBackground(request)` is the only entry point** (it never throws); a new trigger extends `DispatchRequest` + `resolveRecipients`. Dispatch writes PENDING `message_deliveries` rows (the unique `dedupeKey` is the idempotency guard) and `MessagingDeliveryWorker` sends them. Adding an event = both `MessagingEvent` and `NotificationType`. Details: [docs/MESSAGING.md](docs/MESSAGING.md).

### 3.6f Payments (Razorpay / Cashfree / Stripe)

`apps/api/src/payments/` + `features/payments/`. **Read [docs/PAYMENTS.md](docs/PAYMENTS.md) before touching anything here.** The non-negotiables (also §7 rule 9):

- Business logic talks to `PaymentService` only; **no provider adapter is imported outside `payments/providers/`**.
- **Money is integer minor units**; `toMinorUnits` is the only conversion.
- **`applyProviderState` is the single state funnel** (webhooks, verify, reconcile, manual payments) with a rank guard.
- **Access is an `Entitlement` row**, granted in the capture transaction — nothing else enrols a student off a payment.
- Double-payment protection is the unique `orders.idempotencyKey`; webhooks keep raw bytes (`express.text` in `main.ts`) for signature checks; a refund is only settled by a webhook/reconcile read.
- Discounts are the one price-changing mechanism (`computeDiscount`), tax on the discounted subtotal, consumed at capture.
- Financial models are never soft-deletable or Trash-registered.

### 3.6g Invoices, PDFs and credit notes

`payments/invoice*.ts`, `credit-note.service.ts`, `features/invoices/`. An invoice is a **frozen snapshot** issued in the capture transaction; tax only via the shared engine in `@nexa-chess/types` (`invoices.ts`); **PDF generation never touches the payment** (runs after commit, `pdfStatus: FAILED` + sweep); a refund gets a credit note, never an edit. Details: [docs/PAYMENTS.md](docs/PAYMENTS.md).

### 3.6h Chess board appearance

`chess-appearance/` (API + web). 3-layer resolver (system → admin singleton → user preference) in `@nexa-chess/types` (`chess-appearance.ts`); saves **merge** via `mergeChessAppearanceOverrides`. **Every chessboard reads `useChessAppearance()`** — no hardcoded board styling — and appearance is never synced over live-class data topics. Details: [docs/APPEARANCE.md](docs/APPEARANCE.md).

### 3.6i Coach feedback & ratings

`feedback/` (API + web). Pending feedback is **computed, never stored** (`computePendingFeedback`); submit/skip recompute and match the target; the unique `(formId, studentId, coachId, contextKey)` is the double-submit guard. Details: [docs/FEATURES.md](docs/FEATURES.md).

### 3.6j Fonts & text size (typography)

`typography/` (API + web). Same 3-layer resolver as §3.6h (`typography.ts` in `@nexa-chess/types`). Fonts are self-hosted via `next/font/local` — **never `next/font/google`** (it broke CI). Adding a font = `fontIdSchema` + `FONT_CATALOG` + the vendor script (`apps/web/scripts/vendor-google-fonts.mjs`), then re-run it. Arbitrary `text-[13px]` sizes don't scale — prefer rem. Details: [docs/APPEARANCE.md](docs/APPEARANCE.md).

### 3.6i2 Puzzle-set assignments (multi-puzzle homework)

`activityType: PUZZLE_SET` assignments: ordered `AssignmentPuzzle` rows **referencing** library puzzles, solved through ordinary `PuzzleAttempt`s (`PuzzleAttemptService` stays the only attempt engine). Points are never stored (`computePuzzleSetResults`). Assigning from the library is always a PUZZLE_SET. Details incl. homework-approved folders: [docs/PUZZLES.md](docs/PUZZLES.md).

### 3.6j1 Class timing rules (start window, upcoming / past, not held)

`@nexa-chess/types` `class-availability.ts` is the one place that decides where a class sits in time (`resolveClassDisplayStatus` / `NOT_HELD`, `isUpcomingClass`, `isPastClass`, `getClassStartAvailability`, `canJoinClass`) — use it, don't re-derive from `status`. Details: [docs/CLASSES.md](docs/CLASSES.md).

### 3.6j2 Batch type & dashboard upcoming classes

`BatchType` (`GROUP` / `INDIVIDUAL` / `BUDDY`) resolves roster size → `Batch.batchType` → `CoachClass.batchType` via `resolveBatchType`. Dashboard upcoming-class widgets for coach and student. Details: [docs/CLASSES.md](docs/CLASSES.md).

### 3.6k1 Move tree, variations & Game Library

`packages/types/src/move-tree.ts` is the one branching move tree (a different move **adds a variation, never truncates**; callers pass a `MoveTreeChessFactory`). Game Library: `game-library/` (API + web), pages `/games`; `GameRecorderService` copies class games fire-and-forget, idempotent on `sourceKey`. Details: [docs/FEATURES.md](docs/FEATURES.md).

### 3.6k2 Persistent chat (outside live classes)

`chat/` (API + web), page `/messages`, separate from in-class chat. **`directChatAllowed` (`packages/types/src/chat.ts`) is the single rule** (never student ↔ student). Sends idempotent on `(senderId, clientId)`; no websocket — the web polls. Details: [docs/FEATURES.md](docs/FEATURES.md).

### 3.6k3 Assignment due-date reminders

`resolveAssignmentDueStatus` (`packages/types/src/assignment-reminders.ts`) is the one due-status rule; `AssignmentReminderService` is read-only. Details: [docs/FEATURES.md](docs/FEATURES.md).

### 3.6k3b Smart Revision (spaced repetition)

`revision/` (API + web), page `/student/revision`; pure scheduler in `packages/types/src/revision.ts`. A `RevisionItem` references a puzzle/folder; a review is a `PuzzleAttempt` with `context: REVISION`; the grade is capped by the graded attempt and never inferred. Full rules: [docs/SMART_REVISION.md](docs/SMART_REVISION.md); summary: [docs/FEATURES.md](docs/FEATURES.md).

### 3.6k3c Game analysis, tactics, game sources, game insights

`game-analysis/`, `game-sources/`, `stockfish/`; shared rules in `packages/types/src/game-analysis*.ts`, `game-tactics.ts`, `game-sources.ts`. **Evaluations are White-relative** (convert only with `normalizeUciScore`); classifier/accuracy/tactics versions are stored with every result. The `game_analyses` row is the job (no Redis), on the engine pool's `background` lane. Only finished games are analysed. Method: [docs/GAME_ANALYSIS.md](docs/GAME_ANALYSIS.md), imports: [docs/GAME_SOURCES.md](docs/GAME_SOURCES.md); summary: [docs/FEATURES.md](docs/FEATURES.md).

### 3.6k4 PDF chess-diagram import

`@nexa-chess/types` `diagram-recognition.ts` / `diagram-position.ts` + `features/diagram-import/`. **The PDF never leaves the browser**; pdf.js loads from `public/vendor/pdfjs/` via a `webpackIgnore`'d import — don't bundle it. A diagram is pieces only: side to move/castling are never assumed. Details: [docs/FEATURES.md](docs/FEATURES.md).

### 3.6k Demo classes (guest access, invites, static schedules)

`demo-class/` + admin demo methods + public page `app/demo/[classId]`, super-admin only. A guest is a `DemoClassRegistration`, not a user; **`DemoInviteService` is the only way to add a guest**. Static demo schedules generate ordinary demo `CoachClass` rows (cron job lock `demo-schedule.top-up`). Details: [docs/CLASSES.md](docs/CLASSES.md).

### 3.6l Privacy (data export, account deletion, legal pages)

`privacy/` (API + web), Profile → "Your data" / "Delete account", admin `/admin/privacy`, public `/privacy` + `/terms`. **Secrets never leave an export**, and **a new model that stores personal data about a user gets a section in it**. Completing a deletion request goes through `UserService.deleteAs` (restorable from Trash). `features/legal/content.ts` must stay true to the code. Details: [docs/FEATURES.md](docs/FEATURES.md).

### 3.7 Live class / LiveKit

`apps/api/src/live-class/` + `apps/web/src/features/live-class/`. **Read [docs/LIVE_CLASS.md](docs/LIVE_CLASS.md) before changing anything in the room** — it covers recording, moderation, waiting room, presence/pull, private chat, media devices, PiP, video effects, puzzles in class, simul, matches, move polls, activity queue, interactives, spectators and pre-class settings. The rules that cut across all of it:

- **Data packets are untrusted.** A receiver of an API-only topic (anything the API injects with `sendData`) drops a packet that has a `from`; a peer topic takes the sender from the LiveKit envelope and checks it.
- **Render cost:** read `LiveClassProvider` with field selectors (`useLiveClassState("a", "b")`), use `useRoster()` / `useGridTracks()` instead of raw `useParticipants()` / `useTracks()`, and give board-store reads a selector.
- **Service layout:** `LiveClassService` is lifecycle only; each in-room concern is a sibling service using `LiveClassAccessService` for auth. Specs register `LIVE_CLASS_SERVICES`.
- In-class moves/answers (simul, matches, polls, puzzles) go through REST with a status/ply-filtered `updateMany` claim (409 on a lost race), then a server-injected packet — never peer data.
- The LiveKit webhook (`POST /webhooks/livekit`) needs its raw body; anything turning room identities into user ids must skip `isSpectatorIdentity`.
- Pre-class settings: resolver + grant deriver live in `@nexa-chess/types` (`live-class-settings.ts`) — use them.

Puzzle Library and student progress: [docs/PUZZLES.md](docs/PUZZLES.md). Academy-scheduled coach classes and class change requests: [docs/CLASSES.md](docs/CLASSES.md).

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
- **DB integration tests**: `*.int-spec.ts` (`apps/api/jest.integration.config.ts`), run with `npm run test:integration`. They hit a real Postgres at `INTEGRATION_DATABASE_URL`, whose database name must end in `_int`, `_ci` or `_test`, because every test truncates all tables. Global setup applies migrations and sets the database timezone to `Asia/Kolkata`, so raw SQL that binds a `Date` next to a `timestamp` column fails here (§3.4). Use these for anything a mock can't prove: raw SQL, unique / partial indexes, the soft-delete extension, job locks. Helpers are in `src/test/integration/db.ts` (`resetDatabase`, `createUser`). `src/test/integration/app.ts` `createTestApp()` boots the **whole `AppModule`** through the production pipeline (`app.setup.ts` `configureApp`, shared with `main.ts`), crons stopped, and `call(user, method, path, body)` hits it over HTTP with a real signed access cookie. **Auth boundary suite** (`test/integration/access/auth-boundary.int-spec.ts`): every mounted route must refuse an anonymous caller (allow-list `ANONYMOUS_OK`), and logout / a revoked session / a deactivated account end a still-unexpired access cookie. The test app's `tokenFor` creates the `auth_sessions` row each token names. **Cross-user access suite**: `test/integration/access/cross-user-access.int-spec.ts` builds two mirror-image sides (`world.ts`: coach + batch + student + class + private puzzle + attempt + invoice + payroll record each) and asserts A can't reach B's rows, lists don't mention B, and wrong roles get 403. Every denial row has a positive control on the caller's own data. **A new endpoint that takes an id of something a user owns gets a row here.** Its sibling `admin-routes.int-spec.ts` discovers every registered route under the admin prefixes (`/admin`, `/analytics`, `/users`, …) and asserts students and coaches get 403 — and plain admins on the SUPER_ADMIN `/admin/*` routes — so a new admin route is covered automatically; a mixed module lists its admin routes there. A 400 counts only when a super admin gets the same 400 (rejected before any role check). Routes with outside effects (backups) are never called with a privileged user. Locally: `INTEGRATION_DATABASE_URL=postgresql://…/nexa_gen_int npm run test:integration`. CI runs them in the `migrations` job.
- No web unit tests currently; user-flow coverage is Playwright in `e2e/`.

---

## 6. Deployment & ops (context — don't run these yourself)

- Push to `main` → GitHub Action detects whether `apps/web/**` / `apps/api/**` / `packages/**` changed → **runs `.github/workflows/ci.yml` as a gate** (API unit tests, every migration applied to an empty Postgres + `prisma migrate diff --exit-code` against `schema.prisma`, DB integration tests on that Postgres, and the production build, which type-checks the app; only the affected app is checked — the deploy passes `skip_api`/`skip_web`, a PR diffs its own files; Jest runs only the specs importing a changed file (`scripts/ci/jest-scope.sh`, full suite when packages/schema/test setup/deps change); lint runs on PRs only; any failure means no deploy; skipped by the `pr-ci` job when the pushed commit has the same tree as the merged PR's head and that PR's latest CI run passed, since that run already tested this exact code) → SSH to VPS → `scripts/deploy-production.sh <sha> <services>` → `docker compose up -d --build` for the affected services only.
- Change detection only diffs the latest push, so a failed deploy is not retried by a later push that touches no app files. Redeploy with Actions → Deploy Production → **Run workflow** (`workflow_dispatch`, services `both`/`api`/`web`), which runs the full CI gate first.
- `scripts/deploy-production.sh` applies `prisma migrate deploy` from the newly built image *before* replacing the running API, so a failed migration aborts the deploy without downtime. `apps/api`'s `entrypoint.sh` also runs it on container start (idempotent; the safety net for manual starts).
- **Rollback restores images, never rebuilds.** Each service keeps `<image>:last-good` (live and healthy) and `<image>:previous` beside compose's `latest`. A failed `up` (including web's "dependency failed to start: container nexa_api is unhealthy") or health check restores `:last-good` within seconds, and a crash-looping container counts as failed immediately. A deploy that succeeded but misbehaves: Run workflow → `action: rollback` (or `scripts/deploy-production.sh --rollback [api|web]` on the box) → `:previous` + that commit's checkout, once per successful deploy, no CI, no build. Migrations are never reversed, so keep them additive. State (`last-good-commit`, `previous-commit`, `last-deploy-services`, `history.log`, the lock) lives in the gitignored `.deploy/` in the prod checkout.
- **Concurrency**: the workflow's `production` group runs one at a time (a newer pending run replaces an older pending one); on the box the script holds a flock on `.deploy/deploy.lock` and skips a commit that is an ancestor of the one live (`FORCE_DEPLOY=1` overrides). It runs from a temp copy of itself, since `git checkout -f` rewrites `scripts/deploy-production.sh` in place.
- `.github/workflows/security.yml` runs Semgrep on PRs (fails only on findings the PR introduces) and a weekly report-only full scan; it is not a deploy gate. `.semgrepignore` excludes tests/generated files. Dependabot (`.github/dependabot.yml`) opens weekly grouped npm PRs; core-stack majors (Next, React, Nest, Prisma) are ignored on purpose. Workflow actions are pinned to a commit SHA with the version in a trailing comment (`uses: actions/checkout@<sha> # v4.4.0`) — a new step does the same; Dependabot's monthly `github-actions` run bumps both together. `.coderabbit.yaml` holds the CodeRabbit PR-review rules.
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
12. **Keep this file small (it loads into every session; Claude Code warns past 150k chars).** A new feature's details go in `docs/<FEATURE>.md` (or the matching existing doc — `LIVE_CLASS`, `PAYMENTS`, `PUZZLES`, `CLASSES`, `MESSAGING`, `INFRASTRUCTURE`, `APPEARANCE`, `FEATURES`, `TROUBLESHOOTING`); here it gets a 2–5 line summary under its § number: paths, the rule you must not break, and the link. New debugging rows go in `docs/TROUBLESHOOTING.md`.

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

The general cases are below; **the full symptom table (80+ rows, per
feature) is [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** — grep it
for the feature or error text first.

| Symptom | Start here |
|---|---|
| 401 loops / session drops | `src/lib/api.ts` interceptor, `auth.service.ts#refresh`, cookie options in `getCookieBaseOptions` (`COOKIE_SAME_SITE`), `middleware.ts`. A 403 "Request origin is not allowed" means the caller's origin is missing from `CORS_ORIGIN` |
| "model X does not exist on PrismaService" | missing getter in `prisma.service.ts` |
| Deleted rows still showing / unique constraint on re-create | `soft-delete.extension.ts` relation filters, missing partial unique index |
| Prod missing a table | migration not committed / `db push` was used |
| Web: unstyled HTML or missing `.next/server` chunk | `npm run dev:web:clean` |
| API: missing module from `dist` | `npm run dev:api:clean` |
| API logs | JSON on stdout via `nestjs-pino` (`common/logging/logger.config.ts`): one line per request with `req.id` (also returned as `x-request-id`), method, path **without query string**, status, latency; `/health`, `/stockfish` and presence heartbeats aren't logged. `LOG_LEVEL` (default `info` in production). `docker logs nexa_api | grep '"req":{"id":"<id>"'` follows one request |
| CORS / cookie not set in prod | `CORS_ORIGIN` (comma-separated), `FRONTEND_URL` must be https for `secure` cookies; `COOKIE_DOMAIN` (auto-derives `.registrable.tld` from `FRONTEND_URL`) shares the session across `api.`/`www.` subdomains; `TRUST_PROXY_HOPS` (nginx = 1) for X-Forwarded-* |
| Type mismatch web↔api | `packages/types` is the single source; rebuild/typecheck both |
| `nexa_api` unhealthy / deploy aborted on the health gate | `curl localhost:3001/health/ready` on the box: `503` with `database: down` means the API can't reach Postgres (`DATABASE_URL`, `nexa_postgres` up?); the reason is in `docker logs nexa_api` as `Health check "database" failed: …`. `degraded` (Redis down) does not fail the healthcheck. `/health` alone answering means the process is up |
