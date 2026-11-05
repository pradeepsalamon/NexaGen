# API development rules (strict)

Mandatory for every change under `apps/api/` and `packages/types/`, by people
and AI agents alike. **MUST** and **NEVER** are not suggestions: a change that
breaks one is not done, whatever its tests say. When a rule here and older code
disagree, this file wins; fix the old code or log it in `docs/BACKLOG.md`.

Background and the "why" behind each rule: [CLAUDE.md](../CLAUDE.md) §3–§7,
[AUTHORIZATION.md](AUTHORIZATION.md), [SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md),
[PAYMENTS.md](PAYMENTS.md), [MESSAGING.md](MESSAGING.md).

---

## 1. Contract first

1. A new or changed endpoint **MUST** start in `packages/types`: the path in
   `API_ROUTES` (`api-endpoints.ts`; path-param routes are functions, the
   controller calls the no-arg form) and the request/response types (Zod schema
   + `z.infer` where there is a body). Then the API, then the web.
2. **NEVER** hardcode an API path in a controller, service, spec or the web.
3. Responses **MUST** go through a private `toX()` mapper that returns the
   shared type: dates `.toISOString()`, `Decimal` `.toString()`, soft-deleted
   relations dropped. **NEVER** return a Prisma row as is.

## 2. Authentication and roles (no guards)

1. The controller **MUST** take `@Req() request: Request`, read the token with
   `request.cookies?.[AUTH_COOKIE_NAMES.accessToken]` and pass it as the
   service method's first argument. `route-auth.spec.ts` fails a handler that
   never uses its request.
2. The service **MUST** resolve the user with
   `authenticateUser(this.jwtService, this.prisma, accessToken)`
   (`auth/authenticate.ts`). **NEVER** call `jwtService.verifyAsync` on an
   access token yourself.
3. Role checks **MUST** be explicit (`assertCanX(user)` / `ForbiddenException`);
   row visibility **MUST** come from a `getXVisibilityWhere(user)` helper.
   Platform routes **MUST** call `assertPlatformOperator(user)`.
4. A public route **MUST** be on `PUBLIC_ROUTES` with a reason. A new webhook
   route **MUST** be on the CSRF exempt list and keep its raw body.
5. **NEVER** add a NestJS guard for auth (only the global throttler and
   `FeatureGateGuard` exist).

## 3. Input validation

1. Bodies: class-validator DTO implementing the shared type, or `ZodBodyPipe`
   with the shared schema; match the module.
2. Params and queries: `parseOrBadRequest` (`common/zod-body.pipe.ts`) and
   `queryString` / `queryEnum` / `optional*` (`common/query-params.ts`).
   **NEVER** a bare `schema.parse` (a ZodError is a 500).
3. Multipart: `RequireAccessTokenInterceptor` first, then `FileInterceptor` with
   `limits: { fileSize, files: 1, fields }`.

## 4. Academy isolation (multi-tenancy) — read this twice

Every academy-owned row carries `tenantId`. The `tenantScope` Prisma extension
adds the current academy to reads, updates, deletes, counts and creates. It
does **not** check the ids a new row points at. These rules close that gap.

1. **Load before you link.** Any id that came from a request (body, params,
   query) and that you are about to store as a foreign key (`batchId`,
   `studentId`, `topicId`, …) **MUST** first be read through a scoped Prisma
   query (`findUnique` / `findFirst` with the visibility where), which returns
   nothing for another academy's row → 404. **NEVER** write
   `create({ data: { batchId: body.batchId } })` without that read.
2. **No academy, no query.** Code outside a request (cron, BullMQ worker,
   webhook, script) **MUST** run inside `runInTenant(tenantId, label, fn)`, or
   `JobLockService.runForEachTenant(...)` for a cron over every academy. With
   no context the extension throws; that is correct, don't work around it.
3. **`asPlatform(reason, fn)` is the only bypass**, for genuinely
   cross-academy work (platform console, global claims, monitoring). It
   **MUST** carry a specific reason, and **NEVER** wrap a request handler's
   academy data to "make it work".
4. **Raw SQL is not scoped for you.** Every `$queryRaw` / `$executeRaw` on
   academy tables **MUST** filter with `tenantFilter(alias)` / `sqlTenantId()`
   (`tenancy/tenant-sql.ts`), and the file **MUST** be added to
   `tenancy/raw-sql-review.spec.ts` with its kind and reason. Bind timestamps
   as `${d.toISOString()}::timestamp`, never a JS `Date`.
5. **New models are academy-owned by default** (`tenantId String`, with the
   migration). A platform-wide model **MUST** be listed in `PLATFORM_MODELS`
   (`tenancy/tenant-models.ts`) with its reason. New model → getter in
   `PrismaService`.
6. **Uniqueness is per academy**: `@@unique([tenantId, …])`, and lookups use
   the `tenantId_…` compound key. Pre-checks for email/username use
   `prisma.withDeleted`.
7. **Cross-academy links are monitored, not blocked.** The nightly tenant
   integrity check (`tenancy/integrity/`) walks every foreign key between
   academy tables automatically. A link that may legitimately cross academies
   (a platform operator acting on an academy) **MUST** be added to
   `PLATFORM_OPERATOR_LINKS` with its reason, reviewed like the raw-SQL list.
   The monitor is not a licence to skip rule 1.
8. **Caches, files, queues and LiveKit** keys **MUST** include the academy
   (`jobId` from your own row id, no `:`); per-academy settings resolve inside
   the context.
9. **NEVER** implement database row-level security or composite tenant FKs
   ad hoc: RLS is a planned, separate step (SAAS_MULTI_TENANCY.md §E item 5).

## 5. Data and schema

1. Every schema change **MUST** have a migration (`npm run db:migrate:dev`,
   or `prisma migrate dev --create-only` against a scratch database); **NEVER**
   `db push`; **NEVER** hand-write or rename a migration folder. Migrations
   **MUST** be additive (they are never reversed in production).
2. Soft-deletable models delete only via `TrashRepository.softDelete(tx, …)` in
   a `$transaction`.
3. Timestamps are UTC `timestamp WITHOUT time zone`; serialize with
   `.toISOString()`; localize only in the browser.
4. Financial relations to `User` are `onDelete: Restrict`; money is integer
   minor units; payment state changes only via
   `PaymentService.applyProviderState`; no gateway adapter outside
   `payments/providers/`.
5. A new model that stores personal data **MUST** get a privacy export section;
   an ever-growing log table **MUST** get a `RETENTION_RULES` entry.

## 6. Side effects

1. Messages to users go only through
   `MessagingDispatchService.dispatchInBackground`; fixed emails through
   `SystemMessageRenderer` and the catalogue (`system-messages.ts`), never
   hardcoded text. A platform-only message sets `platformOnly: true`.
2. Copy an academy sends or prints uses its name
   (`BrandingService.nameFor()` / `{{academy.name}}`), never "Nexa Chess".
3. Crons **MUST** be single-runner (`JobLockService.runExclusive` /
   `runForEachTenant`). BullMQ is optional: persist your own status row first,
   the enqueue is a nudge.
4. Plan features/limits are enforced in the API: `@RequireFeature("key")` and
   `EntitlementService.assert*` inside the creating transaction (402).
5. Logs and Sentry: students are minors. Only `user.id` and `role`; **NEVER**
   names, emails, phone numbers, message bodies or query strings.

## 7. Errors

1. Expected failures **MUST** be Nest HTTP exceptions with a sentence a user
   can act on (400 / 401 / 402 / 403 / 404 / 409). A 500 means a bug.
2. Another academy's or user's row is **404**, not 403 (don't confirm it
   exists).
3. Lost races on claims return **409** (status- or ply-filtered `updateMany`).

## 8. Tests (required, not optional)

1. Changed business logic → updated unit spec beside the source.
2. Raw SQL, indexes, soft delete, job locks, tenant behaviour → an
   `*.int-spec.ts` against real Postgres (`npm run test:integration`).
3. A new endpoint taking an id of something a user owns → a row in
   `test/integration/access/cross-user-access.int-spec.ts`; academy data →
   covered by `cross-academy-access.int-spec.ts` (a second academy can't read
   or change it).
4. Admin/platform routes are auto-checked for 403/anonymous refusals; keep
   those suites green.

## 9. Definition of done (API)

- [ ] Contract in `packages/types`; no hardcoded paths
- [ ] Token-string auth, explicit role check, visibility helper
- [ ] Every request id loaded through a scoped query before it is linked
- [ ] Crons/workers inside `runInTenant` / `runForEachTenant`; `asPlatform` only with a reason
- [ ] Raw SQL scoped and listed in `raw-sql-review.spec.ts`
- [ ] Migration (additive) + `PrismaService` getter + `PLATFORM_MODELS` if platform-wide
- [ ] Unit + integration tests, access-suite rows
- [ ] `npm run typecheck -w apps/api`, `npm run lint -w apps/api`,
      `npm run test -w apps/api` pass (and `test:integration` when the DB is touched)
- [ ] The relevant doc updated in the same change
