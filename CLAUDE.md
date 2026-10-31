# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository. Read this before making changes. Human-oriented conventions: [docs/PROJECT_RULES.md](docs/PROJECT_RULES.md); the short rule list other agents auto-load: [AGENTS.md](AGENTS.md); every doc is indexed in [docs/README.md](docs/README.md).

---

## 1. What this project is

**Nexa Chess** (package `nexa-chess`, product "NexaGen"): a chess-academy platform — batches/classes, live video classes with a synced board, attendance, role dashboards for Super Admin / Admin / Coach / Student. npm-workspaces monorepo on **Turborepo**.

| Workspace | Package | Stack |
|---|---|---|
| `apps/web` | `@nexa-chess/web` | Next.js 15 (App Router), React 19, Tailwind, shadcn-style UI, TanStack Query, Zustand, axios, react-hook-form + Zod |
| `apps/api` | `@nexa-chess/api` | NestJS 11 (Express 5), Prisma 6 / PostgreSQL, JWT in HTTP-only cookies, throttler, schedule, LiveKit, Cloudinary, Nodemailer |
| `packages/types` | `@nexa-chess/types` | Shared request/response types, Zod schemas, `API_ROUTES` |
| `packages/config` | `@nexa-chess/config` | Env parsing (`getApiEnv`, `getWebEnv`) |
| `packages/tsconfig` | `@nexa-chess/tsconfig` | Shared base tsconfig |

Infra: `docker-compose.yml` (web, api, postgres, redis, livekit) on an Oracle Cloud ARM64 Ubuntu box. CI on PRs into `main`/`dev`; push to `main` deploys (§6).

---

## 2. Environment & commands

- **Windows**, PowerShell primary (Bash also available); forward slashes in paths.
- **npm only** (`npm@11.15.0`), never pnpm/yarn. Root `package.json` `overrides` pins vulnerable transitives — a new override only applies after removing that package's `package-lock.json` entry and re-running `npm install`.
- API env: `apps/api/.env` (not committed); root `.env` is for compose. Examples: `.env.example`, `apps/api/.env.example`.

```bash
npm run dev | dev:web | dev:api           # dev:web:remote = web against staging API (no DB)
npm run dev:web:clean | dev:api:clean     # clear .next / dist
npm run typecheck | build | lint
npm run test                              # API Jest only (runInBand)
npm run test:integration                  # API *.int-spec.ts vs real Postgres (§5)
npm run db:generate | db:migrate:dev -- --name <n> | db:migrate:create | db:migrate:deploy | db:migrate:status
npm run db:seed                           # idempotent; refuses production
npm run db:reset                          # DESTRUCTIVE
```

Seeded accounts (password `Test@12345`): `superadmin@nexa.test`, `coach@nexa.test`, `student@nexa.test`. Web `http://localhost:3000`, api `http://localhost:3001`.

**E2E**: Playwright, `e2e/*.spec.ts` (helpers in `e2e/fixtures.ts`), reads gitignored `.env.e2e` (copy `.env.e2e.example`; never real `vps_dev`/prod secrets). Run `npx playwright test`; not in `npm test`. Several specs are opt-in via `RUN_*_E2E=1` — see their header comment.

**Verify before claiming done** (scoped to what you touched): `npm run typecheck -w apps/<x>`, `npm run lint -w apps/<x>`, `npm run test -w apps/api` (API logic), `npm run build -w apps/web` (web; catches RSC boundary errors). UI/layout changes: `npm run shots -- --path <route> --devices all` (needs web + api; options in [scripts/responsive/README.md](scripts/responsive/README.md), spec in [docs/RESPONSIVE.md](docs/RESPONSIVE.md)) and confirm no horizontal overflow. The pre-commit hook runs typecheck + lint.

---

## 3. Architecture & the patterns you MUST follow

### 3.0 Before implementing a new feature

Read [docs/BACKLOG.md](docs/BACKLOG.md) § "Root causes". (1) **The backend half may already exist** — grep `API_ROUTES` (`packages/types/src/api-endpoints.ts`) and the route name across `apps/web`; often only `features/<x>/api/*Api.ts` + hook + component is missing. (2) Consumer-less code from an `NEXA-####` / `agent/task_*` commit is likely half-reverted output of the retired autonomous managers (removed 2026-09-08) — confirm it's wanted; deleting it is often the fix. If the feature is in BACKLOG.md, update that entry in the same change.

### 3.1 Shared contract: `packages/types`

Every request/response shape lives in `packages/types/src/index.ts` (often `z.infer`); every path in `API_ROUTES` (`api-endpoints.ts`). Path-param routes are functions: controllers call the no-arg form (`/batches/:id`), clients pass the id. **Never hardcode an API path.** New/changed endpoint: `API_ROUTES` + types first, then both sides.

### 3.2 API auth pattern (there are NO NestJS guards)

1. **Controller** takes `@Req() request: Request`, has `private getAccessToken(request) { return request.cookies?.[AUTH_COOKIE_NAMES.accessToken]; }`, and passes the raw token as the service method's first argument.
2. **Service** `private getAuthenticatedUser(accessToken)` calls **`authenticateUser(this.jwtService, this.prisma, accessToken)`** (`auth/authenticate.ts`; 4th arg `{ include }` for relations; `verifyAccessToken` is the no-DB variant). It turns every bad/expired/revoked/non-ACTIVE case into a 401. **Never hand-roll `jwtService.verifyAsync` for an access token.**
3. **Role checks**: private `assertCanX(user)` / inline `ForbiddenException`. **Row visibility**: private `getXVisibilityWhere(user)` → `Prisma.WhereInput` (admins `{}`). Reference: `batch.service.ts`.

Also required: params/queries via `parseOrBadRequest` (`common/zod-body.pipe.ts`) and `queryEnum`/`queryString` (`common/query-params.ts`), never bare `schema.parse` (a ZodError is a 500). Multipart routes: `@UseInterceptors(RequireAccessTokenInterceptor, FileInterceptor("file", { limits: { fileSize, files: 1, fields } }))`. `common/security/route-auth.spec.ts` fails a handler that never uses its `request`; public routes go on `PUBLIC_ROUTES`. Don't introduce guards unless refactoring every module with maintainer agreement.

Mechanics — MFA (`auth/mfa/`, `MFA_ENCRYPTION_KEY`, `MFA_REQUIRED_ROLES`), login/MFA lockouts and their SQL resets, email change, refresh-token rotation, cookies (`getCookieBaseOptions`, `COOKIE_SAME_SITE`), CSRF origin check (**a new webhook route goes on its exempt list**), security headers and the web CSP (**a new third-party host goes in `next.config.mjs` `securityHeaders()`**): [docs/AUTHORIZATION.md](docs/AUTHORIZATION.md) § "Authentication mechanics". Per-resource policy is in the same file.

### 3.3 Validation

Web forms: react-hook-form + `zodResolver`, schemas from `@nexa-chess/types` or `features/*/validation/`. API: class-validator DTOs implementing the shared type (`batch/dto/batch.dto.ts`, global `ValidationPipe({ transform: true, whitelist: true })`) **or** inline `ZodPipe` (`coach/coach.controller.ts`) — match the module.

### 3.4 Prisma, soft delete, timestamps

- **New model → add its getter in `PrismaService`** (`apps/api/src/prisma/prisma.service.ts`) or the build breaks.
- **Every schema change gets a migration** (`db:migrate:dev`), never `db push`. Never hand-write a migration folder timestamp; hand-bumped names (`20261016…`–`20261020…`) ran ahead of the real date, so until then name new ones after the latest folder. Never rename an applied migration.
- Soft delete: `prisma/soft-delete.extension.ts` + `trash` module; models `User`, `StudentProfile`, `CoachProfile`, `Batch`, `BatchCoach`, `BatchStudent`. Deletes go through `TrashRepository.softDelete(tx, "<Model>", id, userId)` in a `$transaction` (see `batch.service.ts#delete`). New trash model: 7-step checklist in `README.md` § "Trash And Soft Delete". Read deleted rows with `includeDeleted: true` or `prisma.withDeleted`.
- **Uniqueness pre-checks use `prisma.withDeleted`** (email/username are unique across deleted rows; otherwise P2002 → 500).
- **Financial relations to `User` are `onDelete: Restrict`**, never Cascade (trash purge hard-deletes users); new financial models go in `TrashRepository.findUserIdsWithRetainedHistory`.
- **Timestamps: UTC, `timestamp WITHOUT time zone`.** In raw SQL never bind a JS `Date` or `::timestamptz` next to these columns — bind `${d.toISOString()}::timestamp`; bucket with `(col AT TIME ZONE 'UTC') AT TIME ZONE tz`. Serialize with `.toISOString()`, never pre-format. Full rule: `AGENTS.md` "Date & Time Rule".

### 3.5 Web data-fetching & routing

Per feature in `apps/web/src/features/<feature>/`: `api/<x>Api.ts` (thin `apiFetch<T>(API_ROUTES…)` calls; `src/lib/api.ts` handles credentials, 401 → refresh → retry, error toasts), `hooks/use<X>Api.ts` (`useQuery`/`useMutation`, keys from `src/lib/queryKeys.ts`, invalidate on success), `components/`. Pages under `src/app/**` are thin server components rendering a `"use client"` `<XClient />`.

**Pages never check the auth cookie.** Route RBAC is one table, `src/lib/routeAccess.ts` `ROUTE_RULES`, applied by `middleware.ts` (unverified token peek — routing only; the API enforces roles) and by `SessionBootstrap` for refresh-only sessions. **New protected route = `ROUTE_RULES` entry + `middleware.ts` `matcher` entry + name in `lib/pageTitles.ts` `PAGE_TITLES`.** Session state: `useAuthStore` (Zustand, `localStorage` `nexa-auth`, only `user`).

### 3.6 UI conventions

**Read [docs/UI_RULES.md](docs/UI_RULES.md) before any UI work** (tokens, which component per control, pre-PR checklist). Highlights:

- Navy/gold redesign: `nx-*` colours + `nx-cta`, theme-switched by CSS variables; never pick colours from `useTheme()`. Otherwise theme tokens (`bg-app-surface`, `text-app-text`, `border-app-border`, `rounded-panel`, `shadow-card`, …; `src/styles/globals.css`, dark = `[data-theme="dark"]`), `-ink` for coloured text, no `dark:` colour overrides. Marketing site (`features/academy`) exempt.
- Reuse `components/ui/` primitives before creating. Buttons: `primary`/`destructive`/`ghost`/`outline`/`secondary`.
- **Table row actions: `RowActions`** (`components/ui/RowActions.tsx`) — `rounded-full`, `size="icon"`, `aria-label`, `strokeWidth={2.5}` (example in `AGENTS.md`).
- Icon-only buttons: `aria-label` + **`SimpleTooltip`** (`components/ui/Tooltip.tsx`), not `title=` (except non-interactive nodes / existing Radix `asChild` triggers).
- **Never `window.confirm`.** Undo via `useUndoableMutation` (`lib/undo/`; `immediate` vs `defer`; exclusions in `lib/undo/README.md`). Toasts: `useToast()`.
- **Dates: never `toLocale*()` in a component** — `lib/datetime.ts` formatters + `useUserTimeZone()`; analytics uses `features/analytics/lib/format.ts` with that zone; date-only values format in `"UTC"`.

### 3.6b–3.6d2 Jobs, rate limiting, WhatsApp, Sentry

- **BullMQ** (`apps/api/src/queue/`) is optional: without `REDIS_URL` every queue is a no-op, so persist your own status row first and treat the enqueue as a nudge; `jobId` from your row, no `:`. **Cron single-runner: `JobLockService.runExclusive(JOB_LOCKS.x, run)`** — never session `pg_try_advisory_lock` via Prisma. Ever-growing log tables go in `RETENTION_RULES`; policy-window user content is a `RetentionCategory` (`/admin/data-retention`).
- **Throttling**: global `UserThrottlerGuard` (100/min; auth 5/min, reset 3/min); storage must never throw.
- **WhatsApp** (`whatsapp/`): features never call it directly — go through `MessagingDispatchService` (§3.6e).
- **Sentry**: optional, errors only. `instrument.ts` stays first in `main.ts` and never calls `getApiEnv()`. **Students are minors**: only `user.id` + `role`, no query strings, never loosen `dataCollection`.
- Details: [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md), [docs/MESSAGING.md](docs/MESSAGING.md).

### 3.6e Admin messaging rules

`messaging/`, page `/admin/messaging`; catalogue/defaults/renderer in `@nexa-chess/types` `messaging.ts`. **`MessagingDispatchService.dispatchInBackground(request)` is the only entry point**; a new trigger extends `DispatchRequest` + `resolveRecipients`; a new event = `MessagingEvent` + `NotificationType`. [docs/MESSAGING.md](docs/MESSAGING.md).

### 3.6f–3.6g Payments, invoices, credit notes

`payments/` + `features/payments/`, `features/invoices/`. **Read [docs/PAYMENTS.md](docs/PAYMENTS.md) first.** Business logic talks to `PaymentService` only (no adapter imported outside `payments/providers/`); money is integer minor units (`toMinorUnits`); `applyProviderState` is the single state funnel; access is an `Entitlement` granted in the capture transaction; `orders.idempotencyKey` guards double payment; webhooks keep raw bytes; discounts only via `computeDiscount`; financial models are never soft-deletable. Invoices are frozen snapshots, tax only via `@nexa-chess/types` `invoices.ts`, PDF generation runs after commit and a failure is `pdfStatus: FAILED`, refunds get credit notes.

### 3.6h / 3.6j Board appearance & typography

Same 3-layer resolver (system → admin → user) in `@nexa-chess/types` (`chess-appearance.ts`, `typography.ts`); saves merge. **Every chessboard reads `useChessAppearance()`**; appearance never rides live-class data topics. Fonts via `next/font/local`, **never `next/font/google`**; adding one = `fontIdSchema` + `FONT_CATALOG` + `apps/web/scripts/vendor-google-fonts.mjs`. Prefer rem over `text-[13px]`. [docs/APPEARANCE.md](docs/APPEARANCE.md).

### 3.6i–3.6l Feature rules (details in the linked doc)

- **Coach feedback** (`feedback/`): pending feedback is computed, never stored (`computePendingFeedback`); unique `(formId, studentId, coachId, contextKey)`. [FEATURES](docs/FEATURES.md)
- **Puzzle sets** (`PUZZLE_SET`): `AssignmentPuzzle` rows reference library puzzles; `PuzzleAttemptService` is the only attempt engine; points never stored (`computePuzzleSetResults`). [PUZZLES](docs/PUZZLES.md)
- **Class timing**: `@nexa-chess/types` `class-availability.ts` decides upcoming/past/not-held/start window — never re-derive from `status`. **Batch type** via `resolveBatchType`. [CLASSES](docs/CLASSES.md)
- **Move tree** (`packages/types/src/move-tree.ts`): a different move adds a variation, never truncates. Game Library `game-library/`, `GameRecorderService` idempotent on `sourceKey`. [FEATURES](docs/FEATURES.md)
- **Setup Position**: `SetupPositionWorkspace` replaces the main board (never a dialog). Setup never checks legality — `readSetupFen` rejects only unreadable notation; issues make a set-up-only board (`positionIssues`). Never route a setup FEN through `new Chess(fen)` (use `moveTreeForFen` / `inspectFen`). Allow Illegal Moves (`makeFreeMove`) receivers accept only a re-derived free move (`isOneAllowedMoveAway` / `freeMoveBetween`), never the packet's FEN. [FEATURES](docs/FEATURES.md)
- **Persistent chat** (`chat/`, `/messages`): `directChatAllowed` is the single rule (never student ↔ student); sends idempotent on `(senderId, clientId)`; web polls.
- **Due reminders**: `resolveAssignmentDueStatus` is the one rule. **Smart Revision**: scheduler in `packages/types/src/revision.ts`, reviews are `PuzzleAttempt`s with `context: REVISION`. [SMART_REVISION](docs/SMART_REVISION.md)
- **Game analysis** (`game-analysis/`, `game-sources/`, `stockfish/`): evaluations are White-relative (`normalizeUciScore` only); versions stored with results; only finished games. [GAME_ANALYSIS](docs/GAME_ANALYSIS.md), [GAME_SOURCES](docs/GAME_SOURCES.md)
- **PDF diagram import**: the PDF never leaves the browser; pdf.js from `public/vendor/pdfjs/` via `webpackIgnore` import; side to move/castling never assumed.
- **SEO/GEO**: academy facts live once in `features/academy/content.ts`; never put a claim in JSON-LD or `llms.txt` the page doesn't show.
- **Demo classes** (`demo-class/`, `app/demo/[classId]`, super-admin only): guests are `DemoClassRegistration`s, added only via `DemoInviteService`. [CLASSES](docs/CLASSES.md)
- **Knowledge base** (`knowledge/`, `/help`, `/admin/knowledge`): nothing pre-loaded; `canReadKnowledgeArticle` / `readerWhere` is the one visibility rule (hidden = 404); published versions immutable. [KNOWLEDGE_BASE](docs/KNOWLEDGE_BASE.md)
- **Privacy** (`privacy/`): secrets never leave an export; **a new model storing personal data gets an export section**; deletions via `UserService.deleteAs`; `features/legal/content.ts` must stay true to the code.

### 3.6m SaaS plans

`platform/` + `features/subscription/`, catalogue `@nexa-chess/types` `platform-plans.ts`. The API enforces every feature/limit: global `FeatureGateGuard` + `@RequireFeature("key")`, and `EntitlementService.assert*` inside the creating transaction; refusals are **402**. A new catalogued feature must be required by a route (a spec checks) and added to the Enterprise row by migration. Plan changes are `platform_staff` only. [docs/SAAS_PLANS.md](docs/SAAS_PLANS.md)

### 3.6n AI runtime (mock only)

NestJS `apps/api/src/ai/` is the only caller of stateless Python `services/ai-runtime/`; contract in `@nexa-chess/types` `ai-runtime-contract.ts`, exported by `node scripts/ai/export-contract.mjs` (commit output; `--check` in CI). The runtime never sees a user or DB: NestJS authorizes, then signs a 30 s HS256 token (`AI_RUNTIME_SHARED_SECRET`, never a JWT secret). Runtime 4xx → 502. Off unless `AI_ENABLED=true` via `compose.ai.yml` only. RAG PoC (`app/rag/`, `eval/rag_poc/`) never runs on the production box. [docs/ai/architecture/ROADMAP.md](docs/ai/architecture/ROADMAP.md), [RAG_POC](docs/ai/architecture/RAG_POC.md)

### 3.7 Live class / LiveKit

`live-class/` (API + web). **Read [docs/LIVE_CLASS.md](docs/LIVE_CLASS.md) before changing anything in the room.** Cross-cutting rules:

- In-room code gets the class id from `useRoomClassId()` / `useMemberClassId()` (`providers/LiveRoomContext.tsx`), never `useParams().roomId` (demo guests are at `/demo/[classId]`).
- **Data packets are untrusted**: receivers of API-only topics drop packets with a `from`; peer topics take the sender from the LiveKit envelope.
- Render cost: `useLiveClassState("a", "b")` selectors, `useRoster()` / `useGridTracks()` instead of raw `useParticipants()` / `useTracks()`, board-store selectors.
- `LiveClassService` is lifecycle only; each concern is a sibling service using `LiveClassAccessService`; specs register `LIVE_CLASS_SERVICES`.
- In-class moves/answers go through REST with a status/ply-filtered `updateMany` claim (409 on lost race), then a server-injected packet — never peer data.
- LiveKit webhook needs its raw body; identity → user id mapping skips `isSpectatorIdentity`. Pre-class settings resolver: `@nexa-chess/types` `live-class-settings.ts`.
- **Never put follow-up work in a per-call `mutate(…, { onSuccess })`** in the room (the caller may unmount) — await `mutateAsync`.

---

## 4. Code style

- TypeScript strict; no new `any`; prefix unused vars with `_`. Prefer `import type`. Keep object keys/imports alphabetized where the file does.
- API: one feature = one folder (`<x>.module.ts`, `.controller.ts`, `.service.ts`, `dto/`, `.service.spec.ts`). Services return shared types via private `toX()` mappers (dates `.toISOString()`, `Decimal` `.toString()`, drop soft-deleted relations).
- **`Chess` comes from `@/lib/chess` (web) / `common/chess/chess` (API), never `chess.js`** (ESLint enforces) — the wrapper sanitizes castling rights on every load.
- Web: `"use client"` only when needed; keep `page.tsx` server components.

---

## 5. Testing

- API unit: Jest, `*.spec.ts` beside source (`rootDir: src`, `@/` → `src/`). Extend the neighbouring spec; changed business logic → updated spec. No web unit tests; flows are Playwright.
- **DB integration** (`*.int-spec.ts`, `npm run test:integration`): real Postgres at `INTEGRATION_DATABASE_URL` whose name ends `_int`/`_ci`/`_test` (every test truncates); DB timezone is `Asia/Kolkata`. Use for raw SQL, indexes, soft delete, job locks. `createTestApp()` boots the full `AppModule`. Setup: [docs/PROJECT_RULES.md](docs/PROJECT_RULES.md) §7.
- **Access suites** (`test/integration/access/`): every route refuses anonymous callers (`ANONYMOUS_OK` allow-list); admin routes are auto-checked for 403s; **a new endpoint taking an id of something a user owns gets a row in `cross-user-access.int-spec.ts`**. Details: [docs/AUTHORIZATION.md](docs/AUTHORIZATION.md) § "Tests that hold this".

---

## 6. Deployment & ops (context — don't run these yourself)

CI runs on PRs (unit tests, migrations + drift check, integration tests, lint, build); the `main` ruleset requires it. Push to `main` deploys changed services via `scripts/deploy-production.sh`, migrating **before** swapping the API; failures roll back to `:last-good` images. **Migrations are never reversed — keep them additive.** `NEXT_PUBLIC_*` vars are build-time. A new bulk source-data table is excluded from backup dumps in both `scripts/backup_db.sh` and admin backup. New workflow steps pin actions to a commit SHA. Full detail: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) § "CI, automated deploys and rollback".

---

## 7. The rules that will silently break the build if ignored

1. **New Prisma model → getter in `prisma.service.ts`.**
2. **Schema change → migration** (`db:migrate:dev`), never `db push`.
3. **New/changed endpoint → `API_ROUTES` + `packages/types`** before either app.
4. **New API module → token-string auth pattern** (§3.2). No guards.
5. **Soft-deletable deletes → `TrashRepository.softDelete` in a `$transaction`.**
6. **Update the relevant doc in the same change** when setup, commands, env vars or behaviour change.
7. **Table action buttons → `RowActions`** / `rounded-full` icon template, `strokeWidth={2.5}`.
8. Reuse `components/ui/` primitives before writing new UI.
9. **Payments: integer minor units; access only from an `Entitlement`**; every state change via `PaymentService.applyProviderState`; no adapter outside `payments/providers/`.
10. **Invoices: a failed PDF never changes a payment**; tax via the shared engine; issued invoices never edited — refunds get credit notes.
11. **Dates: store UTC, localize in the browser** (§3.4, §3.6).
12. **Keep this file small** (it loads into every request). A new feature's details go in `docs/<FEATURE>.md` (or the matching existing doc); here it gets a 1–3 line summary under its § number: paths, the rule you must not break, the link. Debugging rows go in `docs/TROUBLESHOOTING.md`.

---

## 7b. Autonomous agents

Both prior autonomous managers (`.ai/`, `.nexa-agent/`) were removed 2026-09-08 (recover from git history). **`dev`** is the base branch for VPS-side work and **`vps_dev`** the database. **A merge into `dev` only happens on explicit human approval** — passing tests are not permission. Safety boundary: [.agents/SAFETY.md](.agents/SAFETY.md).

## 8. Debugging

Grep [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) (80+ symptom rows, per feature) for the feature or error text first. Common: "model X does not exist on PrismaService" → missing getter; unstyled web / missing chunk → `npm run dev:web:clean`; missing module in `dist` → `npm run dev:api:clean`; 403 "Request origin is not allowed" → origin missing from `CORS_ORIGIN`.
