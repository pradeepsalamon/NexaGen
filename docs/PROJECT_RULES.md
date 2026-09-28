# Nexa Chess — Project Rules & Development Manual

The working manual for anyone (human or AI) building on this codebase. It captures the
conventions that are *not* obvious from reading the code, plus the hard rules that keep
the build and production deploy healthy.

Companion documents:

- [CLAUDE.md](../CLAUDE.md) — condensed guidance for AI agents
- [.agents/AGENTS.md](../.agents/AGENTS.md) — the short list of build-breaking rules
- [README.md](../README.md) — feature list, setup, UI component standards
- [DEPLOYMENT.md](../DEPLOYMENT.md) — Oracle Cloud / Docker deploy
- [apps/api/prisma/README.md](../apps/api/prisma/README.md) — Prisma workflow
- [UNIT_TEST_PLAN.md](../UNIT_TEST_PLAN.md) — test plan
- [docs/DATABASE_RESTORE.md](DATABASE_RESTORE.md), [docs/PROD_DOCKER_COMMANDS.md](PROD_DOCKER_COMMANDS.md)

---

## 1. Repository shape

npm-workspaces monorepo, orchestrated by Turborepo.

```
apps/
  web/          Next.js 14 App Router frontend  (@nexa-chess/web)
  api/          NestJS 10 backend               (@nexa-chess/api)
packages/
  types/        shared types + Zod schemas + API_ROUTES   (@nexa-chess/types)
  config/       env parsing/validation                    (@nexa-chess/config)
  tsconfig/     shared base tsconfig
e2e/            Playwright specs
scripts/        deploy + db backup shell scripts
docker-compose.yml  (livekit-server config is inline as LIVEKIT_CONFIG here)
```

### Tech stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript (strict), Tailwind CSS 3
  with CSS-variable design tokens, shadcn/ui-style primitives, TanStack Query v5
  (server state), Zustand v5 (client/session state), axios, react-hook-form + Zod,
  LiveKit client, chessground + chess.js, framer-motion, sonner, lucide-react.
- **Backend:** NestJS 10, Prisma 6 + PostgreSQL, JWT (`@nestjs/jwt`) in HTTP-only
  cookies, `@nestjs/throttler` (rate limiting), `@nestjs/schedule` (cron jobs),
  `livekit-server-sdk`, Cloudinary + `@aws-sdk/client-s3`, Nodemailer, bcryptjs,
  class-validator + nestjs-zod.
- **Infra:** Docker Compose (web, api, postgres 15, redis 7, livekit v1.6),
  self-hosted on Oracle Cloud ARM64 Ubuntu, Nginx + Certbot TLS, GitHub Actions
  deploy-on-push-to-main.

---

## 2. Golden rules (breaking these breaks the build or prod)

1. **New Prisma model ⇒ add a getter in `apps/api/src/prisma/prisma.service.ts`.**
   `PrismaService` manually re-exports every model as a getter; a missing one is a
   compile error.
2. **Any `schema.prisma` change ⇒ generate a migration**
   (`npm run db:migrate:dev -- --name <name>`). Never ship a schema change with only
   `db push` — the table will be missing in production.
3. **New or changed endpoint ⇒ update `packages/types` first.** Add the path to
   `API_ROUTES` (`packages/types/src/api-endpoints.ts`) and the request/response
   types (`packages/types/src/index.ts`). Then wire API and web to those.
   Never hardcode a URL path in either app.
4. **New API module ⇒ follow the existing auth pattern** (§4). No `@UseGuards`.
5. **Deleting a soft-deletable entity ⇒ go through `TrashRepository.softDelete`**
   inside a Prisma `$transaction` (see `batch.service.ts#delete`).
6. **Update docs in the same change.** If you touch setup, commands, env vars, or
   user-visible behavior, update the relevant README/doc in the same PR.
7. **Data-table action buttons use the `rounded-full` icon template**
   (`.agents/AGENTS.md`), Lucide icon with `strokeWidth={2.5}`.
8. **Reuse `apps/web/src/components/ui/` primitives before building new UI.**

---

## 3. The shared contract layer (`packages/types`)

This package is the single source of truth for the web↔api boundary.

- `api-endpoints.ts` — `API_ROUTES`, a nested const object. Static routes are strings;
  parameterized routes are functions defaulting the param to `:id`
  (`batches.update()` → `/batches/:id`, `batches.update(realId)` → `/batches/abc`).
  Controllers register with the default form; clients call with real ids.
- `index.ts` — every request/response type. Many are `z.infer<typeof someSchema>` so
  the Zod schema doubles as runtime validation on both sides. Enum unions
  (`UserRole`, `BatchStatus`, `ClassStatus`, …) mirror the Prisma enums.

**Workflow for a new feature endpoint:**

1. Add route(s) to `API_ROUTES`.
2. Add `XRequest` / `XResponse` types (+ Zod schema if the API will validate with Zod).
3. API: controller method + service method returning `XResponse`.
4. Web: `features/<f>/api/<f>Api.ts` function + `hooks/use<F>Api.ts` hook.
5. Typecheck both workspaces — a contract mismatch shows up as a type error.

---

## 4. Backend (`apps/api`) conventions

### 4.1 Module layout

One feature = one folder: `x.module.ts`, `x.controller.ts`, `x.service.ts`, `dto/`,
`x.service.spec.ts` (and `x.controller.spec.ts` where it earns its keep).
Register the module in `apps/api/src/app.module.ts`.

### 4.2 Authentication & authorization pattern

**There are no NestJS guards or `@CurrentUser` decorators.** Every protected route
follows this shape:

**Controller:**
```ts
@Controller()
export class ThingController {
  constructor(private readonly thingService: ThingService) {}

  @Get(API_ROUTES.things.list)
  list(@Req() request: Request) {
    return this.thingService.list(this.getAccessToken(request));
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}
```

**Service:**
```ts
private async getAuthenticatedUser(accessToken: string | undefined) {
  if (!accessToken) throw new UnauthorizedException("Access token is missing.");
  const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
    accessToken, { secret: this.env.JWT_ACCESS_SECRET },
  );
  if (payload.type !== "access") throw new UnauthorizedException("Invalid token type.");
  const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedException("Invalid session.");
  }
  return user;
}

private assertCanManageThings(user: { role: UserRole }) {
  if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
    throw new ForbiddenException("You cannot manage things.");
  }
}

private getThingVisibilityWhere(user): Prisma.ThingWhereInput {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) return {};
  if (user.role === UserRole.COACH) return { coachId: user.id };
  return { studentId: user.id };
}
```

`batch.service.ts` is the canonical reference. Copy it.

**Coach accounts require approval.** `POST /auth/register-coach` is an
*application*, not a sign-up: it creates the user with `status: PENDING` and
`coachProfile.approvalStatus: PENDING`, issues **no session**, and returns
`{ email, status: "PENDING_APPROVAL" }`. `login()` rejects any `COACH` whose
`coachProfile.approvalStatus !== ACTIVE`, so the account is unusable until an
admin approves it on **Admin → Pending Coach Applications**
(`AdminService.updateCoachStatus`, which flips both `user.status` and
`approvalStatus`).

**Student self-registration requires approval too.** `POST /auth/register`
creates the student with `status: PENDING`, issues **no session**, and returns
the same `{ email, status: "PENDING_APPROVAL" }`. `login()` tells a pending
student their registration is awaiting approval; every other auth path already
requires `status: ACTIVE`. Admins and super admins approve or decline on
**Admin → Student Approvals** (`/admin/students`,
`AdminService.updateStudentStatus`: a status-filtered `updateMany` from
`PENDING` to `ACTIVE`/`ARCHIVED`, so a second review is a 404). Approval fires
the `ACCOUNT_APPROVED` messaging rule. Students created by an admin are `ACTIVE`
immediately.

Consequences to respect when you touch this area:

- A coach created *by an admin* (`UserService.create`/`update`) is approved on
  the spot — the admin's action is the approval — otherwise the login gate would
  lock them out.
- Anywhere a coach is selected (batch assignment, demo-class scheduling) must
  filter on `status: UserStatus.ACTIVE`, so a pending applicant can never be
  scheduled.

### 4.3 Cookies & tokens

- Names: `nexa_access_token`, `nexa_refresh_token` (`AUTH_COOKIE_NAMES`).
  Paths in `AUTH_COOKIE_PATHS`.
- Access token TTL `15m`; refresh `1d` default, `7d` with "remember me".
- Refresh tokens rotate on every `/auth/refresh`, are bcrypt-hashed, and stored in
  `auth_sessions`. Logout and password reset revoke sessions.
- `sameSite`/`secure` are derived at runtime from whether `FRONTEND_URL` is https
  (`auth.controller.ts`). In production `CORS_ORIGIN`/`FRONTEND_URL` must be the https
  origin or cookies won't be set cross-site.
- Neutral messaging + fixed response delays protect login and password-reset from
  account-enumeration and timing attacks (`LOGIN_RESPONSE_DELAY`,
  `PASSWORD_RESET_RESPONSE_DELAY`). Keep that behavior when editing those flows.

### 4.4 Validation

Two accepted styles — match the module you're editing:

- **class-validator DTO** implementing the shared request type, e.g.
  `batch/dto/batch.dto.ts`. Global `ValidationPipe({ transform: true, whitelist: true })`
  is enabled in `main.ts`.
- **Zod** via the inline `ZodPipe` in `coach.controller.ts` using a schema from
  `@nexa-chess/types`.

### 4.5 Response mapping

Services never return raw Prisma rows. Map through private `toX()` helpers:
`Date → .toISOString()`, `Decimal → .toString()`, drop soft-deleted relations,
shape exactly to the `@nexa-chess/types` response type.

### 4.6 Prisma & soft delete

- `PrismaService` wraps `PrismaClient().$extends(softDeleteExtension)` and exposes
  `prisma.withDeleted` for bypassing the filter.
- `soft-delete.extension.ts` injects `isDeleted: false` into all read operations for
  the models in `softDeleteModels` and into filterable list relations. Pass
  `includeDeleted: true` in query args to opt out.
- Soft-deletable models: `User`, `StudentProfile`, `CoachProfile`, `Batch`,
  `BatchCoach`, `BatchStudent`.
- Feature deletes call
  `this.prisma.$transaction(tx => this.trashRepository.softDelete(tx, "Batch", id, user.id))`.
- **Uniqueness checks on soft-deletable models must read through
  `prisma.withDeleted`.** Unique constraints (`users.email`, `users.username`)
  span deleted rows, but ordinary reads are filtered by the soft-delete
  extension — so a filtered pre-check misses the conflict and the insert dies
  with P2002 as an unhandled 500. A deleted user's email is permanently
  reserved; that is intentional. Partial unique indexes were considered and
  rejected: Prisma cannot express them in `schema.prisma`, so adopting them
  would mean dropping `@unique`, converting every `findUnique` to `findFirst`,
  and living with permanent `migrate dev` drift.
- Adding a soft-deletable model: the 7-step checklist in `README.md`
  § "Trash And Soft Delete" — schema fields (`isDeleted`, `deletedAt`, `deletedById`
  + `deletedBy` relation) and indexes, add to `softDeleteModels` / `trashEntities` /
  `relationToModel` / `filterableRelationNames`, add **partial unique indexes**
  (`... WHERE "isDeleted" = false`) so deleted rows don't block reuse, update shared
  types and the Trash UI.
- Automatic retention cleanup (`trash.scheduler.ts`) uses a Postgres advisory lock so
  multiple API instances don't collide. Retention days: `TRASH_RETENTION_DAYS` (30).

### 4.7 Scheduled jobs

`@nestjs/schedule` `@Cron(...)` methods live in the owning service
(`trash.scheduler.ts`, cleanup in `live-class.service.ts`, backups in
`backup.service.ts`). `ScheduleModule.forRoot()` is in `app.module.ts`.

### 4.8 Rate limiting

Global `ThrottlerGuard` (100 req / 60 s). Auth endpoints tighten it with
`@Throttle({ default: { limit: 5, ttl: 60000 } })`.

### 4.9 Logging

`main.ts` sets Nest logger to `["error", "warn"]` only, plus a custom one-line HTTP
access log (`[HTTP] METHOD url status durationms - ip`), excluding `/stockfish` and
`/health`. Keep API logs quiet — no `console.log` debugging left in committed code.

---

## 5. Frontend (`apps/web`) conventions

### 5.1 Directory model

- `src/app/**` — routes. `page.tsx` is a thin **server component**: check for the auth
  cookie, `redirect("/login?reason=unauthorized")` if absent, then render a
  `"use client"` `<FeatureClient />`. Route groups: `(auth)` for login/register/etc.
- `src/features/<feature>/` — `api/`, `hooks/`, `components/`, sometimes
  `validation/`, `types/`, `store/`, `context/`.
- `src/components/ui/` — design-system primitives. `src/components/layout/`,
  `src/components/forms/`, `src/components/common/` — shared composites.
- `src/lib/` — `api.ts` (axios wrapper), `queryKeys.ts`, `errors.ts`, `forms.ts`,
  `utils.ts` (`cn()`), `uploadApi.ts`.
- `src/stores/` — Zustand (`authStore`, `uiStore`). `src/providers/` — React context
  providers. `src/middleware.ts` — route gating.

### 5.2 Data fetching

- All HTTP goes through `apiFetch<T>(path, { method, body, ...axiosConfig })` in
  `src/lib/api.ts`. It sets `withCredentials`, handles `401 → POST /auth/refresh →
  retry` with a queued-request lock, emits a global toast on network failure, and
  normalizes error messages (including `429` retry-after).
- `api/*Api.ts` = one function per endpoint, typed with `@nexa-chess/types`.
- `hooks/use*Api.ts` = `useQuery`/`useMutation`. **Query keys always come from the
  `queryKeys` factory in `src/lib/queryKeys.ts`** — add a key there, don't inline
  arrays. Mutations call `queryClient.invalidateQueries` on success.
- `QueryClient` defaults (`AppProviders.tsx`): `staleTime: 60s`, `retry: 1`,
  `refetchOnWindowFocus: false`.

### 5.3 Session state

- `useAuthStore` (Zustand + `persist`, key `nexa-auth`, only `user` persisted).
- `SessionBootstrap` hits `/auth/me` on mount to hydrate/verify.
- `getRoleDashboardHref(role)` maps role → `/admin` | `/coach` | `/student`.
- `middleware.ts` only checks cookie presence (and base64-peeks the JWT for a
  redirect target); it does **not** verify signatures. Real authz is server-side.

### 5.4 Forms

react-hook-form + `zodResolver`, schema from `@nexa-chess/types` or
`features/*/validation/`. Use `components/forms/` (`Form`, `FormInput`,
`FormSelect`, `FormCheckbox`) and `components/ui/FormField`. `useTouchedFields`
helper for dirty-state UX.

### 5.5 UI / styling rules

- **shadcn/ui-first.** Check `components/ui/` and existing feature components before
  creating anything. Compose primitives; don't wrap them needlessly.
- Use design tokens, never raw hex. Tailwind token classes: `bg-app-background`,
  `bg-app-surface`, `bg-app-soft`, `text-app-text`, `text-app-muted`,
  `border-app-border`, `bg-primary`/`text-primary`, `bg-secondary`, `text-accent`,
  `bg-app-danger`, radii `rounded-app` / `rounded-control` / `rounded-panel`,
  shadows `shadow-card` / `shadow-soft`. Tokens live in `src/styles/globals.css`
  (`:root` + `:root[data-theme="dark"]`), mapped in `tailwind.config.ts`.
- Dark mode is the `[data-theme="dark"]` selector (managed by `ThemeProvider` /
  `ThemeToggle` / `ThemeSettings`). Always provide both light and dark treatment.
- Icon-only buttons: `aria-label` **and** a visible Tooltip/Popover label.
- Table row actions: `Button variant="outline" size="icon"` +
  `className="size-8 rounded-full border-[color] p-0 text-app-text transition-colors
  hover:bg-[color] hover:text-white"`, icon `strokeWidth={2.5}`.
- Button variants: `primary` | `destructive` | `ghost` | `outline` | `secondary`.
- Toasts via `sonner`. Confirmations via `AlertDialog` / `ConfirmationModal`.
- `"use client"` only where required (hooks, events, browser APIs). Keep pages RSC.

### 5.6 Live class & chessboard

- `features/live-class/` — LiveKit meeting UI (`MeetingRoom`, `MeetingLayout`,
  video grid, chat, participants, prejoin). Providers: `LiveClassProvider`,
  `ChatProvider`. Hooks: `useLiveClass`, `useLiveClassApi`, `useLiveBoardSyncBridge`,
  `useMeetingTimer`, `useKeyboardShortcuts`.
- `features/chessboard/` — standalone board (chessground render + chess.js rules),
  Zustand `boardStore` / `createBoardStore` (game + shared chess clock +
  per-client detach), `BoardProvider`, Stockfish panel via `/stockfish` API,
  PDF & masterbase panels, drawing toolbar, `ChessClock`.
- The board is synced into a live class through `LiveBoardSyncBridge` (the single
  sync engine — provides `BoardSyncContext`; consume with `useBoardSync()`) +
  `useLiveBoardSyncBridge`. Protocol types + the `senderMayMutateBoard` rule live
  in `features/chessboard/types/sync.ts` / `lib/boardSyncRules.ts`. Board control
  is keyed by the **full LiveKit participant identity** (`${userId}_${clientId}`).
  The coach board is the in-meeting `LiveChessboardPanel`; `/live-class/:id/board`
  is an optional dedicated window that takes over as authoritative when open.
- Meeting routes (`/live-class`, `/demo`, `/test-board`) render without the global
  `<Header>` (see `AppProviders`).

---

## 6. Environment variables

- **API runtime:** `apps/api/.env`, parsed/validated by `getApiEnv()` in
  `packages/config/src/api.ts` (Zod, cached). Keys: `DATABASE_URL`, `PORT` (3001),
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`,
  `JWT_REFRESH_SHORT_TTL`, `LOGIN_RESPONSE_DELAY`, `PASSWORD_RESET_RESPONSE_DELAY`,
  `CORS_ORIGIN` (comma-separated), `FRONTEND_URL`, `TRASH_RETENTION_DAYS`,
  `SMTP_*`, `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`,
  `CLOUDINARY_*`, `STOCKFISH_PATH`, `STOCKFISH_POOL_SIZE` (max engines), `STOCKFISH_MIN_ENGINES` (kept running at rest, default 1), `STOCKFISH_IDLE_TIMEOUT_S` (extra engines stop after this idle time, default 60), `STOCKFISH_MOVETIME`, `STOCKFISH_MOVE_MOVETIME`, `STOCKFISH_HASH_MB`
  (per-position engine search time in ms, default 800).
- **Web:** `getWebEnv()` in `packages/config/src/web.ts` validates
  `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_LIVEKIT_URL` (with localhost defaults).
  `NEXT_PUBLIC_CONTACT_EMAIL` is read directly from `process.env`. **`NEXT_PUBLIC_*`
  is build-time** — set before `docker compose build`.
- **Root `.env`** feeds `docker-compose.yml` (Postgres creds, build args, all API
  runtime vars). See `.env.example`.
- Add a new env var to: the Zod schema in `packages/config`, `.env.example`
  (and `apps/api/.env.example`), and the README's Environment section.

---

## 7. Testing rules

- **API unit tests are mandatory for business-logic changes.** Jest + ts-jest,
  `*.spec.ts` co-located under `apps/api/src/`. `npm run test -w apps/api`.
  `jest.config.ts`: `rootDir: src`, alias `@/ → src/`, coverage excludes `main.ts`,
  `*.module.ts`, `*.dto.ts`.
- Follow `UNIT_TEST_PLAN.md` for scope and priorities.
- E2E: Playwright in `e2e/` using `.env.e2e`. `npx playwright test`. Not in `npm test`.
  `live-board-sync.spec.ts` is opt-in (`RUN_LIVE_BOARD_E2E=1`): it needs a real
  LiveKit (`docker compose up -d livekit postgres redis`) and the web server run
  with `NEXT_PUBLIC_E2E=1` (mounts the `window.__nexaBoard` test harness).
- No web component unit tests today — don't retrofit a framework without agreement;
  add Playwright coverage for critical flows instead.

---

## 8. Verification checklist before opening a PR

```bash
npm run typecheck                 # or -w apps/api / -w apps/web for what you touched
npm run lint
npm run test -w apps/api          # if API logic changed
npm run build -w apps/web         # if web changed (catches server/client boundary errors)
npm run prisma:validate -w apps/api   # if schema changed
```

Pre-commit hook auto-runs `typecheck` + `lint`. Also confirm:

- [ ] `API_ROUTES` + `packages/types` updated for any endpoint change
- [ ] New Prisma model has a `PrismaService` getter
- [ ] Migration file committed for any schema change
- [ ] Relevant README/doc updated in the same commit
- [ ] New UI reuses `components/ui/`; table actions use the icon-button template
- [ ] No leftover `console.log` / `any` / dead code

---

## 9. Git & deployment

- Branch off `main`; PR into `main`. `dev` branch also exists.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`) as seen in
  history.
- **Push to `main` auto-deploys.** The GitHub Action (`deploy-production.yml`)
  path-filters `apps/web/**` / `apps/api/**` / `packages/**` / compose / lockfiles,
  SSHes to the VPS, and runs `scripts/deploy-production.sh <sha> <services>`, which
  does `docker compose up -d --build` for only the changed services.
- **Migrations are applied before the API is swapped.** When `api` is among the
  deployed services, `deploy-production.sh` runs `prisma migrate deploy` in a
  throwaway container built from the new image *before* `docker compose up -d`.
  A migration that cannot apply aborts the deploy with the previous API still
  serving, instead of being discovered by the health-check timeout after the
  swap. `entrypoint.sh` still runs `migrate deploy` on container start — it is
  idempotent, and remains the safety net for manually started containers.
- Either way, an un-committed migration = broken prod.
- Ops references: `docs/PROD_DOCKER_COMMANDS.md`, `docs/DATABASE_RESTORE.md`.
  Backups: `scripts/backup_db.sh` (cron → OCI object storage).

---

## 10. Debugging quick reference

| Symptom | Likely cause / where to look |
|---|---|
| Infinite 401 / logged out unexpectedly | `src/lib/api.ts` refresh interceptor; `auth.service.ts#refresh` (rotation); cookie `sameSite`/`secure` vs `FRONTEND_URL` scheme |
| `Property 'x' does not exist on type 'PrismaService'` | add the model getter in `prisma.service.ts` |
| Row still returned after "delete" | `soft-delete.extension.ts` — relation not in `filterableRelationNames`, or an `include` that bypasses the filter |
| Unique constraint error re-creating a "deleted" record | missing partial unique index `WHERE "isDeleted" = false` |
| Table missing in production | migration not committed, or `db push` was used instead of `migrate dev` |
| Web serves unstyled HTML / missing `.next/server` chunk | `npm run dev:web:clean` |
| API `Cannot find module '.../dist/...'` | `npm run dev:api:clean` |
| LiveKit webhook 400 / attendance not recording | raw-text body parser for `application/webhook+json` in `main.ts`; `attendance` module event handling |
| LiveKit webhook 401 `Invalid webhook signature` | `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` mismatch between the API and LiveKit, or a client signing the `sha256` claim as hex instead of base64. There is no bypass header — the endpoint verifies every payload. |
| Attendance status wrong (present/late/partial) | active `AttendancePolicy` row thresholds; `attendance-calculations.spec.ts` |
| CORS error / cookie not set in prod | `CORS_ORIGIN` (comma-separated list), `FRONTEND_URL` must be https |
| Web↔API type drift | rebuild/typecheck `packages/types` consumers; the package is the source of truth |
| Rate-limited (429) during testing | global throttler 100/60s; auth routes 5/60s |
