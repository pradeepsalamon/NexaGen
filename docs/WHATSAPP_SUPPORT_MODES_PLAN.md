# WhatsApp engine and support modes: audit and plan

Status: **proposal for owner review (2026-11-14). Phase B is built** on
`feat/whatsapp-multi-academy` (as built: [WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) §0
"Per academy"); the rest is a plan. It
extends [WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md). That doc's §0 (as built)
still describes the running code. This plan replaces its §10 Phases 3–4 and
adds three things: academy-level support modes (Native / External helpdesk /
Hybrid), conversation ownership, and multi-academy inbound. Outbound rules
stay in [MESSAGING.md](MESSAGING.md). Per-academy credentials stay in
[SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) §F.

Legend: ✅ verified in the repo or in official docs (source in §13) ·
❓ unverified or assumed · 🆕 proposed.

Contents: 0 decisions · 1 recommendation in brief · 2 current state ·
3 gaps and risks · 4 architecture · 5 ownership model · 6 WhatsApp lifecycle ·
7 support modes · 8 provider assessment · 9 data model · 10 failure, security,
tenancy · 11 admin experience · 12 phases · 13 external facts checked.

---

## 0. Decisions needed (in the order they block work)

**Answered 2026-11-14 (owner):** D3 (a): each academy uses its own Meta app.
D6: Nexa `Lead` is the record, **plus a one-way push to Frappe CRM** (Phase C,
Nexa's own academy). D12: set hours per academy. D13: accept images and PDFs.
The G1 fix (§3) was approved and is done. Everything else is still open.

**Progress (2026-11-14, branch `feat/whatsapp-native-complete`):** Phase B
(every academy's own number) and, from Phase C: hours + away message,
delivery status on rule messages, real demo slots, contact export/erase,
template status, images/PDFs (D13), the Frappe push (D6). As built:
[WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) §0. Phase C items still to come are
marked in §12.

| # | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| D1 | **What to build now** | (a) Native first: External/Hybrid get only the extension points (ownership fields, provider interface); the Crisp adapter waits for an academy that needs it. (b) Build Native + Crisp together | **(a).** No academy has asked for a helpdesk yet ❓. Several Crisp behaviours need a test account before the adapter can be designed (§8.2) | Phase E |
| D2 | **Switch on what exists first** | Turn on the built Phase 1–2 bot for Nexa's own number before Phase B, or build more first | **Switch on first.** Real messages show which flows matter. Prerequisites are in [WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) §0 "Before switching it on" (staging test number, app secret, verify token) | Everything after A |
| D3 | **How other academies connect a number** | (a) Each academy creates its **own Meta app** and pastes its token, app secret and verify token; Nexa gives it a webhook URL per academy. (b) Nexa becomes a **Meta Tech Provider** with Embedded Signup: one Nexa app, one-click onboarding, all webhooks signed with Nexa's app secret, and the WhatsApp Business **app** (coexistence) can be onboarded | **(a) now** (no Meta review needed; the same pattern as `TenantPaymentCredential.webhookKey`). **Apply for (b) in parallel** if SaaS sales need self-serve onboarding: it needs Business Verification + App Review for advanced `whatsapp_business_messaging` / `whatsapp_business_management`, and should target Embedded Signup v4 (v2 deprecated 2026-10-15) | Phase B |
| D4 | **Who owns WhatsApp when an academy uses an external helpdesk** | Arrangement 2 (Nexa owns the number and routes to the helpdesk) / Arrangement 1 (the helpdesk owns the number; Nexa listens) / both | **Arrangement 2 is the default and the first one built.** All automation and business data are in Nexa. Arrangement 1 comes later as "listen + capture leads", with no Nexa replies on WhatsApp (§7.2) | Phase E/F |
| D5 | **How configurable flows are** | (a) Fixed, tested flows in code with per-academy settings: menu items on/off, order, labels, the destination for each intent, saved answers, hours. (b) A visual flow builder | **(a).** `transitionSupport` stays pure and unit-tested. A flow builder is a product of its own and makes "deterministic business actions" hard to guarantee | Phase C |
| D6 | **Which CRM leads go to** | Nexa `Lead` only / also a one-way push to Frappe CRM (`crm.nexachess.in`, chosen 2026-10-25 as the sales CRM) | **Nexa `Lead` is the record** (demo booking needs it: `DemoInviteService.bookLead`). A Frappe push is an optional later add-on for Nexa's own academy only. Owner to confirm, since Frappe was meant to be the sales source of truth | Phase C |
| D7 | **Who works the inbox** | Admins only (today) / a new `SUPPORT` role / coaches for their own batches | **Admins only until an academy asks.** A new role touches `authenticateUser`, `ROUTE_RULES`, the access suites and every admin screen | Phase C |
| D8 | **Existing-student identity** | In-app link code only ([WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) §9) / also match the phone number against `parentPhone` | **Link code only.** `parentPhone` is typed-in contact data, not proof ([PARENT_REPORTS.md](PARENT_REPORTS.md)) | Phase D |
| D9 | **AI** | Keywords + saved answers only (today) / AI that suggests the intent, never acts / AI-written replies | **Keywords now; AI suggest-only later.** The on-box model is too slow (p95 ≈ 7 min). An off-box provider would receive messages from minors' families, which needs a privacy sign-off (open item 12). Meta now allows only business-function bots, not general-purpose assistants | Phase G |
| D10 | **Proactive messages when a helpdesk owns the number (Arrangement 1)** | Off for that academy / sent as templates through the provider's API | **Off.** Email and in-app keep working; nothing competes with the helpdesk on that number | Phase F |
| D11 | **How Crisp events reach Nexa** | Crisp Marketplace plugin (signed `X-Crisp-Signature`, retried) / Website Hooks (unsigned, not retried) with a secret in the URL | **Marketplace plugin.** Unsigned, unretried hooks are not acceptable for ownership changes | Phase E |
| D12 | **Support hours** | 24/7 / set hours per academy, with an out-of-hours reply and reminders held until opening time | **Set hours per academy** (the old open item 8). Reminders currently fire at night | Phase C |
| D13 | **Incoming images and PDFs** | Text only (today) / accept images + PDF into the inbox | **Accept them in Phase C.** Parents send payment screenshots. Store them like other private uploads, delete them with the transcript, and never let the bot read them | Phase C |
| D14 | **Plan gating** | Which plans include `whatsappSupport` (and later `helpdeskIntegrations`) | Owner decides prices. Technically each becomes a catalogued feature required by its routes (SaaS rule) | Phase B |

Still open from [WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) §12: item 2 (which
number Nexa uses; is it on the WhatsApp Business app today), item 7 (refund
policy text, SLAs), and the DPDP legal review.

---

## 1. Recommendation in brief

1. **No new service and no rename.** The `support/` module already is the
   communication engine: webhook in, conversation state, pure flow, outbox,
   tickets, inbox. Grow it along four internal boundaries (§4): channel
   transport → engine → business actions → destinations.
2. **Two levels of ownership, stored explicitly.** Per academy, *which
   system owns the WhatsApp number*. Per conversation, *who may send the next
   reply* (bot, Nexa staff or an external helpdesk). The outbox checks the
   conversation's owner when it sends, not only when the reply is decided (§5).
3. **Routing picks the human destination; business actions always run in
   Nexa.** Leads, demo bookings and student facts come from Nexa services in
   every mode. An academy's routing table only decides where a conversation
   goes when a person is needed (§7.3).
4. **Native first**, then multi-academy inbound, then configurable menus and
   routing, then account linking. External helpdesks come after a Crisp test
   account confirms the behaviours in §8.2. AI comes last.

---

## 2. Current-state audit

### 2.1 Exists and is reusable ✅

| Capability | Where | State |
|---|---|---|
| Outbound WhatsApp (text, template, interactive buttons/list, document, media upload; `retryable` errors) | `apps/api/src/whatsapp/whatsapp.service.ts` | Built; prod sends announcement messages |
| Per-academy outbound credentials (encrypted token + phone number id, reloaded every 60 s on every process) | `whatsapp-credentials.service.ts`, `whatsapp-settings.controller.ts`, model `WhatsAppSettings`, `/admin/branding` | Built (SaaS 5d, on dev). **Outbound only**: no app secret, verify token or WABA id |
| Inbound webhook: HMAC check, store before 200, dedupe on `dedupeKey`, `claimedAt` lease, minute sweep, park after 5 failures | `support/whatsapp-webhook.{controller,service,parse}.ts`, `WhatsAppWebhookEvent` | Built, **Nexa's env number only** (other numbers are dropped) |
| Contacts, consent (`STOP`/`START`, `optedOutAt` checked at send time by rules and system messages) | `WhatsAppContact`, `whatsapp-opt-out.service.ts` | Built |
| Conversation state + a pure flow engine (menu, forms, back/cancel/menu, idle prompt, expiry, redaction, invalid-reply handling) | `packages/types/src/support-flows.ts` `transitionSupport`; `support-conversation.service.ts` (one transaction, per-contact xact lock) | Built; flows and the menu are hard-coded, `SupportCategory` is an enum |
| **Ownership, first version**: `SupportConversation.status` `BOT` / `WAITING_AGENT` / `AGENT` / `CLOSED`. The bot is silent outside `BOT`; "Take over" and "Return to bot" are recorded as events | `support-admin.service.ts`, `SupportTicketEvent` | Built, Nexa-only (no external owner) |
| Transcript + outbox (PENDING rows written in the deciding transaction, `clientKey`, backoff 1/5/15 min, oldest-first per conversation) | `SupportMessage`, `support-outbox.service.ts` | Built |
| Tickets (references, dedupe per contact+category+7 days, assignee, notes, status, audit events) and the inbox UI | `SupportTicket`, `/admin/support`, `features/support/` | Built (admins only, polling) |
| Saved answers (bot quotes them exactly, staff insert them), "Did you mean …?", unanswered questions | `SupportSavedReply`, `SupportUnansweredQuestion` | Built |
| Lead capture from WhatsApp, deduped per number for 90 days | `LeadService.upsertFromWhatsApp` | Built |
| Staff reminders, one parent nudge inside the 24 h window | `support-follow-up.service.ts` | Built |
| Proactive messaging (rules, system messages, templates, outbox worker) | `messaging/`, `MessagingDispatchService`, `SystemNotifier` | Built; the only entry for non-support sends |
| Real demo slots and booking | `DemoSchedule` (recurring slots → demo `CoachClass` rows), `DemoInviteService.bookLead` (registration + lead → `DEMO_SCHEDULED`) | Built. **The bot doesn't use it yet**: it collects a free-text preferred time |
| Tenancy plumbing: `runInTenant`, `asPlatform`, `requireTenantId`, `tenantId` on every support table, per-academy webhook key pattern | `tenancy/`, `TenantPaymentCredential.webhookKey` | Built (SaaS phases on dev) |
| Plan gating (`FeatureGateGuard`, `@RequireFeature`, 402) | `platform/` | Built; no `whatsappSupport` key |
| Knowledge base with role-based reading rules and AI tool wrappers | `knowledge/`, `knowledge.tools.ts` | Built; audiences are STUDENT/COACH/ADMIN, **nothing public**, so it can't answer parents yet |
| AI runtime | `ai/` + `services/ai-runtime/` | **Mock only**, off by default |
| Job locks, retention rules, encrypted secrets helper | `JobLockService`, `RETENTION_RULES`, `mfa-crypto` | Built |

### 2.2 Partial

- **Multi-academy WhatsApp:** outbound works per academy; inbound doesn't
  (signature uses Nexa's app secret; events not on the env number are dropped).
- **Existing-student journey:** designed (link code, §9 of the support doc),
  not built. No account-aware answers.
- **Fees/payments:** saved answers can quote fees; payment complaints become a
  `PAYMENT`/`REFUND` ticket. No link to `Payment` rows (by design: staff link,
  never the bot).
- **Templates:** names are typed into rules/system messages; Meta's approval
  status isn't read anywhere.
- **Delivery status:** reaches `SupportMessage` only, not `message_deliveries`.

### 2.3 Does not exist

Support-mode settings; per-academy menu/routing/hours; any helpdesk provider
integration; external conversation ids; ownership acknowledgement; incoming
media; contact erasure/export; template sync; support analytics (volume,
time to first reply, handoff rate); a health view for the integration.

---

## 3. Gaps and risks

| # | Gap or risk | Severity | Fix in |
|---|---|---|---|
| G1 | ~~The outbox doesn't check ownership when it sends.~~ **Fixed 2026-11-14:** `SupportOutboxService.sendPending` drops a bot reply (`FAILED`, "Not sent: staff took over…") when the conversation is `AGENT`, or when a staff reply or `TAKEN_OVER` event came after it was written. This happens even while the reply waits for a retry, so a pending bot retry no longer holds back the staff reply behind it. Spec: `support-outbox.service.spec.ts` | Done (Phase C's `SKIPPED` status and owner field still to come) | — |
| G2 | ~~Inbound is single-number, single-secret.~~ **Fixed in Phase B** | — | — |
| G3 | ~~`phoneNumberId` not unique.~~ **Fixed in Phase B** (unique index + 409, Nexa's env number refused) | — | — |
| G4 | ~~Bot settings are server env.~~ **Fixed in Phase B** (`SupportSettings`; env = Nexa's defaults until saved; session timeout stays server-wide) | — | — |
| G5 | Staging shares production's WhatsApp number and token (checked by hash 2026-11-14) | High: dev could answer real customers | Phase A (owner) |
| G6 | ~~No out-of-hours behaviour.~~ **Fixed in Phase C** (team hours, away message, reminders wait) | — | — |
| G7 | ~~Contacts can't be exported or erased.~~ **Fixed in Phase C** (staff export + super-admin erase, STOP kept, erasure log) | — | — |
| G8 | Demo booking takes a free-text time instead of a real slot | Product | Phase C |
| G9 | An external helpdesk and Nexa both replying on one number (if both have a token or a bot) | High in External/Hybrid | §5 rules + D4, D10 |
| G10 | Meta policy: general-purpose AI assistants are barred from the Business Solution since 2026-01-15. A support bot is allowed, but an open-ended "ask anything" bot is a risk | Medium | D9 |
| G11 | Coexistence (WhatsApp Business app + API on one number) needs Tech Provider/Solution Partner onboarding via Embedded Signup and caps throughput at 20 messages/s. Not possible under D3(a) | Medium | D3 |
| G12 | The 2-core box: the bot is light, AI is not; a helpdesk mirror adds outbound HTTP per message | Low | Phase E design (async sync jobs) |

---

## 4. Recommended architecture

All of this stays inside the NestJS API and Postgres. Redis/BullMQ stays
optional: every queue in this design is a row with a status, worked by a cron
under a job lock, as today.

```
                 ┌──────────────── Channel transport (per academy) ───────────────┐
 Meta Cloud API ─┤ WhatsAppWebhook  (verify, tenant from webhook key / number id, │
                 │                   store + dedupe, lease)                       │
                 │ WhatsAppService  (send text / interactive / template / media)  │
 Crisp (later) ──┤ HelpdeskWebhook  (signed provider events, store + dedupe)      │
                 └───────────────┬────────────────────────────────▲───────────────┘
                                 │ normalized InboundMessage       │ ChannelTransport.send
                                 ▼                                 │
 ┌──────────────────────── Engine (support/) ──────────────────────┴───────────────┐
 │ ConversationService  load contact + conversation under the contact lock         │
 │ OwnershipGate        who may answer? (pure: decideOwner / mayReply)             │
 │ transitionSupport    pure flow → replies[] + actions[]  (academy settings in ctx)│
 │ resolveSupportRoute  pure: intent + settings + hours → destination              │
 │ ActionRunner         runs actions inside the same transaction / after commit    │
 │ Outbox               PENDING rows, send-time ownership check, retries           │
 └───────┬───────────────────────────────┬────────────────────────────┬────────────┘
         ▼                               ▼                            ▼
 Business services (Nexa owns)   Destinations                  Proactive (unchanged)
 LeadService, DemoInviteService  NativeInbox (tickets, today)  MessagingDispatchService
 SavedReplies, linked student    HelpdeskProvider (interface)  SystemNotifier
 info (Phase D), Knowledge later   └ CrispProvider (Phase E)   (opt-out at send time)
```

Boundary rules:

- **The transport knows nothing about flows.** It turns a provider payload into
  `InboundMessage { tenantId, channel, contactKey, providerMessageId, text?,
  replyId?, media?, occurredAt }` and sends a `SupportReply`. Adding a channel
  means a new transport, not a change to flows.
- **Flows know nothing about Meta or Crisp.** `transitionSupport` already
  returns abstract replies and actions. Academy settings (menu, labels, hours)
  join its `ctx`; it stays pure and spec-tested.
- **Business facts only come from Nexa services**, through actions the
  engine runs (`CREATE_LEAD`, `BOOK_DEMO_SLOT`, `OPEN_TICKET`,
  `HANDOFF(destination)`, `LOOKUP_NEXT_CLASS` for linked users only). The bot
  never states availability, payment state or student data it didn't just read.
- **Destinations implement one interface** (`HelpdeskProvider`, §8.3). The
  existing ticket inbox is the native one.
- **Proactive messages stay in `messaging/`.** The engine never sends
  reminders or campaigns. It only replies in conversations and sends the
  single nudge, which falls inside the 24 h window.

---

## 5. Ownership model

### 5.1 Two levels

**Academy level: transport owner** (🆕 `WhatsAppSettings.transportOwner`):

| Value | Meaning | Nexa may send on this number |
|---|---|---|
| `NEXA` | The number is registered with Nexa's app (env for Nexa, academy credentials otherwise) | Yes: bot, staff, proactive rules |
| `EXTERNAL` | The number is registered with a helpdesk (Arrangement 1) | **Never.** Every WhatsApp send for this academy is refused before the network call; proactive WhatsApp is off (D10) |
| `NONE` | Not connected | No |

**Conversation level: owner** (🆕 replaces the meaning of today's `status`;
today's values map 1:1):

| Owner state | Today | Who may send the next message | Bot |
|---|---|---|---|
| `BOT` | `BOT` | Nexa automation only | Active |
| `NEXA_QUEUE` | `WAITING_AGENT` | Nexa staff (first reply claims it) | Silent, except `MENU`, `STOP`/`START`, and the out-of-hours notice |
| `NEXA_AGENT` | `AGENT` | The assigned Nexa staff member (others can take it over, recorded) | Silent |
| `EXTERNAL_PENDING` 🆕 | — | **Nobody.** Customer messages are stored and forwarded; nothing is sent. Times out to the fallback (§5.4) | Silent |
| `EXTERNAL` 🆕 | — | Only replies coming from the helpdesk connection the conversation is linked to | Silent |
| `CLOSED` | `CLOSED` | — (the next inbound opens a new conversation) | — |

### 5.2 Transitions (all through one function, each writing a `SupportConversationEvent`)

| From → to | Trigger | Recorded |
|---|---|---|
| `BOT` → `NEXA_QUEUE` / `EXTERNAL_PENDING` | Flow emits `HANDOFF` (form sent, "agent", 3 bad replies); the destination comes from `resolveSupportRoute` | reason, intent, destination, ticket |
| `EXTERNAL_PENDING` → `EXTERNAL` | Provider confirms (conversation created + first sync succeeded) | external conversation id, ack time |
| `EXTERNAL_PENDING` → `NEXA_QUEUE` | No ack after N retries / provider disabled → **fallback destination** | error, attempts |
| `NEXA_QUEUE` → `NEXA_AGENT` | Staff reply or "Take over" | actor |
| `NEXA_*` / `EXTERNAL` → `BOT` | Staff "Return to bot"; helpdesk marks resolved *and* the academy enabled "return to bot on resolve"; customer types `MENU` while queued (today's rule) | actor / provider event |
| any → `CLOSED` | Last ticket resolved; bot idle 24 h (only from `BOT`) | actor |
| `EXTERNAL` → `NEXA_AGENT` | Nexa staff take over from Nexa's inbox (allowed only if the academy allows it; the helpdesk conversation is marked resolved with a note) | actor |

A conversation in `NEXA_*` or `EXTERNAL*` never auto-expires (as today).

### 5.3 Rules that keep two systems from talking at once

1. **Send-time check (fixes G1).** The outbox claim includes ownership: a
   `BOT` row is sent only while the conversation is `BOT`; an `AGENT` row only
   while it is `NEXA_*`; a helpdesk reply only while it is `EXTERNAL` on the
   same connection. Otherwise the row becomes `SKIPPED` (new
   `SupportMessageStatus`) with the reason, and stays in the transcript.
2. **The ownership change and the decision share one transaction** (the
   per-contact xact lock already serializes inbound messages; staff actions
   take the same lock).
3. **An event's arrival never changes ownership.** Only the transitions above
   do. A late webhook retry or a duplicated provider event is deduped by its
   key and, if it would act against the current owner, is recorded and ignored.
4. **Transport owner `EXTERNAL` blocks every WhatsApp send for the academy** in
   `WhatsAppService` itself (one check, every path), not in each caller.
5. Any helpdesk bot or auto-responder on a routed conversation must be off.
   **Nexa can't enforce this** inside the provider. The connection screen says
   so, and the health view flags a provider reply that arrives while the
   conversation is `BOT`.

### 5.4 Provider outage

Handoff jobs retry (1/5/15/60 min). While pending, the customer has already got
"we've passed this to our team". After the last attempt, or immediately if the
connection is disabled, the conversation goes to the academy's **fallback
destination** (default: Nexa inbox) and staff get a system message. Inbound
messages on an `EXTERNAL` conversation whose forward fails are stored and
retried in order; after the limit they appear in the Nexa inbox with "not
delivered to <provider>".

---

## 6. WhatsApp lifecycle (with Nexa as transport owner)

- **Inbound:** per-academy webhook URL `/webhooks/whatsapp/<webhookKey>` 🆕
  (D3a; Nexa keeps the bare `/webhooks/whatsapp`). Order of work: verify the
  signature with *that* academy's app secret → check `phone_number_id` belongs
  to that academy → store + dedupe → 200 → claim → run under
  `runInTenant(tenantId)`. Under D3b a single URL and app secret are used, and the
  academy is resolved from the unique `phone_number_id`.
- **Automation:** `transitionSupport` with the academy's settings (§9). Global
  commands, redaction, idle prompt and expiry are unchanged.
- **Outbound replies:** outbox as today, plus the send-time ownership check.
  Interactive types used: reply buttons (≤3) and lists (≤10 rows), both ✅ in
  use. CTA-URL buttons and WhatsApp Flows are ❓ to be checked against Meta's
  docs before any flow uses them; a numbered text fallback is always included.
- **24-hour window:** free-form only inside it. Staff replies outside it use
  the academy's reply template (today an env var, 🆕 an academy setting) or get a 409.
- **Templates:** 🆕 a read-only sync of the academy's templates (name,
  language, category, status) via the WABA's `message_templates` edge
  (needs the WABA id and `whatsapp_business_management`), shown next to every
  template-name field. Templates are created in WhatsApp Manager, not in Nexa.
  Under Arrangement 1 they belong to the provider's account and must be
  recreated there (Crisp says so).
- **Statuses:** sent → delivered → read move forward only; `FAILED` wins
  (built). 🆕 The same status also updates `message_deliveries` by
  `providerMessageId`, so rules and system messages show real delivery.
- **Media (D13):** ✅ built 2026-11-14 ([WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) §0 *Files*): inbound image/PDF → download through the media endpoint
  with the academy's token, store privately, attach to the transcript; size
  and type limits; never passed to the bot or to AI; deleted with the transcript.
- **Handoff:** §5.
- **Follow-ups:** the built nudge (inside the window, once, never after STOP)
  and staff reminders, now honouring business hours. Anything later than 24 h
  is a proactive template through `messaging/` and needs opt-in, which
  phone-number contacts don't give yet. **No out-of-window follow-ups to leads
  in v1.**
- **Consent:** `STOP`/`START` as built; opt-out is checked at send time by
  every proactive path.

---

## 7. Support modes

### 7.1 Native (Mode A)

What exists today, made per-academy: bot + saved answers + tickets + inbox +
reminders, plus Phase C (menu and routing settings, hours, real demo slots,
media, analytics). Default for every academy.

### 7.2 External helpdesk (Mode B)

**Arrangement 2: Nexa owns WhatsApp (recommended, D4).** Nexa runs the bot and
the business flows. When a person is needed and the route says
`HELPDESK(connection)`, Nexa:

1. creates the conversation in the provider, copying the contact's name and
   number plus a context note (intent, ticket reference, collected fields, link
   to the Nexa lead), and replays the transcript as customer messages;
2. after the provider acknowledges, forwards each new customer message;
3. receives the provider's agent replies by signed webhook and sends them on
   WhatsApp from Nexa (they appear in the Nexa transcript as `AGENT`, author
   "<provider>: <agent name>");
4. on the provider's "resolved" event, closes or returns to bot per the
   academy setting.

This needs the provider to (a) let an API create a conversation for a
non-website customer, (b) take customer messages from the API, (c) send its
agents' replies to Nexa instead of delivering them itself. For Crisp, (a) and
(b) are documented; (c) is the open question (§8.2).

**Arrangement 1: the helpdesk owns WhatsApp.** The number is registered with
the provider (Crisp is a BSP and supports coexistence). Nexa's transport owner
is `EXTERNAL`: it sends nothing on that number. With the provider's signed
events it can still:

- create or update a `Lead` when a conversation carries the academy's
  configured tag/segment or fields (the provider's agents set them);
- answer **inside the provider** as a plugin bot (Crisp: API messages from an
  operator, `picker` choices), but only if the academy turns the provider's
  own bot off. Whether Crisp delivers API messages and pickers on WhatsApp is ❓.

v1 of Arrangement 1 = **listen and capture leads only**, no Nexa replies.

### 7.3 Hybrid (Mode C)

One routing table per academy. **Routing only picks the human destination; the
Nexa flow for the intent always runs first.** For "book a trial", the bot
collects details and books a slot; only "talk to a person" afterwards uses the
route. Intents (extend `SupportCategory`): `COURSE`, `DEMO`, `FEES`,
`EXISTING_STUDENT`, `PAYMENT`, `REFUND`, `CLASS`, `TECH`, `ACCOUNT_ACCESS`,
`AGENT`, `OTHER`.

Each intent has a destination: `NEXA_INBOX` or `HELPDESK(connectionId)`. One
academy-wide fallback applies when a destination is unavailable or outside
hours. `resolveSupportRoute(settings, intent, now)` is pure, in
`@nexa-chess/types`, and is the one rule (like `resolveAssignmentDueStatus`).

**Route the whole conversation vs open a case only:**

| Kind | Who owns the conversation | Where agents reply | Provider support |
|---|---|---|---|
| Route conversation | The destination (`EXTERNAL`) | In the provider; Nexa relays to WhatsApp | Crisp: if §8.2 passes |
| Case only 🆕 later | Stays with Nexa (`BOT`/`NEXA_*`) | Provider ticket only (email or internal). **Nothing goes back to WhatsApp automatically** | Ticket-style providers (Zendesk, Freshdesk) ❓; Crisp has no separate ticket object |

Mode A = every intent → `NEXA_INBOX`. Mode B = every intent → one helpdesk.
The "mode" setting is a label and preset over the same table, not separate
code paths.

---

## 8. Provider capability assessment

### 8.1 Crisp, from official docs (checked 2026-11-14)

| Need | Crisp | Status |
|---|---|---|
| Own the WhatsApp number | Crisp is a WhatsApp BSP; numbers connect through Meta's signup in the WhatsApp plugin; **coexistence with the WhatsApp Business app is supported**; Essentials or Plus plan; 1,000 free service messages/number/month in Crisp's offer, templates billable | ✅ (help article) |
| Create a conversation by API | `POST /v1/website/{website_id}/conversation`; not visible in the inbox until a message with `from: user` is sent | ✅ |
| Post customer messages / operator messages | `POST …/conversation/{session_id}/message`, `from` `user`/`operator`, types incl. `text`, `note`, `file`, `picker`; `origin` `chat`/`email`/`urn:*` | ✅ |
| Contact details, data, segments | `PATCH …/conversation/{session_id}/meta` (nickname, phone, segments, data…) | ✅ |
| Assign, resolve, block | `PATCH …/routing`, `…/state` (`pending`/`unresolved`/`resolved`), `…/block` | ✅ |
| Events to Nexa | Web hooks with `message:send`, `message:received`, `session:set_state`, `session:set_routing`, `session:set_data`… **Plugin hooks are signed** (`X-Crisp-Signature`, HMAC-SHA256 over `[timestamp;body]`) **and retried**; Website hooks are neither | ✅ |
| API tiers | `plugin` / `website` tokens; `user` tier not for public use; some routes return 402 by plan | ✅ |
| Rate limits / quotas for plugin tokens | Not on the pages read | ❓ |

### 8.2 To prove with a Crisp test account before Phase E (spike, ~1–2 days)

1. In a conversation created by API with a custom `urn:nexa:whatsapp`
   origin, does an operator reply in the Crisp inbox fire a signed event Nexa
   receives, and does Crisp then **not** try to deliver it itself (email
   fallback, chatbox)?
2. Which event and fields identify an *operator* message vs a *user* message
   (`message:send` vs `message:received` direction) ❓.
3. Can the operator see that the conversation came from WhatsApp, and does
   Crisp count it against a plan limit?
4. Arrangement 1: does a message posted by API (`from: operator`) into a
   WhatsApp conversation owned by Crisp reach WhatsApp, and do `picker`
   choices render as WhatsApp buttons?
5. Plugin hook delivery: retry count, ordering, and how quickly duplicates arrive.
6. The Marketplace plugin process (D11): review time, terms, per-workspace install.

If (1) fails, Crisp supports only Arrangement 1 for Nexa, and Hybrid with
Crisp becomes "send a summary note; the customer continues in Crisp" (not
possible on the same WhatsApp number). Mark it so in the connection screen.

### 8.3 Adding providers

`HelpdeskProvider` (🆕 `support/helpdesk/`), one adapter per provider:

```ts
interface HelpdeskProvider {
  readonly capabilities: {
    routeConversation: boolean;   // can carry the live conversation (Arrangement 2)
    caseOnly: boolean;            // can open a ticket without the conversation
    ownsWhatsApp: boolean;        // can be the transport owner (Arrangement 1)
    signedWebhooks: boolean;
  };
  verifyWebhook(raw: string, headers: Headers, conn: HelpdeskConnection): boolean;
  parseEvents(raw: string): HelpdeskEvent[];   // AGENT_REPLY | RESOLVED | ASSIGNED | NOTE …
  openConversation(conn, context): Promise<{ externalId: string }>;
  forwardCustomerMessage(conn, externalId, message): Promise<void>;
  close(conn, externalId, note): Promise<void>;
}
```

The admin screen shows each capability as supported or not. A route to a
destination without `routeConversation` can't be saved. Intercom, Zendesk and
Freshdesk were **not assessed** here. For each, the same six questions as §8.2
need answers from its official API docs before any work.

---

## 9. Data model proposal

### 9.1 Reuse unchanged

`WhatsAppContact`, `SupportMessage` (plus one status), `SupportTicket`,
`SupportTicketEvent`, `SupportSavedReply`, `SupportUnansweredQuestion`,
`Lead`/`LeadActivity`, `DemoSchedule`/`DemoClassRegistration`,
`MessageDelivery`, `RETENTION_RULES`, the encrypted-secret helpers.

### 9.2 Additive changes to existing models

| Model | Change | Why |
|---|---|---|
| `WhatsAppSettings` | Built (Phase B): `wabaId?`, `appSecretEncrypted?`, `verifyTokenEncrypted?` (generated by Nexa and shown for copying, so encrypted rather than hashed), `webhookKey` (unique), `lastWebhookAt?`, **unique `phoneNumberId`**. Later: `transportOwner` (`NEXA`/`EXTERNAL`/`NONE`), `externalConnectionId?`, `lastError?` | Per-academy inbound (G2, G3), §5.1 |
| `WhatsAppWebhookEvent` | `phoneNumberId` | Audit which number; the tenant check |
| `SupportConversation` | `owner` (new enum, backfilled from `status`; `status` kept until the code no longer reads it), `ownerSince`, `externalConnectionId?`, `externalConversationId?`, `intent?` | §5, §7 |
| `SupportMessage` | status `SKIPPED`; `mediaUploadId?` | §5.3, D13 |
| `WhatsAppContact` | `linkedUserId?`, `linkedAt?` | Phase D |
| `SupportCategory` | add `DEMO`, `FEES`, `EXISTING_STUDENT`, `ACCOUNT_ACCESS` | §7.3 |

### 9.3 New models (all with `tenantId`, `PrismaService` getters, retention, export)

| Model | Phase | Purpose |
|---|---|---|
| `SupportSettings` (one per academy) | B (built: bot on/off, test numbers, reminder minutes, nudge hours, reply template) / C (the rest) | Bot on/off (replaces `SUPPORT_BOT_ENABLED` per academy; the env switch stays as a server kill switch), test allowlist, mode preset, menu config (JSON validated by a zod schema in `@nexa-chess/types`), routing table + fallback, hours + time zone + out-of-hours text, reminder minutes, nudge hours, reply template, "return to bot on resolve" |
| `SupportConversationEvent` | C | Append-only ownership history: from, to, reason, destination, actor type (`USER`/`BOT`/`PROVIDER`/`SYSTEM`), actor id, provider event id |
| `WhatsAppLinkCode` | D | Hashed one-time code, user, expiry, consumed; rate-limited |
| `WhatsAppTemplate` | C | Read-only cache of Meta templates per academy |
| `HelpdeskConnection` | E | Provider, status, encrypted credentials, provider workspace id (Crisp `website_id`), `webhookKey`, capability snapshot, `lastHealthyAt`, `lastError` |
| `HelpdeskWebhookEvent` | E | Same store-dedupe-lease pattern as `WhatsAppWebhookEvent` |
| `HelpdeskSyncJob` | E | Outbound work to the provider (open, forward, close) with `dedupeKey`, attempts, `nextAttemptAt`. The outbox for a provider |

Not proposed: a generic "integration framework", a separate message bus, or a
copy of the transcript in a second table.

---

## 10. Failure, security and tenancy

- **Signatures:** Meta, HMAC-SHA256 of the raw bytes with the *academy's* app
  secret (D3a) or Nexa's (D3b); Crisp, plugin-hook HMAC over
  `[timestamp;body]`, with a timestamp freshness window. Unsigned → 401 and
  nothing stored. New routes go on `PUBLIC_ROUTES`, `ANONYMOUS_OK` and the
  CSRF-exempt list, use raw-body parsers and `@SkipThrottle`, and get an nginx
  IP limit (still missing on the existing route).
- **Tenant isolation:** the academy comes from the URL's `webhookKey` →
  connection row, then the payload is checked against it (`phone_number_id`,
  Crisp `website_id`). It is never taken from the payload alone. All processing
  runs in `runInTenant`; the sweeps use `asPlatform` only to list rows, then
  `runInTenant` per row (as today). A `cross-user-access` row is added for
  every new id-taking route.
- **Idempotency:** inbound dedupe keys (`msg:<wamid>`, `status:<wamid>:<status>`,
  `crisp:<event id or fingerprint>`); outbound `clientKey`; sync jobs `dedupeKey`;
  ownership transitions compare-and-set on the current owner.
- **Retries and dead letters:** the existing lease + sweep + park-after-5
  pattern for every inbound table. Parked items get a **replay** action in the
  health view (super admin, audited). Outbound: retryable errors back off;
  others fail visibly in the transcript.
- **Rate limits:** Meta errors marked `retryable` back off; Crisp 429 backs
  off; per-contact abuse limit (~30 messages / 10 min → bot pauses, contact
  flagged) as designed.
- **Secrets:** AES-256-GCM via `CREDENTIALS_ENCRYPTION_KEY` (existing),
  reloaded per process every 60 s (existing); verify tokens stored hashed;
  secrets never returned by any GET.
- **RBAC:** academy super admin connects WhatsApp and helpdesks; admins work
  the inbox and edit menus, answers and routing; platform operators can only
  see health (no transcripts) unless they open an audited support session.
- **Privacy (minors):** transcripts 12 months after close, webhook rows 30
  days, sync jobs 30 days; contact erase action + export section (G7); Sentry
  gets no bodies or numbers. A helpdesk receives exactly what is routed to it.
  The connection screen states that the provider then holds that data under
  its own retention.
- **Monitoring:** health view + `/health` counters: last webhook per academy,
  parked events, failed/skipped sends, `EXTERNAL_PENDING` older than 10 min,
  `NEXA_QUEUE` older than the SLA, provider sync failures. A
  `SUPPORT_INTEGRATION_FAILING` system message goes to super admins (once per
  incident). Each new failure mode gets a TROUBLESHOOTING row.

---

## 11. Academy admin experience

`/admin/support/settings` 🆕, five tabs:

1. **Connection:** WhatsApp status (connected / receiving / last message
   received), phone number, **"Replies on this number are sent by: Nexa |
   <Crisp> | nobody"** in a banner that also shows on the inbox, webhook URL to
   paste into Meta, test button. Helpdesk connections, each with capabilities
   and health.
2. **Mode and routing:** Native / External / Hybrid preset, then the
   intent → destination table, fallback, "return to bot on resolve".
3. **Menu and answers:** welcome text, menu items (on/off, order, label),
   the saved answers and unanswered questions (built), test-number allowlist,
   bot on/off.
4. **Hours and follow-ups:** hours, time zone, out-of-hours reply, reminder
   minutes, nudge on/off, reply template (with its Meta status).
5. **Health:** the counters from §10, parked events with replay, recent ownership
   changes.

Inbox changes: an owner badge on every conversation ("Bot", "Waiting for
team", "<name>", "In Crisp: <agent>"). The reply box is disabled with the
reason whenever Nexa doesn't own the conversation.

---

## 12. Phased plan

| Phase | Scope | Depends on | Acceptance | Tests |
|---|---|---|---|---|
| **A — switch on (owner + small)** | Staging test number; app secret + verify token; allowlist rollout on Nexa's number; then everyone | D2, open item 2 | Real customers get menu/answers/tickets on prod for 1–2 weeks; staging can't reach a real customer | Existing specs + a manual run with the test number |
| **B — multi-academy inbound** | `WhatsAppSettings` inbound fields + unique number; `/webhooks/whatsapp/<webhookKey>`; per-academy signature + tenant check; `SupportSettings` with on/off, allowlist, reminder/nudge/template moved from env; `whatsappSupport` plan feature | A, D3, D14 | Two academies on staging, each receives only its own messages; a payload signed by academy A sent to B's URL is refused; academy without the feature gets 402 on inbox routes and no bot replies | Int: cross-academy webhook refusal, duplicate delivery, number uniqueness; unit: parser, settings schema |
| **C — Native complete** | Ownership enum + events (the send-time check is done, G1); configurable menu and routing (Nexa destinations only); hours + out-of-hours; real demo slots via `DemoSchedule`/`bookLead`; inbound media; template sync; statuses → `message_deliveries`; contact export/erase; analytics (volume, first reply, handoff rate); one-way lead push to Frappe CRM (D6; async, retried, Nexa's academy only) | B, D5 | Admin reorders/hides menu items and sees it on WhatsApp; a queued bot reply after take-over is `SKIPPED`; a parent books a real slot and gets the join link; erase removes contact, transcript, media | Pure specs for `resolveSupportRoute`, `decideOwner`, menu config; int: take-over race, slot booking race (full slot), erase |
| **D — existing students** | Link code from Profile; linked contact can ask "next class", "batch timing", "join link"; unlinked numbers get public info only | C, D8 | A linked parent gets their child's next class; an unlinked number never gets account data; a reused/expired code fails | Int: code single-use, rate limit, cross-academy code refusal; cross-user access rows |
| **E — External helpdesk, Arrangement 2 (Crisp)** | Spike §8.2 first. `HelpdeskProvider`, `HelpdeskConnection`, webhook + sync jobs, `EXTERNAL_PENDING`/`EXTERNAL`, fallback, Hybrid routes to Crisp | D1 (an academy needs it), D4, D11, spike passes | Routed conversation appears in Crisp with context; Crisp agent reply reaches WhatsApp once; Crisp down → fallback to Nexa inbox with alert; no bot message while `EXTERNAL` | Provider contract tests against recorded fixtures; int: duplicate/out-of-order provider events, outage fallback, ownership race |
| **F — Arrangement 1 (listen + leads)** | Transport owner `EXTERNAL` blocks all Nexa WhatsApp sends; Crisp events → `Lead` by tag/fields | E | Nothing leaves Nexa on that number; tagged conversation creates/updates one lead | Int: send blocked on every path (rules, system messages, support) |
| **G — AI suggest-only** | Intent suggestion for free text → offered as a menu choice; agent reply drafts from saved answers/knowledge; never acts | D9, model + privacy decision | Suggestions logged with outcome; no business action without a deterministic step | Eval set from unanswered questions |

Rough sizes (one developer): B ~1 week, C ~2–3 weeks, D ~1 week, E ~2 weeks
after the spike, F ~3 days. A is mostly calendar time on Meta's side.

Rollout per phase: additive migrations, dark behind settings, staging (its
own Meta number), allowlist, then on. Rollback = the setting off. Inbound keeps
being recorded with `ignoredAt`, so nothing is replayed later.

---

## 13. External facts checked (2026-11-14)

- Meta webhooks go to the app's callback URL; an alternate callback can be set
  per WABA (`POST /<WABA_ID>/subscribed_apps`) or per phone number, and the
  number's override wins
  ([webhook overrides](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override/)).
  Whether two apps subscribed to one WABA both receive `messages` is **not
  documented** on the pages read ❓.
- Coexistence: Solution Partners / Tech Providers only, via Embedded Signup
  with session logging; 20 messages/s; 180 days of history sync within 24 h;
  `smb_message_echoes` must be processed; groups, calls, broadcast lists not
  synced. India availability not stated ❓
  ([onboarding business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)).
- Tech Provider: App Review for advanced access; up to 200 new customers per
  7 days after verification; Embedded Signup v2 deprecated 2026-10-15
  ([become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)).
  Multi-partner solutions let a Tech Provider and a Solution Partner share a
  client's assets, with one of them chosen to send
  ([multi-partner](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solutions/)).
- Pricing: per message since 2025-07-01; service replies inside the window
  free; utility templates inside an open window free; India rates differ
  between secondary sources, so use Meta's rate card ❓
  ([pricing](https://developers.facebook.com/docs/whatsapp/pricing)).
- Policy: since 2026-01-15 general-purpose AI assistants may not use the
  WhatsApp Business Solution; business-function bots may (secondary reporting,
  e.g. [respond.io](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban);
  Meta's terms text not read ❓).
- Crisp: [WhatsApp channel](https://help.crisp.chat/en/article/11rcwkw/),
  [REST API v1](https://docs.crisp.chat/references/rest-api/v1/),
  [web hooks](https://docs.crisp.chat/references/web-hooks/v1/),
  [WhatsApp API guide](https://docs.crisp.chat/guides/messaging-apis/whatsapp-api/).
