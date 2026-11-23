# Backend code review — 2026-11-23

Scope: `apps/api` and `packages/types` on `dev` at `8c0749d` (after PR #170, "one lead pipeline + ad
measurement"). Two passes:

1. **PR #170 backend diff, line by line**: WhatsApp lead capture, the Frappe stage return path, Meta
   CAPI outbox, ad-spend insights, the lead funnel report, the ad-consent endpoint.
2. **Whole backend, rule by rule**: every CLAUDE.md rule that can be checked mechanically, searched
   across all of `apps/api/src` and the Prisma schema, with each hit read in context.

No code was changed by this review. Each finding below says how to fix it.

## Findings

### 1. A captured WhatsApp lead's child details never reach Frappe — important

`apps/api/src/lead/lead.service.ts:195` (`upsertFromWhatsApp`, the `filling` branch)

Lead capture creates the lead with `LEAD_DETAILS_NOT_GIVEN` placeholders and copies it to Frappe at
once. Frappe then has no `student_name` and the note says "Student: not given yet". When the bot later
books a demo for that number, `upsertFromWhatsApp` finds the lead and fills in the child's name, age
and level, but returns `created: false`. Nothing re-sends the document after that. `markStageChanged`
only re-sends the stage, and only with stage sync on. So in Frappe, the CRM salespeople use, the lead
never gets the child's details.

Fix: when `filling` is true, have the push row update the Frappe lead's `student_name` and add a note
with the details. For example, add a "details changed" flag to `CrmLeadPush` that `send` handles with a
`PUT`, plus a new `FCRM Note`.

### 2. A retried out-of-order ad message counts its click twice — important

`apps/api/src/support/support-lead-capture.service.ts:190` (`recordClick`)

The only idempotency check is `existing.latestMessageId === event.providerMessageId`. A message older
than the latest click never becomes `latestMessageId` (the update keeps the newer click). When that
older message is processed again, it passes the check, so `clicks` is incremented a second time and
a duplicate "Came from a WhatsApp ad" activity is written. Reprocessing does happen:
`handleCustomerMessage` rethrows after the bot fails, a lease can be lost, and Meta retries deliveries.

Fix: make the check per message, not per latest click. Add a unique
`(leadId, providerMessageId)` row (a small `LeadAdClickMessage` table, or the activity keyed on the
message id) and skip when it already exists.

### 3. Trashed leads are still read by the Frappe return path and the Meta sender — important

`apps/api/src/lead/frappe-crm-stage-return.service.ts:150` and `apps/api/src/meta-capi/meta-capi.service.ts:197`

The soft-delete extension adds `isDeleted: false` to the top-level `where` and to **list** relations
in `include`/`select`. It does not filter to-one relations or nested relation filters in `where`.
This has two effects:

- The stage return query (`crmLeadPush.findMany({ where: { lead: { … } } })`) returns pushes of
  trashed leads. `take()` then moves the trashed lead's stage, writes a timeline entry and runs the
  referral tracker. Writes are not filtered.
- `send()` loads `row.lead` through a to-one include, so an event queued before the lead was trashed
  is still sent to Meta, with the lead's hashed email and phone.

Fix: add `lead: { isDeleted: false, … }` to the stage return `where`. In `send()`, skip the event (as
`SKIPPED`) when `row.lead.isDeleted`. Better still, mark the lead's pending `MetaCapiEvent` rows
`SKIPPED` in the same transaction that trashes the lead.

### 4. Ad spend is wrong ×100 for currencies with no decimal places — nit

`apps/api/src/meta-capi/meta-ads-insights.service.ts:24` (`spendToMinor`)

Meta reports `spend` in major units, and this function always multiplies by 100. That is right for
INR, Nexa's currency today, but wrong for a zero-decimal account currency (JPY, KRW, …).

This also reimplements the shared helper that CLAUDE.md §3.6f names ("money is integer minor units
(`toMinorUnits`)").

Fix: `toMinorUnits(value, currency)` from `@nexa-chess/types` `payments.ts`, which already applies the
currency's own factor. Read the row's `account_currency` before converting its spend.

### 5. `tenantId` on the usage-history route isn't validated — nit (convention)

`apps/api/src/platform-billing/platform-billing.controller.ts:111` → `tenant-usage.service.ts:113`

CLAUDE.md §3.2: "params/queries via `parseOrBadRequest` … and `queryEnum`/`queryString`". Here
`tenantId` is passed to Prisma unchecked. `?tenantId=a&tenantId=b` arrives as an array, which makes
Prisma throw a validation error, returned as a 500. The route is platform-operator only, so this is
low risk.

Fix: `optionalQueryString(query.tenantId, "tenantId")`.

### 6. A lead status change and its Frappe re-send aren't atomic — nit

`apps/api/src/lead/lead.service.ts:501` (`updateStatus`)

PR #170 moved the status change and the Meta event into one transaction. `markStageChanged` still
runs afterwards, on `this.prisma`. If that call fails, the stage has changed in NexaGen but the push
row is never set to `PENDING`, and the sweep doesn't notice. This also breaks the rule that the
return path relies on: "a PENDING row has a NexaGen change on its way". The Frappe return path could
then undo the admin's change.

Fix: call `markStageChanged(tx, id)` inside the same `$transaction`.

## Whole-backend rule checks (all passed)

| Rule (CLAUDE.md) | Check | Result |
|---|---|---|
| §3.2 no hand-rolled access-token verify | `verifyAsync` outside `auth/authenticate.ts` | 4 hits, all other token kinds (MFA challenge, refresh, demo guest, recording stream). OK |
| §3.2 no raw `role: COACH` filter | grep | Every hit carries a `coach-role-ok` reason. OK |
| §3.2 no bare `schema.parse` on request input | grep `Schema.parse(` | All hits parse stored JSON or already-validated bodies. OK |
| §3.6b cron single-runner | every `@Cron` file | All 41 use `runExclusive` / `runForEachTenant` or a claim. OK |
| §3.6b no session `pg_try_advisory_lock` | grep | None. OK |
| §3.6m2 raw SQL reviewed | every `$queryRaw`/`$executeRaw` file vs `raw-sql-review.spec.ts` | Only integration-test helpers are missing, as expected. OK |
| §3.4 financial relations to `User` are `Restrict` | schema scan | Only `ReferralCode`/`Referral` cascade. Rewards, ledger, withdrawals and redemptions are `Restrict` (so purging a referrer is blocked while it has history). OK |
| §4 `Chess` never from `chess.js` | grep | One type-only `Square` import in `assignment-evaluation.service.ts`. OK |
| Query parsing | `@Query("x")` without helpers | Numeric/date params are clamped or parsed by `parseDateFilter`; only finding 5 remains. |

## Checks run

All checks were run on `dev` at `8c0749d`, after `npm ci`, `npm run db:generate` and a build of
`packages/types` and `packages/config`:

- `npm run typecheck -w apps/api`: passed, no errors.
- `npm run lint -w apps/api`: passed.
- `npm run test -w apps/api`: 238 suites passed (2 skipped); 3481 tests passed (8 skipped).

Integration tests (`npm run test:integration`) were not run: this environment has no Postgres. The
unit tests passing doesn't contradict the findings above, because none of them is covered by a unit
test today. Each fix should come with one.
