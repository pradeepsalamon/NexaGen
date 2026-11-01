# Messaging rules & outbound WhatsApp

> Moved out of [CLAUDE.md](../CLAUDE.md) on 2026-10-17 to keep that file
> under the context limit; the text is unchanged. `§` numbers refer to
> CLAUDE.md, which keeps a short summary under the same number.

## 3.6d Outbound WhatsApp

`apps/api/src/whatsapp/` — `WhatsAppModule` exports `WhatsAppService` (Meta
Cloud API). Optional like the queues: unset `WHATSAPP_ACCESS_TOKEN` /
`WHATSAPP_PHONE_NUMBER_ID` ⇒ `isConfigured()` false and a send throws
`ServiceUnavailableException`. `sendText` only lands inside the 24h
customer-service window — outside it use `sendTemplate` with a template approved
in WhatsApp Manager. Numbers normalize to E.164 digits with no `+`
(`WHATSAPP_DEFAULT_COUNTRY_CODE` expands a national number); an unresolvable one
is a `BadRequestException` and no request goes out. **One network attempt per
call** — retries belong to a BullMQ job, which should branch on
`WhatsAppSendError.retryable`. `trySendText` / `trySendTemplate` / `sendTextToMany`
return outcomes instead of throwing, for paths that must survive WhatsApp being
down. Walkthrough below.

## 3.6e Admin messaging rules

`apps/api/src/messaging/` + `apps/web/src/features/messaging/`, page
`/admin/messaging`, routes `API_ROUTES.messaging.*` / `.announcements.*`. One
`MessagingRule` row per `MessagingEvent` (`CLASS_REMINDER` and
`CLASS_REMINDER_COACH` are the two sides of the same moment, each with its own
lead time, channels and copy, swept separately in `messaging.scheduler.ts`) holds enabled + per-channel
toggles (WhatsApp / in-app / email) + audience + lead time + `{{placeholder}}` templates.
**The catalogue, defaults and renderer live in `@nexa-chess/types`
(`messaging.ts`)** — `MESSAGING_EVENT_DEFINITIONS`, `DEFAULT_MESSAGING_RULES`,
`renderMessageTemplate`, `findUnknownTemplateVariables`, `sampleVariablesFor`;
use them, don't reimplement, or the admin preview stops matching the send.
`MESSAGE_VARIABLE_DOCS` gives every placeholder its label and example value for
the editors; a new placeholder needs an entry (a spec checks).

- **`MessagingDispatchService.dispatchInBackground(request)` is the only entry
  point** a feature service calls. It never throws — messaging must not fail
  class creation. Add a new trigger by extending `DispatchRequest` + its
  `resolveRecipients` branch, never by calling WhatsApp/Notification directly.
- **Dispatch queues; it does not send.** It writes PENDING `message_deliveries`
  rows (body/title/template params rendered *at queue time*) and
  `MessagingDeliveryWorker` (`@Cron(EVERY_MINUTE)`) delivers them: claim with
  `FOR UPDATE SKIP LOCKED` + `claimedAt`, send, then SENT / retry-with-backoff
  (`nextAttemptAt`, cap `MESSAGE_MAX_ATTEMPTS`) / FAILED. Only a `retryable`
  provider failure is retried. **The claim SQL binds `${iso}::timestamp`, never
  a `Date`** — these are `timestamp WITHOUT time zone` columns (§3.4).
- **Send timing is per recipient**: `computeScheduledFor` (messaging.schedule.ts)
  resolves a rule's DAILY/WEEKLY wall-clock time in the recipient's own
  `User.timezone`, DST-corrected. Lead-time events bypass it — `usesLeadTime`.
- `MessagingRuleService.getRule` seeds a missing row from the shared defaults, so
  no seed migration is needed. `NotificationType` (Prisma + zod) mirrors
  `MessagingEvent` — adding an event means adding to both enums.
- The outbox row is the *enqueue* dedupe guard: `dedupeKey` is unique per
  `(channel, key)`, so a repeated sweep collides on insert (P2002 → "already
  queued") instead of queueing twice. Provider sends are at-least-once — the
  worker sends, then marks SENT, so a crash between the two re-sends. The
  two lead-time crons in `messaging.scheduler.ts` also take job locks
  (§3.6b).
- `INVOICE_ISSUED` ships **enabled, in-app only**, and is the one event that can
  carry an attachment: `DispatchRequest` takes an optional `document`
  (`mediaId`/`link`/`filename`) which the CALLER resolves — dispatch persists it
  onto `message_deliveries` and the worker sends it as a WhatsApp document.
- `APPROVAL_REQUESTED` / `APPROVAL_DECIDED` ship **enabled, in-app only** (admin approvals, [PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md](PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md) §2.7). `ApprovalService` dispatches REQUESTED after a request commits — to every ACTIVE user in the action's catalogue `reviewerRoles`, never the requester (audience `ADMINS`, the only admin-side audience) — and DECIDED to the requester after an approval, rejection or expiry. Everything shown is read back from the request row.
- `ASSIGNMENT_OVERDUE_COACH` ships **enabled, in-app only**: the hourly
  `assignmentDueReminders` cron (same job lock as due-soon) finds deployments
  whose `dueDate` passed in the last 48h with someone unfinished and dispatches
  one notice per deployment to the coach who deployed it (falling back to the
  batch's current coaches). Dedupe key = deployment + due date + coach.
- `ASSIGNMENT_DUE_SOON` + `ASSIGNMENT_GRADED` ship **enabled, in-app only** —
  they absorbed the old unconditional notifications (`NotificationScheduler` is
  deleted; `assignment-attempt.service` now dispatches instead of notifying).
- Announcements (`apps/api/src/announcement/`) publish the feed row then fire the
  ANNOUNCEMENT rule; **the announcement's own audience picks recipients**, not
  the rule's. `student.service` filters the dashboard feed by that audience.

## Walkthrough: sending WhatsApp messages

`apps/api/src/whatsapp/` wraps the **WhatsApp Cloud API** (Meta Graph API) for
outbound messages. Import `WhatsAppModule` and inject `WhatsAppService`:

```ts
await this.whatsapp.sendText({ to: "+91 98765 43210", body: "Class starts in 15 minutes." });

await this.whatsapp.sendTemplate({
  to: student.phone,
  name: "class_reminder",       // approved in WhatsApp Manager
  language: "en_US",
  bodyParams: [student.name, "6:00 PM"]
});
```

Free-form text only reaches a user inside the 24-hour customer-service window;
outside it, WhatsApp accepts **approved templates only** and rejects text with
error code `131047`.

Numbers are normalized to E.164 digits without a `+` (the only form the API
accepts) before sending — `+91 98765-43210`, `00919876543210` and, with
`WHATSAPP_DEFAULT_COUNTRY_CODE=91`, `09876543210` all resolve to
`919876543210`. A number that cannot be resolved is a `BadRequestException`, and
no request is made.

Three rules the module holds to:

- **Optional, like the queues.** With `WHATSAPP_ACCESS_TOKEN` /
  `WHATSAPP_PHONE_NUMBER_ID` unset, `isConfigured()` is false and a send throws
  `ServiceUnavailableException` — check it before offering WhatsApp in a UI.
- **One attempt per call.** Retries belong to the caller so a request never
  blocks on provider backoff. Failures throw `WhatsAppSendError`, whose
  `failure.retryable` separates a rate limit or outage from a rejected payload;
  a BullMQ job can re-throw on the first and drop the second.
- **`trySendText` / `trySendTemplate` never throw**, returning a
  `{ ok, result | error }` outcome — use them where WhatsApp failing must not
  fail the request. `sendTextToMany` fans one message out, de-duplicates the
  recipients and reports per-recipient outcomes.

Env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (both from Meta →
WhatsApp → API Setup), plus the optional `WHATSAPP_API_BASE_URL`,
`WHATSAPP_API_VERSION`, `WHATSAPP_DEFAULT_COUNTRY_CODE` and
`WHATSAPP_TIMEOUT_MS`.

## Walkthrough: admin messaging rules

`/admin/messaging` is where an academy decides which moments send a message,
what each one says, and who receives it. One **rule per event** (`messaging_rules`,
one row each), edited by an admin, dispatched by the API.

Three crons drive it: the outbox worker every minute, the class-reminder sweep
every 5 minutes, and the assignment-due sweep hourly.

| Event | Queued by | Default (`DEFAULT_MESSAGING_RULES`) |
|---|---|---|
| New class scheduled | a coach creating a class | off |
| Before a class starts (students) | `MessagingScheduler`, on that rule's lead time | off |
| Before a class starts (coach) | `MessagingScheduler`, on its own lead time and wording | off |
| Class cancelled | a coach cancelling a class | off |
| New assignment | an assignment deployed to a batch | off |
| Assignment due soon | `MessagingScheduler`, on the rule's lead time | on, in-app only |
| Assignment submitted / graded | a student finishing an assignment | on, in-app only |
| Assignment overdue (coach) | the hourly due-reminder cron, once per overdue deployment | on, in-app only |
| Revision due | the hourly `revisionDueReminders` cron, at most once per student per send day, queued within an hour of the send time; skipped on a plan without `smartRevision` | off; in-app only, daily at 5pm in the student's own time zone |
| Announcement | an admin publishing one (Announcements tab) | off |
| Welcome message | not fired by self-registration any more — student and coach sign-ups both wait for approval | off |
| Account approved | an admin approving a pending student, or re-activating an account | off |
| Payment received / failed | `PaymentService` when an order is captured or fails | on, in-app only |
| Refund processed | `RefundService` when a refund completes | on, in-app only |
| Subscription renewal failed | `SubscriptionService` when a recurring charge fails | on, in-app only |
| Invoice issued | invoice generation after a capture (can carry the PDF) | on, in-app only |
| Payroll finalized / paid | an admin finalizing a payroll period / marking a payout paid | on, in-app only |

Each rule carries: a master on/off, per-channel toggles (**WhatsApp**, the
**in-app bell** and **email**), an audience, **when to send** (immediately, daily
at a time, or weekly on a day - or a lead time, for the two events that fire ahead
of a moment), the heading (in-app heading and email subject), and the message body. Bodies are `{{placeholder}}` templates —
the catalogue of what each event can bind lives in
`packages/types/src/messaging.ts` (`MESSAGING_EVENT_DEFINITIONS`), and the same
`renderMessageTemplate` runs in the admin preview and on the server, so what you
see is what gets sent. A placeholder the event cannot fill is flagged in the
editor and renders empty.

Things worth knowing before you touch it:

- **Defaults: WhatsApp is off everywhere; in-app is on for operational events.**
  The assignment due-soon / graded / overdue-coach, payment, refund,
  subscription-renewal, invoice and payroll events ship enabled, in-app only (see
  the table). Due-soon and graded absorbed the unconditional in-app notifications
  that used to live in `NotificationScheduler` and `assignment-attempt.service`,
  so disabling them would have silently removed a notification every academy
  already had. Class, new-assignment, announcement and account events ship off.
- **Dates render in each recipient's own `User.timezone`**, one render per
  person — the rare server-side format the date rule allows
  (`messaging.format.ts`).
- **Nothing is sent in-request.** Dispatch only *queues*: it writes PENDING
  `message_deliveries` rows and returns. `MessagingDeliveryWorker` (cron, every
  minute) claims the due ones and delivers them. So a trigger costs no provider
  round-trip, a crash before the send loses nothing (the row is committed), and
  an immediate rule lands within a minute. A crash *between* the provider send
  and the SENT update leaves a stale claim that is retried, so the recipient can
  get that message twice — delivery is at-least-once.
- **Failures retry themselves.** A retryable provider failure (rate limit,
  outage - `WhatsAppSendError.retryable`) stays PENDING with a later
  `scheduledFor`: 1m, 5m, 25m, 2h05m, then FAILED after 5 attempts. A rejected
  payload fails immediately, since it would fail identically forever. An admin
  can re-queue any failed message from the Delivery log.
- **The two sides of a class are separate rules.** Students and the coach get
  their own lead time, channels and copy (students 30 minutes before by default,
  the coach 60) — a coach reminder reads "you're taking X with Intermediate B",
  which is not a student's message with a different address. Each sweeps its own
  window every 5 minutes.
- **Send times are per recipient.** A "daily at 9am" rule reaches everyone at
  *their own* 9am (`computeScheduledFor` reads `User.timezone`), with DST and a
  weekdays-only option handled in `messaging.schedule.ts`.
- **Dispatch never fails its caller.** Feature services call
  `MessagingDispatchService.dispatchInBackground(...)`, which swallows and logs.
  A WhatsApp outage cannot fail class creation.
- **Every attempt is logged** to `message_deliveries` (Delivery log tab),
  including skips for a missing phone number and provider failures with Meta's
  own error text. Numbers are masked to the last 4 digits.
- **Enqueueing is deduplicated; delivery is at-least-once.** A `dedupeKey`
  unique per `(channel, key)` means a repeated sweep collides on insert rather
  than queueing a second row. That does not make the provider send idempotent:
  the worker sends first and marks SENT after, so a crash in between re-sends
  when the stale claim is reaped. The two lead-time crons
  take a job lock (`JobLockService`) first, and the outbox worker claims rows with
  `FOR UPDATE SKIP LOCKED` + a `claimedAt` stamp (stale claims reaped after 5
  minutes), so a second API container takes different rows instead of the same
  ones.
- **Outside WhatsApp's 24-hour window**, free-form text is rejected by Meta
  (error `131047`). A rule can name an approved template instead, with its
  positional values written as mini-templates.

## Email channel

Off on every rule until an admin turns it on (`emailEnabled`). It uses the same
outbox as the other channels: dispatch writes an `EMAIL` row, and the worker sends
it through `MailService.sendRuleEmail`.

- **The address isn't stored on the row.** The worker reads the account's email at
  send time, so a changed address is respected and a deleted account gets nothing.
  The log masks it (`a•••@example.com`).
- **Verified addresses only, once the academy asks for them.** With the policy at
  Admin → Email set to Off, everyone is mailed. Otherwise an unverified address
  gets a `SKIPPED` row.
- **`INVOICE_ISSUED` has no email channel** (`supportsEmail: false`): the invoice
  email is a system message, so a rule email would be a second copy.
- A 5xx from the mail server fails at once; anything else retries like WhatsApp.
  A sweep stops after 4 minutes, before its claims go stale, and later sweeps pick
  up what's left.
- Email has no unsubscribe link or per-person opt-out yet.
- A rule's test email only goes to the admin's own account.

## System messages

The fixed messages outside the rules can be reworded at `/admin/messaging` →
System messages: sign-in and account emails, the invoice email, demo-class emails
and WhatsApp texts, and the notices sent to `ADMIN_EMAILS`. Catalogue and defaults:
`@nexa-chess/types` `system-messages.ts`. Saved wording: `system_message_templates`.
No row means the default.

- **Send through `SystemMessageRenderer.render`, never hardcoded text.** A new fixed
  message needs a `SYSTEM_MESSAGE_DEFINITIONS` entry.
- **Admins change the words only**, not when a message goes out or who gets it.
- **The code adds an email's button and link** (`actionVariable`), so an edit can't
  lose a password-reset link. A WhatsApp text has no button, so it lists the link in
  `requiredVariables`, and the API refuses a body without it.
- Saving the default wording deletes the row.
- Direct email (`/admin/email`) is exempt, since staff write it themselves.

### Formatting and links

Rule, system-message, announcement and direct-email bodies are written in `TextEditor`
and stored as readable text (`**bold**`, `_italic_`, `- lists`, `[label](url)`), never
HTML. The parser is `@nexa-chess/types` `markdown.ts`; each channel converts from it:

| Channel | Through | Result |
|---|---|---|
| Email HTML | `mail/message-html.ts` `messageToEmailHtml` | Everything escaped; only `http(s)` links, underlined and coloured. A `/path` link shows as its label. |
| Email text part, logs | `markdownToPlainText` | `label (url)` |
| WhatsApp | `markdownToWhatsApp` | `*bold*`, `_italic_`, `label: url` |
| In-app, previews | `FormattedText` | React elements |

- **A stored body is source, not output.** Anything sending or showing one goes through a
  converter above.
- **Build a body with `renderFormattedTemplate`, not `renderMessageTemplate`.** It escapes
  each value, so a student named `[Pay here](https://…)` stays text. `FORMATTED_VARIABLES`
  lists the staff-written values that keep their formatting (only `announcement.body`).
  Subjects, titles and WhatsApp template parameters are never parsed, so they keep
  `renderMessageTemplate`.
- A bare `http(s)` address in a value still becomes a link, because that is how `links.*`
  values reach the reader.

Announcements (Announcements tab) write the dashboard feed row *and* fire the
ANNOUNCEMENT rule. The announcement's own audience decides who hears it —
everyone, students, coaches, or one batch — not the rule's, so a published
broadcast can't be silently narrowed by a settings change. The student dashboard
only shows announcements addressed to that student.
