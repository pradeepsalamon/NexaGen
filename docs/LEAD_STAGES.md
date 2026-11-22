# Lead stages and the Frappe CRM pipeline

Status: **built 2026-11-21**: stages, automatic moves, missed-demo job, daily waiting-for-a-time
alert, WhatsApp reminders with confirm/reschedule, stage copy to Frappe (off by default; on
for staging). Also built: leads linked to the account they register and enrolled on approval/payment.
Still open: Meta approving the templates, moving the number to the bot (owner: later). (branch `feat/lead-stage-sync`): stages, automatic
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

## Registration and enrolment (built 2026-11-21)

Owner 2026-11-21: no "create student" action; a lead follows the normal registration flow.
`LeadAccountsService` (every 10 min, `JOB_LOCKS.leadAccounts`):

- **Link**: a student account registered in the last 2 days with no lead gets the newest
  lead of the 90 days before it, not Lost and not linked yet, with the same email (any case),
  else the same mobile (last ten digits of the account's number or the parent's phone).
  `Lead.userId` is set by a claim; the lead moves to Payment pending (`REGISTERED`).
- **Enrol**: a linked lead whose account is approved (ACTIVE) or has a PAID order →
  Converted (`ENROLLED`; Frappe "Enrolled").
- Only a CRM stage: nothing about the lead is shown to the account. Referral rewards are not
  triggered by these moves (the referral keeps its own sign-up/payment rules).

## WhatsApp reminders (built 2026-11-21)

`support/support-demo-reminders.service.ts` (every 5 min, `JOB_LOCKS.demoReminders`), for a lead's
phone booking in a scheduled demo class, only for numbers the bot answers and never after STOP:

| Message | When | Buttons |
|---|---|---|
| Evening before | from 19:00 local the day before (4 h window); booking made before then; class > 3 h away; lead still Demo booked | Yes, I'll attend · Reschedule |
| 1 hour before | 60 to 10 min before, with the personal join link | the same, unless already confirmed |
| Missed demo | within 24 h after a held demo the lead missed (`NO_SHOW`) | Pick a new time |

- Each is claimed once on the registration (`eveningReminderAt`, `hourReminderAt`,
  `missedMessageAt`) before sending: never twice, also when skipped.
- **Inside the parent's 24-hour window** it is a free bot message in their conversation (outbox).
  **Outside it** only with an approved template: `SUPPORT_DEMO_REMINDER_TEMPLATE` /
  `SUPPORT_DEMO_MISSED_TEMPLATE` (language `SUPPORT_DEMO_TEMPLATE_LANGUAGE`, default `en_US`);
  unset = skipped. The buttons' payloads are `demo.attend.<registrationId>` /
  `demo.move.<registrationId>`.
- **Taps** (`transitionSupport` + `SupportConversationService`): the booking must be this
  number's (same last ten digits) and not over (to reschedule: or a demo the lead missed in
  the last 7 days); anything else is ignored (an old Reschedule starts a fresh booking).
  "Yes" → `DEMO_CONFIRMED` (recorded even while staff own the chat). "Reschedule" reopens the
  demo times with the child's details filled in (not the same class); the new booking replaces
  the old registration if the guest never joined it.

**Templates** (created by the owner 2026-11-21, pending Meta approval; staging has
`SUPPORT_DEMO_REMINDER_TEMPLATE=demo_reminder`, `SUPPORT_DEMO_MISSED_TEMPLATE=demo_missed`):
body {{1}} parent, {{2}} student, {{3}} time. `demo_reminder` (Utility) has quick replies
"Yes, I'll attend", "Reschedule" and a URL button "Join demo" `https://nexachess.in/demo/{{1}}`;
`demo_missed` (Meta classed it **Marketing**, ~₹0.80 a send) has "Book another time". The send
builds its buttons from the template's own (`demoTemplateButtons`: quick replies take the
payloads in order, a `{{1}}` URL takes `<classId>?invite=<token>`) and skips a template that
isn't APPROVED in the account's list.

## Still to do (owner decisions 2026-11-21)

- **Tidy Frappe's stage list** to the names above (create the missing ones, move leads from
  the old duplicates), then switch on `FRAPPE_CRM_STAGE_SYNC`.
- Test on staging first; the number moves to the NexaGen bot only after that (owner).
