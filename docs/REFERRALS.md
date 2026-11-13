# Referral programme

Students, coaches and **SALES** accounts each get a referral link (`/r/<CODE>`).
Every person who opens it is tracked through an admin-editable pipeline (visited
→ demo booked → demo attended → onboarded / not joined, plus any stages an admin
adds). Each stage carries admin-set **values**: a student referrer earns
**points**, a coach or SALES referrer earns **money**, and the new member gets
welcome points. **Milestone bonuses** add to that. Students spend points in the
**rewards store** on admin-made vouchers — a percentage or fixed discount (with
a cap and a minimum fee) or free days of access. Coaches and SALES withdraw
money. Points never move between users and never become money. Plan feature:
`referralProgram` (Growth and up).

| Where | What |
|---|---|
| `apps/api/src/referral/` | `ReferralTrackerService` (visits, lead hooks, landing benefits), `ReferralPipelineService` (the one place a stage changes, reaches, rewards), `ReferralCreditsService` (ledger, locks, rewards, withdrawals), `ReferralVouchersService` (vouchers, the store, redemptions), `ReferralSettingsService` (per-academy settings, codes), `ReferralService` (referrer board), `ReferralAdminService` |
| `packages/types/src/referrals.ts` | Contract and pure rules (`canAutoAdvanceReferral`, `referralStagesReached`, `referrerStageReward`, `referralWalletForRole`, `referralBonusAudienceTarget`, `referralMilestonesReached`, `referralVoucherProblem`, `formatReferralVoucherValue`, `maskProspectName`, `canHoldReferralLink`), `DEFAULT_REFERRAL_STAGES` |
| `apps/web/src/features/referrals/` | Referrer board (`ReferralBoardClient` — `/student/referrals`, `/coach/referrals`, `/sales`; `RewardsStore` for students), admin board (`components/admin/`, `/admin/referrals`), the `/r/[code]` landing |

## How a referral moves

1. **Visit.** `/r/<code>` (web) posts `POST /referrals/visit`. The API finds or
   creates one `Referral` per (code, browser visitor cookie) at the
   `LINK_VISITED` stage, logs a `ReferralVisit`, and sets the httpOnly
   `nexa_referral` cookie (lifetime = `attributionDays`). The page also keeps
   the code in `localStorage` and sends it with the demo form as a fallback.
   The owner opening their own link counts nothing; a paused/unknown code just
   answers `valid: false`.
2. **Demo booked.** `LeadService.createLead` hands the cookie / code to
   `ReferralTrackerService.attachLead`: the referral gets the lead and moves to
   `DEMO_BOOKED`. A browser that books a second lead starts a second referral.
3. **Lead CRM and demo classes mirror in.** `LeadService.updateStatus`
   (DEMO_SCHEDULED → booked, DEMO_ATTENDED → attended, CONVERTED/ACTIVE_STUDENT
   → onboarded, LOST → not joined), `DemoInviteService.bookLead` (booked) and a
   guest joining the demo (`LiveClassDemoService`, attended).
4. **Admins move anything** from the pipeline tab (forward or back, with a note),
   see every referrer's referrals (Referrers → "View referrals" filters the
   pipeline), and can delete a referral (spam, duplicate) unless it earned
   rewards that are not cancelled.

Rules that must not break:

- **Automatic moves only go forward and never leave CONVERTED/LOST**
  (`canAutoAdvanceReferral`). Admin moves ignore it.
- **Every move goes through `ReferralPipelineService`**: a status-filtered
  `updateMany` claim, a `ReferralStageEvent`, the stages reached, then rewards.
- **Reaching a stage reaches every earlier non-LOST stage** (`referralStagesReached`,
  stored in `ReferralStageReach`). Rewards and milestone counts read reaches,
  never the current stage, so a jump straight to "Onboarded" still pays the
  "Demo attended" rule.
- Tracking never throws into the lead form, the demo join or a CRM change.

## Stages

`referral_stages`, admin-edited in the Stages tab. Each automatic trigger
(`LINK_VISITED`, `DEMO_BOOKED`, `DEMO_ATTENDED`, `CONVERTED`, `LOST`) names at
most one stage (partial unique index) and can be renamed/recoloured/reordered
but not deleted. `MANUAL` stages are added freely; deleting one moves its
referrals to the stage before it (with a history note) and is refused while a
bonus rule uses it. If the table is ever empty (a test reset) the defaults are
re-seeded from `DEFAULT_REFERRAL_STAGES`.

## Earning

### Stage values

Each `ReferralStage` holds what **one referral reaching it** earns
(`studentPoints`, `coachCashMinor`, `salesCashMinor`, `newMemberPoints`), edited
in the Stages tab. `referrerStageReward(stage, role)` is the one rule: a STUDENT
referrer gets points, a COACH or SALES referrer gets money (minor units). The
new member gets `newMemberPoints` once their account is linked. Editing a value
changes only rewards earned afterwards.

Rewards are `ReferralReward` rows with `stageId` (and `ruleId` null), dedupe key
`stage:<stageId>:ref:<referralId>:referrer` / `…:referred`, inserted with
`skipDuplicates`, so back-and-forth moves and racing events never pay twice.
Settings `autoApprovePoints` (default on) and `autoApproveCash` (default off)
decide whether a stage reward is credited at once or waits in the Rewards tab.

### Milestone bonuses

`ReferralRewardRule` rows with `kind: MILESTONE`, `beneficiary: REFERRER`: every
`everyCount` of a referrer's referrals reaching a stage (counted from
`ReferralStageReach`) pays `amount`, dedupe key `rule:<id>:user:<id>:n:<k>`. The
admin picks an **audience** (`referralBonusAudienceTarget`): `STUDENTS` →
roles `[STUDENT]` + points; `COACHES` / `SALES` / `STAFF` → those roles + money.
A rule in any other shape (pre-rebuild) is not listed and never pays. Each bonus
has its own `autoApprove`. A bonus that has paid is switched off instead of
deleted.

Pending rewards wait in the Rewards tab; approving credits the ledger,
cancelling a credited reward writes a reversal (a balance can go negative).

### The new member's account (`Referral.referredUserId`)

New-member points need an account. `ReferralTrackerService.linkSignup` runs on
student and coach sign-up: the `nexa_referral` cookie from a link visit, else a
referral whose lead used the same email. Admins can link/unlink by email in the
referral dialog (`PUT /admin/referrals/:id/referred-user`).
`ReferralPipelineService.linkReferredUser` is the one link path: one referral
per account (unique), never the referrer's own account, unlinking refused once
points were given; linking grants the points of every stage already reached
(`grantReferredBenefits`, idempotent by dedupe key). The `/r/<code>` landing
page lists them (`ReferralVisitResponse.benefits`: stages with
`newMemberPoints > 0`).

## Wallets

`ReferralCreditEntry` is an **append-only ledger** with a `wallet` column:
`POINTS` (students and new members) and `CASH` (coaches and SALES). A wallet's
balance is the sum of its entries. Every debit takes
`pg_advisory_xact_lock(hashtext('referral-credits:<userId>'))`, re-reads the
balance and writes the entry in the same transaction. `referralWalletForRole`
decides which wallet a role earns into; the summary shows students no money and
withdrawals refuse students outright.

- **Nothing moves between users** and **points never become money** — there is
  no route for either.
- **Withdraw** (COACH/SALES in `withdrawalRoles`; minimum `minWithdrawalMinor`):
  the amount is held at once (`WITHDRAWAL` entry). An admin pays outside the
  app and marks it paid with a reference, or rejects (money returned). The
  referrer can cancel while it is `REQUESTED`.
- **Paying in bulk**: Withdrawals tab → **Export CSV**
  (`GET /admin/referrals/withdrawals/export`) downloads every withdrawal in the
  current search and status filter, oldest first (up to 10,000): name, email,
  role, amount, payout details, status, reference, id. Marking each one paid is
  still a separate step.
- **History**: `GET /referrals/me/credits` is the user's points/money history;
  the admin History tab (`GET /admin/referrals/ledger`, filter by wallet, type,
  user) lists every movement of every user; admins adjust either wallet.

Financial rows (`ReferralReward`, `ReferralCreditEntry`, `ReferralWithdrawal`,
`ReferralRedemption`, legacy transfers/conversions, personal discounts)
reference users with `onDelete: Restrict` and are in
`TrashRepository.findUserIdsWithRetainedHistory`. They are never soft-deleted.

### Points expiry

Off by default. `ReferralSettings.pointsExpiryDays` (Settings tab; 30–3650, empty
= never) removes unspent points that many days after they were earned.

- **One rule: `referralPointsExpired`** (`@nexa-chess/types`). Spending uses the
  oldest points first, so everything ever taken out counts against the credits
  older than the cutoff; what is left of those expires. Points returned by a
  rejected or cancelled voucher count as earned on the day they came back.
- `ReferralPointsExpiryScheduler` runs nightly (21:20 UTC) under the
  `referrals.points-expiry` job lock, once per academy:
  `ReferralCreditsService.expirePoints` writes one `EXPIRY` debit per user under
  that user's lock. Running it again takes nothing more. Money never expires.
- Turning expiry on removes points already older than the window at the next
  run (the Settings hint says so). The student's board shows the points that
  will expire within 30 days (`MyReferralSummary.points.expiringSoon`).

## Notifications

Three messaging rules (`/admin/messaging`), on by default and in-app only; an
admin can add email or WhatsApp and reword them ([MESSAGING.md](MESSAGING.md)):

| Event | Sent to | When |
|---|---|---|
| `REFERRAL_PROGRESS` | the referrer | their referral changed stage (automatic or by an admin); a first link visit sends nothing |
| `REFERRAL_REWARD` | whoever was credited (referrer, or the new member for welcome points) | points or money reached the ledger: at once when auto-approved, else when an admin approves |
| `REFERRAL_REQUEST_DECIDED` | the student / the coach or SALES account | a voucher request was approved or declined; a withdrawal was paid or declined |

- Dispatched **after the transaction commits** (`ReferralPipelineService.announce`,
  `ReferralAdminService`), and everything shown is read back from the row, so a
  reward that is not `CREDITED` sends nothing.
- The prospect's name is masked for students and coaches (`maskProspectName`),
  full for SALES, as on their boards. Never a contact detail.
- Not announced: points expiring, a reward cancelled, an admin adjustment, a
  voucher revoked.

## Vouchers

`ReferralVoucher` (Vouchers tab): name, description, `pointsCost`, a type —

| Type | Value | Extras |
|---|---|---|
| `PERCENT_DISCOUNT` | `percentOff` (1–100) | `maxDiscountMinor` cap, `minOrderMinor` minimum fee, `codeValidDays` |
| `FIXED_DISCOUNT` | `amountOffMinor` | `minOrderMinor` (≥ the amount off), `codeValidDays` |
| `FREE_DAYS` | `freeDays` (7 = a week, 30 = a month) | — |

— plus `planIds` (discounts: plans the code works on; free days: plans whose
access it extends; empty = any), `stock` (everyone), `perUserLimit`,
`startsAt`/`endsAt`, `requiresApproval`, `isActive`, `sortOrder`.
`referralVoucherProblem` is the one shape rule (web form, Zod schema, update
path). A voucher someone redeemed is switched off instead of deleted.

**Redeeming** (`POST /referrals/me/vouchers/:id/redeem`, students only, while
`redemptionsEnabled`): `ReferralVouchersService.redeem` takes the voucher's
lock (`referral-voucher:<id>`) then the user's lock, re-checks the window,
stock, per-student limit, the academy's `maxRedemptionsPer30Days` and the
points balance, writes a `ReferralRedemption` (the voucher's terms
**snapshotted**) and a `REDEMPTION` debit. Stock and limits count `PENDING` +
`FULFILLED` redemptions.

- No approval: fulfilled in the same transaction (a failure spends nothing).
- `requiresApproval`: `PENDING` with the points held. An admin approves
  (fulfils) or rejects (`REDEMPTION_REVERSAL`); the student can cancel while
  pending (same reversal).
- **Fulfilment**: a discount becomes a one-use personal `Discount`
  (`DiscountService.createPersonalVoucherCode`, `RWD…`, `restrictedToUserId`,
  cap, minimum fee, plans, expiry) — discounts stay the only thing that changes
  a price ([PAYMENTS.md](PAYMENTS.md)). Free days call
  `EntitlementService.grantFreeDays`: extend the student's live time-limited
  access to the plan by N days from its end date, or (none) grant N days from
  now and enrol in the plan's batch; refused when they hold unlimited access.
  The plan is the one the student picked, else their only matching live plan,
  else the voucher's only plan.
- **Revoke** (admin): an unused code on no open order is switched off and the
  points returned (`REVOKED`). Free days already given cannot be revoked here.

## What changed in the rebuild (2026-11-07)

Migration `…_referral_points_vouchers` moved active per-referral rules into the
stage values (summed per party), switched off every rule that is not a
student-points or staff-money milestone, removed STUDENT from
`withdrawalRoles`, and switched off point transfers, conversion and paying fees
with points (those settings columns stay; nothing reads them). Their routes are
gone. Old ledger rows (`PAYMENT_CODE`, `POINTS_TRANSFER_*`, `CONVERSION_*`) and
rewards (including `DISCOUNT_PERCENT` welcome codes) stay readable; a pending
legacy discount reward can still be approved or cancelled. A student's
pre-rebuild CASH balance stays in the ledger (admins see it in History and can
adjust it).

## The SALES role

`UserRole.SALES` exists only for referrals. **Only admins create sales
accounts** (public sign-up makes students, the coach form makes coaches): from
Users, or Referrals → Referrers → "New sales account", which creates the
account with a throwaway password and sends its sign-in link straight away.
"Send sign-in link" (Referrers row, SALES only) emails and/or WhatsApps a
one-use set-password link (`ReferralAccessService`: an ordinary
`PasswordResetToken`, 24 h instead of 30 min, `/reset-password`), using the
`ACCOUNT_ACCESS` system message on the channels the admin picks; the admin
never sees the password. A phone number given for WhatsApp is saved on the
account. **`authenticateUser` refuses SALES (403) unless the caller passes
`{ allowSales: true }`**, which only these do: the referral board, `/auth/*` and
MFA, `GET /subscription`, the user's own typography/board-appearance
preferences, and the privacy export. A new service that should serve SALES must
opt in the same way. On the web, `routeAccess.ts` sends SALES to `/sales` and
lets it open only `/sales` and `/profile`. SALES sees its own prospects' full
name and contact (to follow up); students and coaches see "Priya S." and no
contact.

## Privacy and retention

- `referral_visits` is a log table: `RETENTION_RULES` keeps 365 days (visit
  counts age out with it; referrals and their history stay).
- The data export includes the user's code, their referrals' progress (not the
  prospect's name or visitor id), rewards, both wallets, withdrawals, voucher
  redemptions, legacy points sent/received (amount and note only — not the
  other person) and conversions, and the id of the referral that brought them
  in (not who referred them).

## Tests

- `referral-rules.spec.ts`: the pure rules (pipeline, stage rewards by role,
  bonus audiences, voucher shapes and wording) and that the migration seeds
  `DEFAULT_REFERRAL_STAGES`.
- `referral.int-spec.ts` (real Postgres): visit → lead → CRM → admin move →
  stage values and bonuses (students points only, no double pay, approval
  switch); vouchers end to end (percent code owner-only with cap, per-student
  limit, approval/cancel/reject, stock, free days create then extend access,
  revoke, store closed, 30-day cap, parallel redemptions never overspend,
  history); new-member welcome points and coach money; parallel withdrawals;
  the SALES fence; stage edits.
- `cross-user-access.int-spec.ts`: cancelling another user's withdrawal or
  voucher redemption is a 404.
