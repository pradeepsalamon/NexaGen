# Background jobs, rate limiting & error reporting

> Moved out of [CLAUDE.md](../CLAUDE.md) on 2026-10-17 to keep that file
> under the context limit; the text is unchanged. `§` numbers refer to
> CLAUDE.md, which keeps a short summary under the same number.

## 3.6b Background jobs (BullMQ)

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
Pass a `jobId` derived from your own row for idempotency. See the walkthrough
below.

**Cron single-runner: `JobLockService.runExclusive(JOB_LOCKS.x, run)`**
(`prisma/job-lock.service.ts`, global via `PrismaModule`). A lease row in
`job_locks` (DB time, renewed every ttl/3, expires if the process dies), so it
holds no connection while the job runs. **Never use session
`pg_try_advisory_lock` / `pg_advisory_unlock` through Prisma**: the pool can run
the two on different connections, the unlock no-ops and the lock leaks, and the
cron then silently skips on every other connection. Add each new cron's name to
`JOB_LOCKS` (one name per job — two crons once shared id `73002080`). Specs
provide `createJobLockStub()` from `prisma/job-lock.testing.ts`.

**Retention sweep** (`apps/api/src/retention/`): one daily cron (04:00 UTC, job
lock `retention.sweep`) deletes rows in batches of 5,000. It applies two kinds
of rule, the fixed ones first:

- **Fixed, in code** (`RETENTION_RULES`): operational rows nothing reads any
  more. Expired `auth_sessions` and reset/verification tokens (+1 day),
  `processed_webhook_events` (30 days), `visitor_sessions` idle 180 days with
  no lead, `knowledge_search_logs` (90 days). Before this, every 15-minute
  token refresh left a row behind for good. A new log-style table that only
  ever grows belongs here.
- **Admin-set, per category** (`RetentionPolicy`, one row per
  `RetentionCategory`; page `/admin/data-retention`, super admin only, routes
  `API_ROUTES.adminRetention.*`). Covers user content whose window is a policy
  choice: `chat_messages`, `live_chat_messages`, `notifications`,
  `message_deliveries` (never `PENDING`: a queued message is outbox work and its
  dedupe key stops a double send) and `analytics_events`. **The default is kept
  forever**: no row or `days` null deletes nothing. Limits, recommendations and
  the one validation rule (`retentionDaysError`) are `RETENTION_CATALOGUE` in
  `@nexa-chess/types` `retention.ts`. The minimums (30 days, 90 for analytics)
  cover what the app still reads: the 30-day active-user count, and the reminder
  crons' lookbacks, which are hours. A stored window below its minimum is
  skipped, never applied. Category → table/column/filter is
  `RETENTION_CATEGORY_TARGETS`. Each run sets `lastSweptAt`/`lastDeletedCount`;
  an admin change sets `changedAt`/`updatedById` (not `@updatedAt`, so the
  sweep's write doesn't read as an edit). The page previews what a window
  would delete before Save (`…/preview?days=`).

Deletes are permanent (no Trash). Payment webhooks, invoices and other
financial or audit records are in neither list on purpose. A new category =
the enum value (migration) + `RETENTION_CATALOGUE` + `RETENTION_CATEGORY_TARGETS`
+ the "How long we keep it" line in `features/legal/content.ts`.

## 3.6c Rate limiting

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
storage's Lua `eval` KEYS. The fallback logs once going down and once on
recovery; with `REDIS_URL` unset the module keeps in-memory counters (reset on
every deploy) and warns at boot.

## 3.6d2 Error reporting (Sentry)

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

## Edge: Cloudflare stays DNS-only

Every app hostname (`nexachess.in`, `www`, `api`, `livekit`, `dev`, `api-dev`, `crm`)
is a **DNS-only (grey cloud)** record pointing straight at the VPS; TLS is
certbot on the box (`certbot.timer`). Only `monitor.` is proxied. Don't turn the
proxy on:

- **It made the app slow.** On the free plan, Indian ISPs (Jio, Airtel) are
  often routed to a Cloudflare edge outside India (e.g. Singapore), so every
  request left the country and came back to the Mumbai VPS (`ap-mumbai-1`).
  Check from a user's network: `https://monitor.nexachess.in/cdn-cgi/trace` →
  `colo=` (`BOM` is Mumbai).
- **`livekit.` can't be proxied** (WebRTC UDP / TURN ports), and it shares the
  VPS IP, so proxying the rest wouldn't hide the origin anyway.
- Free-plan proxy limits (100 MB request body, ~100 s timeout) would hit uploads
  and recordings on `api.`.

A new subdomain: add the record grey, run certbot on the box.

## Walkthrough: adding a queue

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
