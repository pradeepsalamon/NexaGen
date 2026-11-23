# Lead stages and the Frappe CRM pipeline

Status: **built 2026-11-21**: stages, automatic moves, missed-demo job, daily waiting-for-a-time
alert, WhatsApp reminders with confirm/reschedule, stage copy to Frappe (off by default; on
for staging). Also built: leads linked to the account they register and enrolled on approval/payment.
Still open: Meta approving the templates, moving the number to the bot (owner: later). (branch `feat/lead-stage-sync`): stages, automatic
moves, missed-demo job, stage copy to Frappe (off by default). Phase 2 (reminders with
confirm/reschedule buttons, missed-demo message, "waiting for a demo time" alert, Enrolled
on payment) is planned below and needs the WhatsApp bot to receive the number's messages.

## One pipeline: who writes what (2026-11-22)

NexaGen is the lead's record; Frappe (crm.nexachess.in) is the sales desk. Both show the same
stage names and, once the return path is on, the same stage for each lead.

| What | Written by | Copied |
|---|---|---|
| The lead (parent, phone, email, child, source, campaign) | NexaGen: website demo form, WhatsApp capture, the bot's booking, an admin | NexaGen → Frappe only (`CrmLeadPush`); edits in Frappe stay there |
| Automatic stages (demo booked / attended / missed, enrolled) | NexaGen (`LeadStageService.apply`) | → Frappe, forward only (`frappeStageMayMove`) |
| A person's stage change | either side; **the latest wins** | Leads page → Frappe as before; Frappe → NexaGen by the return path |
| Owner, notes, calls, tasks | Frappe | not copied |
| Ad click (`LeadAdClick`), registration, payment | NexaGen | ad name in the Frappe note only |
| Ad conversions (Meta) | NexaGen's outbox (`MetaCapiEvent`) | → Meta ([AD_MEASUREMENT.md](AD_MEASUREMENT.md)); Frappe sends nothing |

Existing Frappe-only leads and old Frappe stage names are left as they are (owner 2026-11-22):
no import, no clean-up; the return path ignores names it doesn't know.

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
  pass from an open stage. A stage a salesperson sets in Frappe comes back through the return
  path below (off by default).
- **`FRAPPE_CRM_STAGE_SYNC`** (default `false`): off = the old behaviour (first copy only, in
  `FRAPPE_CRM_LEAD_STATUS`). Before switching it on, every name in `FRAPPE_LEAD_STAGES` must
  exist as a `CRM Lead Status` in Frappe, or Frappe refuses new leads.
- A NexaGen manual move backwards is not copied (Frappe keeps the further stage).

## The return path (Frappe → NexaGen, built 2026-11-22)

`FrappeCrmStageReturnService` (`lead/frappe-crm-stage-return.service.ts`, every 15 min,
`JOB_LOCKS.crmStageReturn`, Nexa's academy only). Off unless **`FRAPPE_CRM_STAGE_RETURN=true`**
*and* `FRAPPE_CRM_STAGE_SYNC=true` (same stage names on both sides) *and* the push is configured.

- Reads Frappe's stage for every copied lead (`CrmLeadPush` with `externalId`, status `SENT` or
  `FAILED`) touched in the last 180 days, 50 per request (`name in [...]`), 0.5 s apart, at most
  2,000 per run; the next run carries on after the last one read and wraps round, so every lead
  is read in turn. A `PENDING` row is skipped: a NexaGen change is on its way and Frappe's older
  stage must not undo it. Won leads (Converted / Active student) are never read.
- **`stageFromFrappe`** is the one rule: the Frappe name maps back through
  `LEAD_STATUS_FROM_FRAPPE` (built from `FRAPPE_LEAD_STAGES`; Enrolled → `CONVERTED`); unknown
  names (New, New Inquiry, Offer Sent, Junk…) are ignored; it is a person's change only when it
  differs from the stage NexaGen last copied (`sentStatus`, else the lead's own stage); a won lead
  never moves (not even to Lost).
- Applied like a change on the Leads page: status-filtered claim on the lead **and** on the push
  row (`sentStatus` + not `PENDING`), timeline entry "Changed in Frappe: X → Y", `convertedAt` on
  Enrolled, referral progress (`ReferralTrackerService.onLeadStatus`). Then `sentStatus` = the new
  stage, so the push never sends it back (no loop). Either claim lost = nothing changes; the next
  run looks again.
- Latest change wins: a stage set on the Leads page is copied to Frappe as before, and a
  later Frappe change comes back. When the push refused to overwrite a salesperson's further stage
  (`frappeStageMayMove`), the next return run brings that stage into NexaGen, so both sides agree.
- Lead details (name, phone, child) still flow one way, NexaGen → Frappe.

## WhatsApp lead capture (built 2026-11-22)

`support/support-lead-capture.service.ts`, run by the WhatsApp webhook for every customer message
of **Nexa's academy** when capture is on: **Admin → Support → Settings → "Make every new chat a
lead"** (`SupportSettings.captureLeads`; before the page is first saved, `SUPPORT_CAPTURE_LEADS`).
Default off. It works with the bot on or off and **sends nothing**: with the bot off, a message is
stored only for capture (no transcript, no reply, no inbox).

- **Which chats become leads:** a number that is not an account (any user's `phoneNumber`, or a
  student's `parentPhone`; last ten digits) and has no open lead (created in the last 90 days, not
  Lost / Converted / Active student). A Lost-only number gets a new lead.
- **The lead:** source `WhatsApp ad` when the message carried Meta's Click-to-WhatsApp `referral`,
  else `WhatsApp` (`WHATSAPP_LEAD_SOURCE(S)` in `@nexa-chess/types` `leads.ts`); campaign = the ad's
  headline (else its id); parent = the WhatsApp profile name; the required child fields get
  **`LEAD_DETAILS_NOT_GIVEN`** (`studentName ""`, `studentAge 0`, `experienceLevel "not_given"`),
  shown as "—" on the Leads page and **never sent to Frappe** (`student_name` left out; the note says
  "Student: not given yet"). The bot's later demo booking fills them in (`upsertFromWhatsApp`),
  which sets `CrmLeadPush.detailsPending` (`markDetailsChanged`): the next send sets the Frappe
  lead's `student_name` and adds a "Child details (NexaGen)" note (review Part 1 #1).
  Copied to Frappe like the bot's leads (`CrmLeadPush`, Frappe source `FRAPPE_CRM_LEAD_SOURCE`).
- **Ad clicks:** `LeadAdClick`, one row per lead, keeping the first click and the latest (ad id,
  `ctwa_clid`, headline, source URL, when), plus a timeline entry per click, keyed on the message
  (`LeadActivity.sourceKey` `wa-ad:<message id>`), so a message processed again never counts twice
  (review Part 1 #2). A number with an open
  lead (a website lead too) gets the click attached, never a second lead. Read by the Conversions
  API (docs/AD_MEASUREMENT.md). Removed with its lead.
- **Once per message:** one transaction under a per-number xact lock (`lead-capture:<academy>:<last
  ten digits>`), so two first messages make one lead; a re-run of the same message changes nothing
  (event dedupe + `LeadAdClick.latestMessageId`). A capture failure fails the webhook event (retried
  by the sweep) but never stops the bot's answer.
- **STOP / START** from a number the bot isn't answering are still recorded on its
  `WhatsAppContact` (`recordOptCommand`, the bot's own words), so proactive WhatsApp stops; nothing
  is sent back.
- The parser reads `messages[].referral`; the WhatsApp Business app's coexistence fields
  (`smb_message_echoes`, `smb_app_state_sync`, `history`) are skipped.
- Support Insights' "New leads" still counts demo bookings only (child details given).

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

## Where things stand (2026-11-22)

Built and on `dev` + staging (not `main`): stages and automatic moves, missed-demo job, daily
waiting-for-a-time alert, WhatsApp reminders with confirm/reschedule, registration → enrolment
linking, stage copy to Frappe (on for staging only), Messaging → WhatsApp templates tab and
template picker.

Open, in order:

1. **WhatsApp Business account blocked for business-initiated messages** (Meta error 141006,
   payment method). Blocks templates and reminders outside the 24-hour window. Owner fixes the
   card in WhatsApp Manager → Payment settings; business verification also pending (250
   new conversations a day until then).
2. **Click-to-WhatsApp ads**: the old campaign's ad fails with Meta error 2446955 "Missing
   WhatsApp number" (made before the number was re-registered on the Cloud API); its
   destination must be re-picked in Ads Manager. Ad account spending limit and prepaid balance
   are nearly used up. Details (IDs, timeline) are in the maintainer's private notes, not here
   (public repository).
3. **Templates** `demo_reminder` / `demo_missed` pending Meta approval.
4. **Frappe "New Lead Welcome"** sends a paid marketing template to every new CRM lead
   (including test leads) once billing works: owner to decide whether to keep it.
5. **Staging can't list WhatsApp templates**: needs `WHATSAPP_ACCESS_TOKEN` +
   `WHATSAPP_BUSINESS_ACCOUNT_ID` in its `apps/api/.env` (no phone number id = read-only).
6. **Moving the WhatsApp number from Frappe to NexaGen** (owner: after the release), then
   switching on, in order: `FRAPPE_CRM_STAGE_SYNC` (production; Frappe's stage names exist on
   crm.nexachess.in), `FRAPPE_CRM_STAGE_RETURN`, lead capture (bot stays off), the Conversions API
   with a test event code, the Conversions API live, then the pixel. Owner checklist in
   [BACKLOG.md](BACKLOG.md) § "Questions for the owner", 2026-11-22 night run.

