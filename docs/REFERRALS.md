# Referral programme

Students, coaches and **SALES** accounts each get a referral link (`/r/<CODE>`).
Every person who opens it is tracked through an admin-editable pipeline (visited
→ demo booked → demo attended → onboarded / not joined, plus any stages an admin
adds). Admin-defined reward rules turn progress into **credits**, which a
referrer can withdraw as money or turn into a personal discount code to pay
fees. Plan feature: `referralProgram` (Growth and up).

| Where | What |
|---|---|
| `apps/api/src/referral/` | `ReferralTrackerService` (visits, lead hooks), `ReferralPipelineService` (the one place a stage changes, reaches, rewards), `ReferralCreditsService` (ledger, withdrawals, payment codes), `ReferralSettingsService` (singleton settings, codes), `ReferralService` (referrer board), `ReferralAdminService` |
| `packages/types/src/referrals.ts` | Contract, pure rules (`canAutoAdvanceReferral`, `referralStagesReached`, `referralMilestonesReached`, `maskProspectName`, `canHoldReferralLink`), `DEFAULT_REFERRAL_STAGES` |
| `apps/web/src/features/referrals/` | Referrer board (`ReferralBoardClient`, used by `/student/referrals`, `/coach/referrals`, `/sales`), admin board (`components/admin/`, `/admin/referrals`), the `/r/[code]` landing |

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
reward rule uses it. If the table is ever empty (a test reset) the defaults are
re-seeded from `DEFAULT_REFERRAL_STAGES`.

## Rewards

`ReferralRewardRule`: a stage, `PER_REFERRAL` or `MILESTONE` (every N referrals
reaching the stage), an amount in **integer minor units**, the roles it applies
to (empty = all), and `autoApprove`. A `ReferralReward` has a unique
`dedupeKey` (`rule:<id>:ref:<id>` / `rule:<id>:user:<id>:n:<k>`), inserted with
`skipDuplicates`, so back-and-forth moves and racing events never pay twice.
Pending rewards wait in the Rewards tab; approving credits the ledger,
cancelling a credited reward writes a reversal (a balance can go negative).
Editing a rule changes only rewards earned afterwards; a rule that has paid is
switched off instead of deleted.

Each rule also has a **unit** and a **beneficiary**:

| | `REFERRER` (who shared the link) | `REFERRED` (the new member) |
|---|---|---|
| `CASH` (minor units) | yes | yes |
| `POINTS` (whole points) | yes | yes |
| `DISCOUNT_PERCENT` (whole %, optional cap `maxDiscountMinor`, expiry `discountValidDays`) | no | yes |

`amountMinor` holds the value in the unit. A `REFERRED` rule is always
`PER_REFERRAL`; `referralRewardRuleProblem` (`@nexa-chess/types`) is the one
shape rule (web form, Zod schema, update path). `roles` is always the role of
the person who shared the link — also for `REFERRED` rules ("benefits for
people a coach referred"). A `REFERRED` reward's `referrerId` column holds the
**recipient** (the new member). A credited discount reward issues a one-use
`PERCENTAGE` personal `Discount` (`DiscountService.createPersonalPercentCode`,
`ReferralReward.discountId`); cancelling it switches the code off, and is
refused once the code was used or is on an open order.

### The new member's account (`Referral.referredUserId`)

`REFERRED` rewards need an account. `ReferralTrackerService.linkSignup` runs
on student and coach sign-up: the `nexa_referral` cookie from a link visit,
else a referral whose lead used the same email. Admins can link/unlink by
email in the referral dialog (`PUT /admin/referrals/:id/referred-user`).
`ReferralPipelineService.linkReferredUser` is the one link path: one referral
per account (unique), never the referrer's own account, unlinking refused once
benefits were given; linking grants the benefits of every stage already
reached (`grantReferredBenefits`, dedupe keys make it idempotent). The
`/r/<code>` landing page lists the benefits (`ReferralVisitResponse.benefits`).

## Wallets: money and points

`ReferralCreditEntry` is an **append-only ledger** with a `wallet` column:
`CASH` (money, minor units) and `POINTS` (whole points). Each wallet's balance
is the sum of its entries. Every debit takes
`pg_advisory_xact_lock(hashtext('referral-credits:<userId>'))`, re-reads the
balance and writes the entry in the same transaction (a transfer locks both
users, in id order).

- **Money is never transferable** — there is no route that moves CASH between
  users. Only withdrawals, payment codes, conversions-in and admin adjustments.
- **Send points** (`POST /referrals/me/points/transfer`, by the recipient's
  account email): settings `pointsTransferEnabled`, `pointsTransferRoles`
  (sender and recipient), `minTransferPoints`, `maxTransferPointsPerDay`
  (rolling 24 h per sender, 0 = none). Writes a `ReferralPointsTransfer` and a
  `POINTS_TRANSFER_OUT` / `POINTS_TRANSFER_IN` pair.
- **Convert points → money** (`POST /referrals/me/points/convert`), **one way
  only**: `conversionPoints` points = `conversionValueMinor`, rounded down
  (`referralPointsValueMinor`). `pointsConversionEnabled`,
  `pointsConversionRoles`, `minConversionPoints`. The rate is snapshotted on
  `ReferralPointsConversion`; `CONVERSION_OUT` (points) + `CONVERSION_IN` (money).
- **Pay fees with points** (`pointsPaymentEnabled`, roles `paymentUseRoles`):
  the payment-code route takes `{ wallet, amount }`; points become a FIXED
  code worth their converted value. Cancelling returns the cost to the wallet
  that paid.
- The admin **Wallets** tab (`GET /admin/referrals/ledger`) lists every
  movement of every user; admins adjust either wallet.

- **Withdraw** (roles in `withdrawalRoles`, default coach + sales; minimum
  `minWithdrawalMinor`): the amount is held immediately (`WITHDRAWAL` entry).
  Admin pays outside the app and marks it paid with a reference, or rejects
  (credits returned). The referrer can cancel while it is `REQUESTED`.
- **Pay fees** (roles in `paymentUseRoles`, default students): credits become a
  single-use FIXED `Discount` with `restrictedToUserId` (`DiscountService.createPersonalCode`).
  Discounts stay the only thing that changes a price (docs/PAYMENTS.md);
  `DiscountService.resolve` treats someone else's personal code as not found,
  and the admin discount list/editor hides them. An unused code can be
  cancelled for its credits back, unless an open (CREATED/PENDING) order uses it.
  A code worth more than the fee makes it free; the remainder is not kept.

Financial rows (`ReferralReward`, `ReferralCreditEntry`, `ReferralWithdrawal`,
`ReferralPointsTransfer`, `ReferralPointsConversion`, personal discounts) reference users with `onDelete: Restrict` and are in
`TrashRepository.findUserIdsWithRetainedHistory`. They are never soft-deleted.

## The SALES role

`UserRole.SALES` exists only for referrals. **Only admins create sales
accounts** (public sign-up makes students, the coach form makes coaches): from
Users, or Referrals → Referrers → "New sales account", which creates the
account with a throwaway password and sends its sign-in link straight away.
"Send sign-in link" (Referrers row, SALES only) emails and/or WhatsApps a
one-use set-password link (`ReferralAccessService`: an ordinary
`PasswordResetToken`, 24 h instead of 30 min, `/reset-password`), using the
`ACCOUNT_ACCESS_EMAIL` / `ACCOUNT_ACCESS_WHATSAPP` system messages; the admin
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
  prospect's name or visitor id), rewards, both wallets, withdrawals, points
  sent/received (amount and note only — not the other person) and conversions,
  and the id of the referral that brought them in (not who referred them).

## Tests

- `referral-rules.spec.ts`: the pure rules and that the migration seeds
  `DEFAULT_REFERRAL_STAGES`.
- `referral.int-spec.ts` (real Postgres): visit → lead → CRM → admin move →
  rewards (per referral, role-scoped, milestone, no double pay), payment code
  owner-only + cancel, parallel withdrawals, the SALES fence, stage edits; new
  member benefits (landing list, sign-up auto-link, welcome discount), points
  send limits, one-way conversion, paying with points, parallel transfers, the
  admin ledger.
- `cross-user-access.int-spec.ts`: cancelling another user's withdrawal or
  payment code is a 404.
