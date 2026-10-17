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
down. See README § "WhatsApp Messaging".

## 3.6e Admin messaging rules

`apps/api/src/messaging/` + `apps/web/src/features/messaging/`, page
`/admin/messaging`, routes `API_ROUTES.messaging.*` / `.announcements.*`. One
`MessagingRule` row per `MessagingEvent` (10 events; `CLASS_REMINDER` and
`CLASS_REMINDER_COACH` are the two sides of the same moment, each with its own
lead time, channels and copy, swept separately in `messaging.scheduler.ts`) holds enabled + per-channel
toggles (WhatsApp / in-app) + audience + lead time + `{{placeholder}}` templates.
**The catalogue, defaults and renderer live in `@nexa-chess/types`
(`messaging.ts`)** — `MESSAGING_EVENT_DEFINITIONS`, `DEFAULT_MESSAGING_RULES`,
`renderMessageTemplate`, `findUnknownTemplateVariables`, `sampleVariablesFor`;
use them, don't reimplement, or the admin preview stops matching the send.

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
- The outbox row IS the idempotency guard: `dedupeKey` is unique per
  `(channel, key)` and the row is written before any send, so a repeated sweep
  collides on insert (P2002 → "already queued") instead of racing a send. The
  two lead-time crons in `messaging.scheduler.ts` also take job locks
  (§3.6b).
- `INVOICE_ISSUED` ships **enabled, in-app only**, and is the one event that can
  carry an attachment: `DispatchRequest` takes an optional `document`
  (`mediaId`/`link`/`filename`) which the CALLER resolves — dispatch persists it
  onto `message_deliveries` and the worker sends it as a WhatsApp document.
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
