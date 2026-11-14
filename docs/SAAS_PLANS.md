# SaaS plans: subscription tiers, features and limits

Status: **implemented** (2026-10-19) — the first slice of
[SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) §G (entitlements). Online
SaaS billing, the host → tenant resolver and the platform console are **not**
built yet; see "Not yet" below.

An academy (tenant) is on one **platform plan**. The plan decides which
**features** the academy can use and how many of some things it may have
(**limits**). Everything is enforced by the API; the web only hides what the
plan doesn't include and explains the upgrade.

Not to be confused with `Plan` / `Subscription` / `Entitlement` in
`payments/`, which are the academy billing **its students** (PAYMENTS.md).

---

## Where things live

| What | Where |
|---|---|
| Feature + limit catalogue, default plans, access-mode rule, effective-entitlement resolver, API shapes | `packages/types/src/platform-plans.ts` |
| Tables | `tenants`, `platform_plans`, `tenant_subscriptions`, `tenant_subscription_events`, `platform_staff` (migration `20261020120000_saas_subscription_plans`) |
| Enforcement | `apps/api/src/platform/`: `EntitlementService`, `FeatureGateGuard` (global), `@RequireFeature`, `PlanRestrictionException` |
| Academy view | `GET /subscription` (any signed-in user), `GET /admin/subscription` (admins) |
| Platform staff | `GET /platform/plans`, `PATCH /platform/plans/:id`, `GET`/`PUT /platform/tenants/:tenantId/subscription` |
| Web | `features/subscription/` (`useCurrentEntitlements`, `usePlanFeature`, `FeatureGate`, `RouteFeatureGate`, `SubscriptionClient`), page `/admin/subscription`, `NavItem.feature` in `components/layout/navItems.ts` |

Only one tenant exists: `tenant_nexa` (`DEFAULT_TENANT_ID`), seeded by the
migration on **Enterprise / ACTIVE**, so production behaves exactly as before.
`EntitlementService.currentTenantId()` is the single place that will switch
to the request's tenant when the resolver lands.

## Features

Core product on every plan (not features): batches, scheduling, live classes,
attendance, assignments, the puzzle library, announcements, notifications.

| Key | What it gates (API) |
|---|---|
| `advancedAnalytics` | `AnalyticsController` except `overview` / `today` / `alerts` (the admin home dashboard) |
| `classRecording` | `POST liveClass.startRecording` only — existing recordings stay watchable |
| `coachFeedback` | `FeedbackController` |
| `coachPayroll` | `PayrollController`, `PayrollAdminController` |
| `courses` | `CourseController` |
| `customBranding` | chess-appearance and typography **admin** routes (users' own preferences stay) |
| `demoClasses` | `DemoScheduleController`, the admin demo-class routes in `AdminController` |
| `directChat` | `ChatController` |
| `gameAnalysis` | `GameAnalysisController`, `GameSourcesController` |
| `gameLibrary` | `GameLibraryController` |
| `interactiveClassroom` | simul, matches, move polls, puzzle rush, activity queue, chapters, classroom tools — **writes only** (`allowReads`), because the room reads their state on mount |
| `leadsCrm` | the `adminLeads.*` routes (the public lead form keeps capturing) |
| `messagingAutomation` | `MessagingController` |
| `smartRevision` | `RevisionController` |
| `studentPayments` | payments, invoices, admin payments/invoices, manual payments (never the provider webhooks) |

**Rule:** a key exists in `PLAN_FEATURE_KEYS` only if some route enforces it.
`platform/platform-plans.spec.ts` fails a catalogued feature that no
`@RequireFeature` uses. Something not enforced yet (custom domain, white label)
is not listed.

### Adding a feature

1. Add the key + `PLAN_FEATURES` entry in `platform-plans.ts`, and add it to the
   tiers in `DEFAULT_PLATFORM_PLANS`.
2. `@RequireFeature("key")` on the controller (or handler). `@RequireFeature(null)`
   on a handler exempts it; `{ allowReads: true }` gates writes only.
3. A migration that appends the key to the right `platform_plans.features`
   rows (Enterprise at least — or the live academy loses it).
4. Web: `feature` on the nav items, the page prefixes in
   `features/subscription/lib/featureRoutes.ts`, and gate any query that runs
   outside the feature's own pages on `usePlanFeature(key) === true`
   (see `useChatUnread`, `usePendingFeedbackQuery`).

## Limits

| Key | Counts | Checked in |
|---|---|---|
| `maxStudents` | ACTIVE students | `UserService.create/update/restore`, `AdminService.updateStudentStatus` |
| `maxCoaches` | ACTIVE coaches | same, plus `AdminService.updateCoachStatus` |
| `maxBatches` | non-deleted batches (archived count) | `BatchService.create` |
| `maxConcurrentLiveClasses` | `LiveSession` rows LIVE | `LiveClassService.startClass` |

- Pending self-registrations take **no seat**; approving one does.
- Seat and batch checks run **inside the creating transaction** under
  `pg_advisory_xact_lock(hashtext('plan-limit:<tenant>:<limit>'))`, so
  concurrent creates can't both take the last seat (integration-tested).
  Transaction-scoped, never a session lock (CLAUDE.md §3.6b).
- The live-class check is best effort (LiveKit room creation sits between
  check and write); a one-room overshoot in a race is accepted.
- `null` = unlimited. A missing or malformed limit reads as **0** (fail closed).
- Not checked: restoring a user from Trash, and bulk paths that don't go
  through the services above.
- A **downgrade never deletes anything**: over-limit rows stay; only adding more
  is refused.

## Subscription state → access mode

`resolveTenantAccessMode` (shared) derives it from the stored dates on every
read, so an ended trial locks on time without a cron:

| Status | Mode |
|---|---|
| ACTIVE, PAST_DUE, TRIALING (before `trialEndsAt`), CANCEL_SCHEDULED (before `currentPeriodEnd`) | FULL |
| GRACE (before `graceEndsAt`) | READ_ONLY — GET/HEAD only |
| anything ended, EXPIRED, CANCELLED, tenant not ACTIVE, no subscription | LOCKED |

LOCKED and READ_ONLY never block `/auth`, `/health`, `/subscription`,
`/admin/subscription`, `/privacy`, `/platform` or provider webhooks
(`isAlwaysOpenPath` in `feature-gate.guard.ts`).

## Errors

Every refusal is **402** with a `PlanRestrictionError` body: `code` is
`PLAN_FEATURE_REQUIRED` (+ `feature`), `PLAN_LIMIT_REACHED` (+ `limit`),
`SUBSCRIPTION_READ_ONLY` or `SUBSCRIPTION_LOCKED`. Never 401 (the web would
spend a refresh rotation) and never 403 ("your role can't" is a different
answer from "your plan can't").

## Caching

`EntitlementService` caches the tenant's state in-process for 30s; every
`/platform` write calls `invalidate()`. With more than one API process a plan
change takes up to 30s to reach the others. The web caches `/subscription` for
5 minutes; the API is the enforcement either way.

## Platform staff and changing a plan

Platform powers come only from a `platform_staff` row — never a tenant role,
not even `SUPER_ADMIN` (`admin-routes.int-spec.ts` asserts every `/platform`
route is 403 for every tenant role). Grant it on the box:

```sql
INSERT INTO platform_staff (id, "userId", role)
SELECT 'staff_' || id, id, 'PLATFORM_ADMIN' FROM users WHERE email = '…';
```

The dev seed makes `superadmin@nexa.test` platform staff.

Change the academy's plan (until online billing exists):

```http
PUT /platform/tenants/tenant_nexa/subscription
{ "planCode": "GROWTH", "status": "ACTIVE", "note": "Signed annual contract" }
```

Also accepts `trialEndsAt`, `currentPeriodStart`, `currentPeriodEnd`,
`graceEndsAt` (ISO, or `null` to clear) and `overrides`:

```json
{ "overrides": { "addFeatures": ["coachPayroll"], "removeFeatures": [], "limits": { "maxStudents": 400 } } }
```

`removeFeatures` wins over `addFeatures`. Every change appends a
`tenant_subscription_events` row (actor, from/to plan and status, note, full
change set). `PATCH /platform/plans/:id` edits a plan's name, prices,
features, limits, visibility; it applies to every tenant on that plan at once.

## Default tiers (seed data — edit in the database)

| | Starter | Growth | Business | Enterprise |
|---|---|---|---|---|
| Students / coaches / batches / live at once | 50 / 3 / 10 / 2 | 250 / 15 / 50 / 5 | 1000 / 50 / 200 / 15 | unlimited |
| Features | direct chat, game library | + recording, feedback, courses, branding, demo classes, interactive classroom, leads, smart revision, student payments | + analytics, payroll, game analysis, messaging automation | everything |
| Price (INR / month) | 2,499 | 6,999 | 14,999 | contact us |

Prices and tiers are placeholders for the owner to set.

## Not yet

- Online SaaS billing (provider checkout, webhooks, `PlatformInvoice`) —
  SAAS_MULTI_TENANCY.md §G. Plans are assigned by platform staff for now.
- Self-serve upgrade from `/admin/subscription` (it says "contact NexaChess").
- A platform console UI for `/platform/*` (API only).
- Multi-tenancy itself (tenantId on data, host resolver) — §D/§E.
- Frozen plan versions per subscription: editing a plan re-prices/re-scopes
  everyone on it.
