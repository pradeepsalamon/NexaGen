# Lead stages and the Frappe CRM pipeline

Status: **Phase 1 built 2026-11-21** (+ the daily waiting-for-a-time staff alert) (branch `feat/lead-stage-sync`): stages, automatic
moves, missed-demo job, stage copy to Frappe (off by default). Phase 2 (reminders with
confirm/reschedule buttons, missed-demo message, "waiting for a demo time" alert, Enrolled
on payment) is planned below and needs the WhatsApp bot to receive the number's messages.

## Stages

`LeadStatus` (Prisma) = `leadStatusSchema` (`@nexa-chess/types` `leads.ts`). Frappe names in
`FRAPPE_LEAD_STAGES` (`lead/frappe-crm-push.service.ts`).

| NexaGen | Label | Frappe stage | Set |
|---|---|---|---|
| `NEW` | New | Demo Requested | lead created (website form, WhatsApp bot) |
| `CONTACTED`, `INTERESTED` | | Contacted, Interested | by hand |
| `DEMO_SCHEDULED` | Demo booked | Demo Booked | booked into a demo class (bot or admin) |
| `DEMO_CONFIRMED` | Demo confirmed | Demo Confirmed | Phase 2: the parent taps "Yes, I'll attend" |
| `DEMO_ATTENDED` | Demo attended | Demo Attended | the guest joined the live demo |
| `NO_SHOW` | Missed demo | Missed Demo | the demo was held (`COMPLETED`) and the guest never joined |
| `FOLLOW_UP`, `PAYMENT_PENDING` | | Follow Up, Payment Pending | by hand |
| `CONVERTED`, `ACTIVE_STUDENT` | | Enrolled | by hand (Phase 2: on payment) |
| `LOST` | | Lost | by hand |

## Rules

- **`nextLeadStatus(current, event)`** is the one rule for automatic moves: forward only,
  never out of Converted / Active student / Lost, never back from Demo attended / Follow up /
  Payment pending (a second demo keeps the further stage). Exception: a missed demo can be
  booked again, and a re-booking needs a new confirmation.
- Automatic moves go through **`LeadStageService.apply`** (status-filtered claim, timeline
  activity, referral progress, Frappe copy). A person's change (`LeadService.updateStatus`)
  sets any stage and is copied too.
- **Waiting for a demo time** (`LeadAwaitingDemoService`, daily 10:15 IST,
  `JOB_LOCKS.leadAwaitingDemo`): one `LEADS_AWAITING_DEMO_ADMIN` message to admins listing
  leads of the last 30 days (older than 2 h) with no demo class in New / Contacted /
  Interested, plus every Missed demo; nothing when the list is empty. Up to 20 lines.
- **Missed demo** (`LeadDemoMissedService`, every 10 min, `JOB_LOCKS.leadDemoMissed`): only
  classes that ended in the last 7 days; a class that was never held changes nothing.

## Frappe copy

- One `CrmLeadPush` row per lead (outbox). `sentStatus` = the stage last copied. A stage
  change sets the row back to `PENDING`; the sweep reads Frappe's current stage and writes
  the new one only when **`frappeStageMayMove`** allows: forward only; a stage a salesperson
  closed (Enrolled, Lost, Junk, …) or one the list doesn't know stays; Enrolled/Lost always
  pass from an open stage. Changes made in Frappe never come back (one way).
- **`FRAPPE_CRM_STAGE_SYNC`** (default `false`): off = the old behaviour (first copy only, in
  `FRAPPE_CRM_LEAD_STATUS`). Before switching it on, every name in `FRAPPE_LEAD_STAGES` must
  exist as a `CRM Lead Status` in Frappe, or Frappe refuses new leads.
- A NexaGen manual move backwards is not copied (Frappe keeps the further stage).

## Phase 2 plan (owner decisions 2026-11-21)

- **Reminders** the evening before and 1 hour before, with [Yes, I'll attend] [Reschedule].
  Free inside the parent's 24-hour window, otherwise a utility template (~₹0.12, approved by
  the owner). "Yes" → `DEMO_CONFIRMED`; "Reschedule" → the bot's demo-time list.
- **Missed demo**: the bot offers new times (same window/template rule).
- **Enrolled automatically** on a captured payment or a student account for the lead.
- **Tidy Frappe's stage list** to the names above (create the missing ones, move leads from
  the old duplicates), then switch on `FRAPPE_CRM_STAGE_SYNC`.
- Test on staging first; the number moves to the NexaGen bot only after that (owner).
