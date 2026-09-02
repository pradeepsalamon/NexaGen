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

`playwright.config.ts` + `e2e/` (currently `attendance-flow.spec.ts`). Uses `.env.e2e`. Not part of `npm test`; run with `npx playwright test`.

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
- **Confirmations: never use `window.confirm`. Use `useToast().undoable({ title, message?, onCommit })`** (`providers/ToastProvider.tsx`) — it fires the destructive action after a short delay and shows an "Undo" toast that cancels it. For actions with a real reverse endpoint, prefer the execute-immediately + `action: { label: "Undo", onClick }` pattern instead (see `DemoClassesClient.tsx`).
- Button variants (CVA): `primary`, `destructive`, `ghost`, `outline`, `secondary`.
- Toasts: `sonner`, wrapped by `useToast()` (`providers/ToastProvider.tsx`) — `success`/`error`/`warning`/`info`/`loading`/`promise`/`undoable`.

### 3.7 Live class / LiveKit

- `apps/api/src/live-class/` + `apps/web/src/features/live-class/`. LiveKit webhook at `POST /webhooks/livekit` — `main.ts` parses `application/webhook+json` as raw text for signature verification; don't break that.
- Attendance is driven off LiveKit join/leave/disconnect events → `attendance` module → `class_attendance` / `attendance_logs` / `coach_attendance` tables, scored against the active `AttendancePolicy`.
- Board sync: `apps/web/src/features/chessboard/` (chessground + chess.js, Zustand `boardStore`) bridged into the meeting via `LiveBoardSyncBridge` (single sync engine + `BoardSyncContext`; consume with `useBoardSync()`) / `useLiveBoardSyncBridge`. Board control is keyed by full LiveKit participant identity and is **multi-student**: `boardControlStudentIds: string[]` in `LiveClassProvider` (grant/revoke/toggle helpers) → `permissionMode` `SELECTED_STUDENT` + `selectedStudentIds: string[]` in `createBoardStore`, broadcast via `UPDATE_PERMISSIONS`. The shared chess clock and per-client detach also live in `createBoardStore`. Sync-permission rule: `features/chessboard/lib/boardSyncRules.ts`.
- **Pre-class settings** (`live-class-settings.service.ts` / `live-class-preset.service.ts`, routes `API_ROUTES.liveClassSettings` / `.liveClassPresets`): four inheriting layers — system `LiveClassPolicy` singleton → `Batch.liveClassSettings` → `CoachClass.liveClassSettings` → `LiveClassPreset` (copied into the class, never referenced). The **shared resolver + LiveKit grant deriver live in `@nexa-chess/types` (`live-class-settings.ts`)** — `resolveLiveClassSettings`, `deriveLiveKitGrants`, `resolveJoinState`; use them, don't reimplement. Effective config is frozen onto `LiveSession.effectiveSettings` at `startClass` (§snapshot); a null snapshot means "started before this feature" → pre-feature token grants. Settings-change audit rows go to `TrashAuditLog` with `action: "LIVE_SETTINGS_CHANGE"`.

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

---

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
| Recording won't play / download | `nexa_egress` container up + `./recordings` volume mounted on `api` and `egress`; local files stream via `/live-class/:id/recording/stream` (signed `st` token, 15m), otherwise fall back to OCI (`OCI_*` env still required); `RECORDING_MIN_RETENTION_DAYS` guards auto-prune |
| CORS / cookie not set in prod | `CORS_ORIGIN` (comma-separated), `FRONTEND_URL` must be https for `secure` cookies; `COOKIE_DOMAIN` (auto-derives `.registrable.tld` from `FRONTEND_URL`) shares the session across `api.`/`www.` subdomains; `TRUST_PROXY_HOPS` (nginx = 1) for X-Forwarded-* |
| Type mismatch web↔api | `packages/types` is the single source; rebuild/typecheck both |
| Admin analytics numbers look stale | in-process 5-min cache in `analytics-cache.ts`; hit Refresh (adds `?fresh=1`) or set `ANALYTICS_CACHE_TTL_SECONDS=0`. Storage growth/forecast empty until ~14 `storage_snapshots` rows exist (daily `AnalyticsScheduler` cron, advisory lock `73002050`) |
| Analytics endpoint 403 for an admin | `assertCanViewAnalytics` allows only `ADMIN`/`SUPER_ADMIN`; coaches/students get 403 by design |
| `DAU/WAU/MAU` shows "Data unavailable" | no `analytics_events` rows yet — they accrue from deploy (login / class-join / assignment-attempt / recording-watch) |
| Analytics timezone off by a day | all bucketing goes through `zonedDayBounds`/`zonedMonthBounds` + `date_trunc(... AT TIME ZONE tz)` using the requesting admin's `User.timezone`; check that column |
