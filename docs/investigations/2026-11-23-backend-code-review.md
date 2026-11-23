# Backend code review — 2026-11-23 (Part 1: PR #170 + rule checks; Part 2: high-risk modules; Part 3: learning, chat, uploads, tournaments)

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

---

# Part 2 — high-risk modules, read in full

Five reviewers each read one group of modules in full (about 38,000 lines in total). Each
finding was checked against the code before it was added here. Where I re-read the code myself,
the finding is marked **✓ re-checked**; the others are as the reviewer confirmed them. Nothing was
changed. Severity: **critical** = money or security now; **important** = a real bug users can hit;
**minor** = narrow or low impact.

Modules not covered by Parts 1–2 are listed at the start of Part 3, with what Part 3 covered.

## Payments (`payments/`)

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| P1 | **critical** ✓ re-checked | `payment.service.ts:318`, `packages/types/src/payments.ts:642` | The buyer can set `currency` at checkout (`dto.currency ?? plan.currency`), but `amount` stays the plan's number. Nothing converts it, the router accepts any currency (`international` rule has `currencies: []`), and the capture check compares amount only. Example: a ₹999 plan bought with `currency: "PKR"` is charged PKR 999 (≈₹300) and gets full access. | Refuse `dto.currency !== plan.currency` (or use per-currency prices). In `applyProviderState`, require the provider's currency to equal the payment's before granting. |
| P2 | important | `subscription.service.ts:227-299` | ✓ re-checked: subscription charges never create a `Payment`, `Entitlement` or `Invoice`. Subscribers are billed each cycle with no access and no receipt. `start()` also charges `plan.amount`, ignoring the order's discount and tax. | On each charge event, create a payment and route it through `applyProviderState`. Charge the priced order total, or refuse discount codes on recurring plans. |
| P3 | important | `providers/stripe.provider.ts:242-246,295` → `subscription.service.ts:252` | Stripe `invoice.*` events are treated as subscription status. Invoice statuses (`paid`, `open`, …) map to `CREATED`, so each renewal sets an ACTIVE subscription back to CREATED. After that the customer can't cancel, and a second subscription can open. | Give `invoice.*` events a null subscription status, and add a transition guard in `applyWebhook`. |
| P4 | important | `refund.service.ts:312` → `credit-note.service.ts:152` | The credit note throws inside the refund-settlement transaction when the refund is larger than the creditable invoice total. Causes: GST is rounded twice on the invoice but once at checkout, an EXPORT/NONE invoice carries no tax, or an admin credit note already exists. The refund is then stuck PENDING forever, and every sweep retries and fails. | Cap the credit note at the creditable remainder, or skip it with an audit entry, instead of throwing. Price checkout with the same `computeTax` as the invoice. |
| P5 | important | `payment.service.ts:555-569`, `providers/razorpay.provider.ts:169-180` | When a Razorpay payment has no payment id yet, reconcile looks it up by order id. `getPayment` sends that to `/payments/order_…`, which fails. The error path then expires a payment that may have been captured, the student pays again, and is charged twice. | Use `getPaymentByOrder` for `order_` handles. Never expire on a lookup error. |
| P6 | important | `payment.service.ts:444-470,979` | Retrying an old failed payment opens a new attempt even while another attempt on the same order is still in flight, so both can be charged. | Refuse while any payment on the order is in flight (lock the order row). Flag a second PAID payment on one order for refund. |
| P7 | important | `payment.service.ts:630-633` | `providerPaymentId` is written only when empty. After a failed Razorpay attempt then a success on the same order, the row keeps the failed id, so refunds and reconcile hit the wrong payment. | Overwrite the id when the incoming status is PAID or AUTHORIZED. |
| P8 | important | `discount.service.ts:94-108,168-196` | One-use personal or voucher codes aren't reserved at checkout, and `redeem` doesn't re-check the limit. One ₹500 code can be used on several open orders. | Refuse a checkout while another open order of the user's carries the same limited code, or reserve the code at checkout. |
| P9 | important | `refund.service.ts:152-183,262-266` | With `revokeAccess`, access is revoked as soon as the gateway accepts the refund. If the refund later fails, the payment goes back to PAID but access stays revoked. | Revoke only when the refund succeeds, or restore access on the FAILED path. |
| P10 | minor | `refund.service.ts` | Concurrent admin refunds read the balance without a lock (the key is built from `Date.now()`). The refund webhook falls back to "newest unsettled refund". The Cashfree event id falls back to `cf_payment_id`. | Lock the payment row when creating a refund, and match refunds by provider id only. |

## Auth, users, privacy (`auth/`, `user/`, `privacy/`, `common/security/`)

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| A1 | important ✓ re-checked | `auth/auth.service.ts:722-728,955-996`, `user/user.service.ts:263-279` | Unused password-reset and invite tokens are never cancelled by an email change (self or admin), an admin password change, or a successful reset. So a 7-day invite sent to a mistyped email still takes over the account after the admin fixes the email. | `passwordResetToken.updateMany({ where: { userId, usedAt: null } })` in each of those transactions. |
| A2 | important | `auth/auth.service.ts:714,888-892` | The account phone changes without the current password. With WhatsApp switched on for password resets, a stolen session can set its own phone and then reset the password. Platform-support accounts can also use login and forgot-password. | Require `currentPassword` for a phone change and notify the old phone. Refuse `isPlatformSupport` accounts in login and forgot-password. |
| A3 | important ✓ re-checked | `user/user.service.ts:355-418` | `archive()` doesn't revoke sessions. When the account is restored, old refresh tokens (up to 7 days) work again. | Revoke `authSession` rows in `archive` (and in the soft-delete path). |
| A4 | important ✓ re-checked | `user/user.service.ts:127,142,216,252`, `user/dto/user.dto.ts` | Emails set by an admin keep their capital letters, but login and forgot-password look up the lowercased email. That user can never sign in, and the case-sensitive duplicate check allows a second account. | Lowercase and trim in the DTO or service, plus a one-off data migration. |
| A5 | minor | `auth/auth.service.ts:496-513` | A refresh that loses the rotation claim to a logout or reset falls into the 30-second grace path and creates a new session in the family that was just revoked. | Re-read the row and return 401 if `revokedAt` is set. |
| A6 | minor | `auth/auth.service.ts:187-302,1175` | The global `users_email_key` index is still present (D5 hasn't run). Signing up at academy B with an email that exists at academy A gives a 500, which also reveals the email exists. | Map P2002 to 409 in register, registerCoach and updateProfile. |
| A7 | minor | `auth/auth.service.ts:699`, `privacy/account-deletion.service.ts:61` | Password confirmations are rate-limited per IP only, never per account. | Count failures with the login lockout. |
| A8 | minor | `auth/auth.service.ts:331-338` | The lockout answers 429 for an existing email and 401 for an unknown one, which reveals which emails have accounts. | Give the same answer for both. |

## Tenancy and SaaS (`tenancy/`, `platform/`, `platform-billing/`, `academy-closure/`, prisma extensions)

No query leaks data between academies; raw SQL, context handling, the purge and the export are sound.

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| T1 | important ✓ re-checked (code path) | `platform/feature-gate.guard.ts:50`, `platform/entitlement.service.ts:95-97` | The global plan guard runs before `authenticateUser` sets the academy. When the host, Origin and Referer don't name an academy (a direct API call with a cookie and no Origin), `currentTenantId()` falls back to Nexa (Enterprise, ACTIVE). Every `@RequireFeature`, LOCKED and READ_ONLY check then passes for any academy. | When the context has no academy and a token is present, resolve the user's academy in the guard. Otherwise fail closed. Drop the DEFAULT fallback for requests. |
| T2 | important ✓ re-checked | `trash/trash.repository.ts:143-195` | A trash restore brings back users and batches without `assertSeatAvailable` or `assertCanCreateBatch`: trash 10 students, add 10, restore 10, and the plan's seat limit is beaten. | Call the assert inside the restore transaction. |
| T3 | important | `platform/feature-gate.guard.ts:15-28` | `/admin/academy/closure` and `/admin/academy/export` aren't always open, so a LOCKED academy (the usual case when leaving) can't export its data or ask to close. | Add `/admin/academy` to `ALWAYS_OPEN_PREFIXES` and update SAAS_PLANS.md. |
| T4 | minor | `platform/platform-subscriptions.service.ts:345-426` | The lapse sweep acts on the row it read at the start. A payment that lands in between is still marked PAST_DUE. | Re-read the row in `sweepOne`, or put the date in the claim's `where`. |
| T5 | minor | `platform-billing/platform-billing.service.ts:389-392` | Two checkouts settling at once both extend the period from the same `currentPeriodEnd`: paid twice, extended once. | Lock the subscription row before reading the period end. |
| T6 | minor | `platform/platform.service.ts:116-141` | The raw subscription edit writes `status` without `applySubscriptionTransition` (CLAUDE.md §3.6m). | Route status changes through the funnel. |

## Referrals, approvals, payroll (`referral/`, `approval/`, `payroll/`)

Points and money can't be double-credited, and the approval engine's claims are sound.

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| R1 | important ✓ re-checked | `approval/handlers/class-cancel.handler.ts:83` → `payroll/teaching-data-aggregation.service.ts:75-88` | An approved coach cancellation sets `cancelledById` to the approving admin, with the time of approval. Payroll then pays it under "admin cancelled" rules, for example 100% instead of the coach-cancel 0%. | Keep the requester as the canceller (the reviewer is already in the approval record). Measure notice from the request time. |
| R2 | important ✓ re-checked | `payroll/payroll-adjustment.service.ts:42-55,83-90` | The status check runs outside any lock, so an adjustment can land on a period that was just finalized and change its totals after the payslip was made. | Do the check, the insert and the recompute in one transaction with `FOR UPDATE`. |
| R3 | important | `payroll/payroll-period.service.ts:20-36` | Payroll periods may overlap (only the exact start/end/type is unique), so a class is paid in both, and TDS counts it twice. | Refuse a period that overlaps a non-cancelled one. |
| R4 | important | `referral/referral-vouchers.service.ts:324-456` | `planIds` and `codeValidDays` aren't snapshotted on a redemption waiting for approval. An edit to the voucher changes what the student gets. | Add both columns (additive migration) and use them in `fulfil`. |
| R5 | important (if stage values set) | `referral/referral.controller.ts:43-65`, `referral-tracker.service.ts` | Each cookie-less visit is a new LINK_VISITED referral, and a lead form with `referralCode` is a new DEMO_BOOKED referral with no self-check. Rewards on those stages can be farmed. | Don't pay on LINK_VISITED, hold first-stage rewards for approval, and refuse leads that match the referrer. |
| R6 | minor | `referral/referral.service.ts:240-251` | An admin who also teaches gets a referral code that never validates and earns nothing (active role vs stored role). | Use one role rule throughout. |
| R7 | minor | `payroll/payroll-calculation.service.ts:66-103` | Recalculating keeps the stale record of a coach who dropped out of scope. | Include or zero existing records. |
| R8 | minor | `payroll/payroll-adjustment.service.ts:37-55` | An admin who teaches can adjust and finalize their own payroll. | Refuse when `actorId === record.coachId`. |
| R9 | minor | `referral/referral-credits.service.ts:415-431` | A manual adjustment can put money on a student or points on a coach. | Require `wallet === referralWalletForRole(role)`. |
| R10 | minor | `approval/handlers/tournament-publish.handler.ts:142-143` | Bare `schema.parse` returns a 500 and skips the REVALIDATION_FAILED event (CLAUDE.md §3.2). | `safeParse`, then throw a ConflictException. |

## Live class (`live-class/`, LiveKit webhook, demo guests)

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| L1 | important ✓ re-checked | `live-class/live-class-recording.service.ts:90-109` | `startRecording` never reads the class's `recording` setting, so a coach can record even when the academy has locked recording off (students are minors). | Refuse with 403 when the snapshot says DISABLED, honouring locks. |
| L2 | important | `live-class/live-class-screen-share.service.ts:185-306` | A coach can approve or grant a student's screen share when an admin has locked it off: only the frozen value is checked, not `systemLocks`/`batchLocks`. | Check the locks from `resolveForClass` and refuse. |
| L3 | important | `live-class/live-class-screen-share.service.ts:81,103` | Widen and narrow change only the student's first connection (`find`). Revoke leaves a second tab sharing. | Loop over every identity of that student. |
| L4 | important | `live-class/live-class.service.ts:160-321`, `live-class-demo.service.ts:364-371` | If the settings snapshot fails at start (best-effort) or won't parse, students get the legacy wide-open grants and the waiting room is skipped, so every admin lock is ignored. | Fail closed: retry or refuse to start, and use default STUDENT grants for an unreadable snapshot. |
| L5 | important ✓ re-checked | `live-class/live-class-chat.service.ts:26-67` | The `student.chat` and `student.privateChat` settings aren't enforced on the server, so a locked-off chat still stores messages and shows them in history. | Refuse with 403 for STUDENT callers when disabled. |
| L6 | important (plausible) | `live-class/live-class-demo.service.ts:195-274` | In a demo class, an existing registration matched on an unverified phone or email skips the passcode or invite gate, under a name the caller chooses. The coach also can't remove a guest. | Still require the invite or passcode, use the registration's own name, and add guest removal. |
| L7 | minor ✓ re-checked | `live-class/live-class.service.ts:318`, `attendance/attendance-webhook.controller.ts:309` | `clientId=board` is accepted from anyone, and the webhook treats any `_board` identity as the coach's board. A student is then logged as the coach's board join and skips the removal check on join. | Allow `board` only for the coach, check `isCoach` in the webhook, and limit `clientId` to a safe pattern. |
| L8 | minor | `attendance/attendance-webhook.controller.ts:308,366-425` | An admin who joins visibly is recorded as a student. | Skip identities that aren't students. |
| L9 | minor | `live-class/live-class.service.ts:417-439` | A mid-class settings change drops an approved student's screen share without changing the request row. | Re-apply screen-share sources for APPROVED students. |
| L10 | minor ✓ re-checked | `live-class/live-class-chat.service.ts:122-133` | Chat history returns the *oldest* 500 messages (`asc` + `take: 500`), a silent cap (CLAUDE.md §3.5). | Order `desc`, take 500, then reverse, or page with a cursor. |

## Suggested order

1. **P1** (currency override): a buyer can pay less than the price today.
2. **P2–P3, P5–P9**: subscriptions, double charges, refunds.
3. **T1, T2**: plan enforcement bypasses.
4. **A1–A4**: account takeover paths and unreachable accounts.
5. **L1, L2, L4, L5**: admin locks that the live class ignores, for minors.
6. **R1–R3**: payroll correctness.

---

# Part 3 — learning, chat, uploads, tournament games

Read in full on `dev` at `80640fe`, by one reviewer in this session. Every finding was checked
against the code. Nothing was changed.

**Read in full:** `assignment/` (service, attempts, evaluation), `puzzle/puzzle-attempt.service.ts`
(save, submit), `course/` (student progress), `chat/`, `upload/`, `tournament/tournament-game.service.ts`,
`game-library/game-library.service.ts` (visibility), `stockfish/stockfish.controller.ts`, the
WhatsApp webhook entry (`support/whatsapp-webhook.*`), and `attendance/` corrections and the report
access checks.

**Checked and sound:** chat access (rebuilt from live rosters on every request; no student ↔
student DMs; history starts at enrolment), game-library visibility, attendance report and
correction permissions, puzzle attempts (wrong moves are counted on the server, submits are claimed),
tournament moves (the engine checks every move, claimed on `ply`, one lock order), and the WhatsApp
webhooks (signature checked before anything is stored; events filtered to the academy's own number).

**Still not reviewed line by line:** admin, analytics, batch, batch-schedule, demo-class, feedback,
knowledge, messaging, notification, progress, puzzle (outside attempts), puzzle-activity,
puzzle-rush, revision, student, student-match, simul, the rest of support and tournament
(registration, engine, runner, certificates), whatsapp.

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| S1 | **important** | `assignment/assignment.service.ts:999` (`toStudentItem`), `:714-726`, `course/course-progress.service.ts:200` (`toModuleSummary`) | A SOLVE_LINE assignment's `pgn` is built by `buildLinePgn(startFen, solution)`, so it contains **the whole solution line**. `toStudentItem` hides `solutionMoves` until the student completes it, but returns `pgn` and `pgnUrl` (a public Cloudinary file of the same PGN) in every student list and detail response. A course module returns the same `pgn`. Any student can read the answer before the first attempt. | For SOLVE_LINE, send students `positionPgn(startFen)` (and `pgnUrl: null`) until `revealSolution`. Do the same in the course module summary. Add a spec that a student's response never contains a solution move before completion. |
| S2 | **important** | `assignment/assignment-evaluation.service.ts:389-418` (`evaluateEngineGame`), called from `assignment-attempt.service.ts:185` (`submit`) | PLAY_VS_ENGINE is scored from the move list the client submits. The engine's moves in it are never checked against what the engine played, so a student can submit a line where "the engine" walks into mate and get WIN, 100%, passed. | Store the game on the server, as Playout does (`puzzle-activity/playout-game.service.ts`): the engine's reply is computed and saved by the server, and the student sends one move at a time, claimed on ply. |
| S3 | **important** | `assignment/assignment-attempt.service.ts:338-354` (`engineMove`) → `assignment-evaluation.service.ts:483` | `engineMove` takes **any FEN from the client** and returns Stockfish's best move at the assignment's level (coaches can set up to 20, full strength). The analysis endpoint refuses students (`stockfish.controller.ts` `ANALYSIS_ROLES`), but any student with an open PLAY_VS_ENGINE attempt has a best-move oracle for any position, including their own live tournament game. | Fixed by S2: the server plays the reply from its own stored position and never accepts a FEN. Until then, refuse a FEN that isn't the attempt's saved line replayed. |
| S4 | important | `assignment/assignment-attempt.service.ts:146-183` (`saveProgress`), `:185` (`submit`) | SOLVE_LINE: `saveProgress` says whether any line is correct, as often as the student likes, and nothing counts the wrong tries (puzzle attempts do: `wrongMoves`). The score comes only from the moves sent at submit. A student can try every legal move per ply, then submit the right line for 100% with no hints used. | Count a wrong line as a mistake on the attempt, as `PuzzleAttemptService.saveProgress` does, and score from the saved progress rather than the submitted list. Or move SOLVE_LINE onto `PuzzleAttemptService`. |
| S5 | important | `upload/upload.controller.ts:63-93` → `upload.service.ts:173` | An admin may delete **any** URL. `publicIdOf` takes the public id from the URL's path, whatever its host or folder, and destroys it in the one Cloudinary account all academies share. So any academy's ADMIN can delete Nexa's or another academy's avatars, logos, tournament banners and activity images by URL. | For everyone, admins too: require `isProfileImageUrl(url)` (it already checks host and the caller's academy folder). Admin bulk cleanup belongs to the trash purge, which deletes from stored rows. |
| S6 | minor | `course/course-progress.service.ts:157-200` (`completeModule`) | A student can mark any module complete, including a PUZZLE or ASSIGNMENT module never done, so course progress is self-declared. | For PUZZLE / ASSIGNMENT modules, complete only from a solved attempt or a completed assignment (the read path already checks puzzles). |
| S7 | minor | `tournament/tournament-game.service.ts:141-230` (`list`, `rounds`, `bracket`) | The spectator delay only applies in `toDto`. The summaries give spectators each game's `ply`, `result`, points and `finishedAt` live, so a delayed board can be read ahead of its delay. | Apply the same cutoff to summaries for non-live viewers (hide the result until `finishedAt` is older than the delay; show the delayed ply). |
| S8 | minor | `assignment/assignment.service.ts:467-486` (`undeploy`) | Withdrawing is a hard delete: every student's copy and attempt cascades away, and the puzzle attempts lose their link. Any co-coach of the batch can do it to a deployment another coach made. The UI warns ("Student progress will be lost") and defers it with undo, so this is by design, but it can't be recovered afterwards. | Consider a soft withdraw (hide the deployment, keep the rows), or allow only the coach who assigned it, or an admin. |
| S9 | minor | `chat/chat.service.ts:283-291` (`contacts`, admin branch) | `role: { in: [COACH, STUDENT] }` leaves out admins who also teach (`extraRoles`), so they can't be found as chat contacts. CLAUDE.md §3.2 says to use `coachWhere()`. | `OR: [coachWhere(), { role: STUDENT }]`. |
| S10 | minor | `chat/chat.service.ts:368-370` | A GROUP member who has left all of the coach's batches keeps reading and writing the group. Group chats are not re-checked against rosters the way DMs are. | Re-check that a STUDENT member still shares a batch with the group's owner, or remove them when they leave the last shared batch. |

## Suggested order (Part 3)

1. **S1** (the solution sent with the assignment) and **S3** (an engine for students): both are
   live now and easy to use.
2. **S5**: one academy can delete another's images.
3. **S2, S4**: assignment scores can be forged.
