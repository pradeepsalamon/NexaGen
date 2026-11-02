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
4. **Admins move anything** from the pipeline tab (forward or back, with a note).

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

## Credits wallet

`ReferralCreditEntry` is an **append-only ledger**; the balance is its sum.
Every debit takes `pg_advisory_xact_lock(hashtext('referral-credits:<userId>'))`,
re-reads the balance and writes the entry in the same transaction.

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
personal discounts) reference users with `onDelete: Restrict` and are in
`TrashRepository.findUserIdsWithRetainedHistory`. They are never soft-deleted.

## The SALES role

`UserRole.SALES` exists only for referrals. Admins create sales accounts from
Users. **`authenticateUser` refuses SALES (403) unless the caller passes
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
  prospect's name or visitor id), rewards, credits and withdrawals.

## Tests

- `referral-rules.spec.ts`: the pure rules and that the migration seeds
  `DEFAULT_REFERRAL_STAGES`.
- `referral.int-spec.ts` (real Postgres): visit → lead → CRM → admin move →
  rewards (per referral, role-scoped, milestone, no double pay), payment code
  owner-only + cancel, parallel withdrawals, the SALES fence, stage edits.
- `cross-user-access.int-spec.ts`: cancelling another user's withdrawal or
  payment code is a 404.
