# WhatsApp automated support & chatbot — Phase 0 assessment and plan

Status: **proposal, awaiting owner sign-off** (written 2026-10-25). Nothing here
is implemented. The decisions in §12 block Phase 1.

Legend: ✅ verified in the repo / on the box · ❓ assumption or not verifiable
from here.

Contents: 1 current architecture · 2 reusable pieces · 3 integration approach ·
4 message flow · 5 state machine · 6 database changes · 7 Meta setup ·
8 environment variables · 9 security, tenancy, privacy · 10 phases and risks ·
11 testing and deployment · 12 owner decisions.

---

## 1. Current architecture

- ✅ NestJS 11 API + Next.js 14 web, Prisma 6 / Postgres 15, optional
  Redis/BullMQ, one ARM64 Oracle VPS shared with LiveKit and Frappe CRM. The API
  is public at `api.nexachess.in` through nginx.
- ✅ Auth is cookie JWT → `authenticateUser` (no guards). Roles: `SUPER_ADMIN`,
  `ADMIN`, `COACH`, `STUDENT`. **No parent role and no support-agent role.**
- ✅ Effectively single-tenant: `Tenant` has one row (`tenant_nexa`); `tenantId`
  exists only on the SaaS-plan tables, on no business table
  ([SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) §Summary 1).
- ✅ Frappe CRM runs on the box (`crm.nexachess.in`, `/opt/frappe-crm`) with the
  `frappe_whatsapp` app installed (`/opt/frappe-crm/apps.json`). ❓ Whether its
  WhatsApp account is configured.

## 2. Existing features that can be reused

| Need | What exists | Verdict |
|---|---|---|
| Outbound WhatsApp | ✅ `apps/api/src/whatsapp/whatsapp.service.ts` (Meta Cloud API): text, template, document, media upload, E.164 normalization, `retryable` failures | **Reuse.** Add `sendInteractive` (buttons/list) and `markRead` |
| Credentials | ✅ `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` set in prod; prod has sent WhatsApp messages (only the `ANNOUNCEMENT` rule has WhatsApp enabled) | Integration works. ❓ Whether that number is the public support number (`ACADEMY_WHATSAPP`, `apps/web/src/features/academy/content.ts:20`) |
| Inbound webhook | ✅ **None** — no verify-token handler, no `X-Hub-Signature-256` check anywhere | **Build** |
| Outbox + retry | ✅ `MessageDelivery` + `MessagingDeliveryWorker` (`SKIP LOCKED` claim, backoff, unique `dedupeKey`) — [MESSAGING.md](MESSAGING.md) | Reuse the pattern; its once-a-minute sweep is too slow for chat replies (see §4) |
| Webhook plumbing | ✅ Payment webhooks: raw body + origin-check exemption (`apps/api/src/app.setup.ts:21-41`), `@SkipThrottle` (`payments/payments-webhook.controller.ts:20`), event dedupe in `PaymentWebhookEvent` | **Copy exactly** |
| Leads | ✅ `Lead` / `LeadActivity` / `LeadNote`, `LeadStatus` pipeline, admin leads UI. `Lead` requires `studentName`, `parentName`, `studentAge` (Int), `experienceLevel`, `phone` (plus an optional lower-cased `email`); no phone dedupe | Course inquiry / trial → `Lead` with `source = "WhatsApp"` |
| Refunds | ✅ `Refund` = a provider-executed refund, admin-only (`payments/payments-admin.controller.ts:324`) | **A refund request is not a `Refund`.** It is a ticket; an admin uses the existing refund route — "received ≠ approved" by construction |
| Staff notifications | ✅ `Notification` (in-app) + `MessagingDispatchService` | Reuse; `MessagingAudience` has no admin audience — small extension |
| In-app chat | ✅ `Conversation` / `ChatMessage` | **Don't reuse** — members must be `User`s; a WhatsApp customer usually isn't |
| Tickets / support inbox | ✅ **None** | **Build** |
| Approved academy facts | ✅ `ACADEMY_FAQ` (`apps/web/src/features/academy/content.ts:98`) already feeds the FAQ, JSON-LD and `llms.txt` | Move to `packages/types` so the bot answers from the same source |
| AI | ✅ `apps/api/src/ai/` + runtime are mock-only; the CPU benchmark measured qwen2.5:3b p95 ≈ 7 min ([docs/ai/architecture/](ai/architecture/ROADMAP.md)) | **Not usable for real-time chat** — Phase 4 needs an off-box model or rules |
| Parent identity | ✅ [PARENT_REPORTS.md](PARENT_REPORTS.md): `parentPhone` is typed-in contact data, **not authorization** | The bot may not treat "phone matches `parentPhone`" as identity |

**⚠️ Found:** `NexaGen-dev/.env` uses the **same** WhatsApp phone-number id and
access token as production (compared by hash, values not read). Meta sends a
number's webhooks to exactly one URL. Dev must move to Meta's test number before
any inbound work, or dev testing will message real customers.

## 3. Recommended integration approach

**Official Meta Cloud API directly — extend the existing `WhatsAppService`.** A
BSP (Gupshup, Interakt, AiSensy…) adds a per-message markup and a second vendor
holding minors' data; its main extras (agent inbox, flow builder) matter less
once the bot needs NexaGen data (classes, payments, accounts). No unofficial
WhatsApp Web automation, and never an employee's personal number.

**One system owns the number's webhook** — NexaGen or Frappe (`frappe_whatsapp`).

- **Recommended: NexaGen owns the webhook, bot and tickets.** It has auth, RBAC,
  payments and class data. Course leads are pushed one-way to Frappe CRM via its
  REST API (consistent with Frappe as the sales source of truth).
- Alternative: Frappe owns WhatsApp — the bot logic would live in Python inside
  Frappe with no access to NexaGen accounts or classes. Not recommended.

## 4. Message flow

```
Customer ──WhatsApp──▶ Meta Cloud API
                          │ POST /webhooks/whatsapp  (X-Hub-Signature-256 = HMAC-SHA256(raw body, APP_SECRET))
                          ▼
nginx (api.nexachess.in) ─▶ NestJS WhatsAppWebhookController   [@SkipThrottle, origin-check exempt, raw body]
   1. verify signature (constant time) → 401 if bad
   2. INSERT whatsapp_webhook_events (unique dedupeKey: wamid for a message,
      wamid + status for a status update, so sent → delivered → read are
      distinct rows; wamid stays the message lookup key)  ← Meta retries collide here
   3. respond 200 immediately
   4. process in-process after the response: an atomic claim
      (UPDATE … SET claimedAt = now() WHERE id = $1 AND processedAt IS NULL AND
      (claimedAt IS NULL OR claimedAt < now() - lease)), so two handlers never
      both act; the cron sweep picks up only rows whose lease expired
          │
          ▼
SupportConversationService (one transaction, SELECT … FOR UPDATE on the conversation row)
   ├─ statuses (sent/delivered/read/failed) → update support_messages / message_deliveries by wamid
   ├─ load contact + open conversation (create if none / expired)
   ├─ transition(state, input)  ← PURE function in @nexa-chess/types (support-flows.ts)
   ├─ persist new state + draft + inbound message
   ├─ side effects: create Ticket / Lead (dedupeKey), notify staff, hand off
   └─ write outbound support_messages rows (PENDING)
          │ after commit
          ▼
WhatsAppService.sendInteractive / sendText ──▶ Meta ──▶ Customer
   failure → row FAILED/retryable → minute worker retries; visible in the inbox
Staff: /admin/support inbox ◀── tickets, transcript, notes, agent replies (same send path)
Optional: Lead → Frappe CRM REST (one-way, async, best-effort)
```

Status webhooks also give the existing `message_deliveries` rows real
delivered/read state via `providerMessageId`.

## 5. Conversation state machine

Defined as data in `packages/types/src/support-flows.ts`; a pure
`transition(state, input, ctx) → { next, replies[], actions[] }` makes every
path unit-testable without Meta (same pattern as `class-availability.ts`,
`revision.ts`).

```
START ─▶ MAIN_MENU (list message, 6 rows)
 ├─ course   ▶ COURSE_MENU ▶ {FEES_BATCHES → answer from ACADEMY_FAQ | TRIAL_DETAILS: student name → age → experience → preferred time → parent name}
 │             ▶ CONFIRM ▶ LEAD_CREATED ▶ (HUMAN_FOLLOW_UP)
 ├─ refund   ▶ REFUND_REASON ▶ REFUND_STUDENT (name → registered phone → course)
 │             ▶ REFUND_PAYMENT (txn/ref id → payment date → explanation?) ▶ CONFIRM ▶ TICKET_CREATED
 ├─ class    ▶ CLASS_MENU {missed | can't join → tips, "did that help?" | reschedule | teacher issue} ▶ details ▶ TICKET_CREATED
 ├─ payment  ▶ PAYMENT_MENU ▶ details ▶ TICKET_CREATED
 ├─ tech     ▶ TECH_MENU ▶ self-help tips ▶ resolved | TICKET_CREATED
 └─ human    ▶ HANDOFF (ticket created/updated, status WAITING_AGENT, bot silent)
Global, any state: "menu"/"0" → MAIN_MENU · "back" → previous · "cancel" → discard draft
                   "agent"/"human" → HANDOFF · "STOP" → opt out of proactive messages
```

Rules:

- **Input resolution.** A reply id (`refund.reason.duplicate`) or a number
  ("2") is resolved against the **current state's** menu only. Invalid → re-ask;
  after 3 invalid replies, offer a human.
- **Interactive limits.** Reply buttons: max 3, title ≤ 20 chars. Lists: max 10
  rows. Main menu and refund reasons are lists; yes/no is buttons. The numbered
  text menu is always included as a fallback.
- **Expiry.** ❓ 30 min idle → next message asks "Continue your refund request,
  or start again?"; 24 h → draft discarded. A conversation in `AGENT` status
  never auto-expires.
- **Concurrency.** At most one open conversation per contact (partial unique
  index); a row lock serializes its messages. `flowVersion` is stored so a flow
  change doesn't break in-flight conversations.
- **Duplicate tickets.** `dedupeKey` = tenant + contact + category + 7-day
  window, not the conversation: a customer who repeats the same refund within
  7 days, even in a new conversation, is shown their existing reference.
- **Sensitive input.** Never ask for passwords, OTPs or card numbers. Input that
  looks like a card number (Luhn-valid, 13–19 digits) or an OTP is redacted
  before storage and the customer is warned.

## 6. Database changes (one additive migration)

New models (each gets a `PrismaService` getter):

- `WhatsAppWebhookEvent` — inbound event, unique `dedupeKey` (§3), `claimedAt`,
  `processedAt`, `ignoredAt`, `error`. Stores only the fields the flow reads
  (sender, type, text/interactive id, status, timestamps), with message text
  passed through the same card/OTP redaction as `SupportMessage.body` before
  insert, never the raw payload. Goes in `RETENTION_RULES` (~30 days), the
  privacy export and account deletion, and is readable only through the
  `ADMIN`/`SUPER_ADMIN` inbox.
- `WhatsAppContact` — `waId` (unique), `profileName`, `linkedUserId?`,
  `linkedAt?`, `lastInboundAt` (24 h window), `optedOutAt?`, `blockedAt?`.
- `SupportConversation` — `contactId`, `state`, `flowVersion`, `draft Json`,
  `status (BOT | WAITING_AGENT | AGENT | CLOSED)`, `assignedToId?`,
  `lastInboundAt`, `expiresAt`.
- `SupportMessage` — `direction`, `providerMessageId` (unique, nullable: an
  outbound row is written PENDING before Meta returns an id), `clientKey`
  (unique, the local idempotency key a retry reuses), `type`, `body`
  (redacted), `interactiveId?`, `status`, `error?`, `sentById?` (agent). The
  transcript.
- `SupportTicket` — human-readable `reference` (`NXS-2026-000123`, Postgres
  sequence), `category`, `subcategory`, `status`, `priority`, `details Json`,
  `assignedToId?`, `leadId?`, `paymentId?` (linked by staff only, never by the
  bot), unique `dedupeKey`, `resolvedAt`.
- `SupportTicketEvent` — append-only audit: created, assigned, status change,
  internal note, handoff.

Changes to existing code:

- `Lead`: no column change — `source = "WhatsApp"` + a `LeadActivity`; the bot
  collects the fields `Lead` requires.
- `MessagingAudience` / `DispatchRequest`: a way to notify admins; a new
  `NotificationType` for support tickets.
- A new section in the privacy export ([FEATURES.md](FEATURES.md) §3.6l).

**Tenancy (decision):** put `tenantId` (NOT NULL, default `tenant_nexa`) on the
new tables now — nearly free, avoids a backfill. A future tenant would be
resolved from the number's `phone_number_id`.

## 7. Meta / WhatsApp setup required (❓ the Meta account isn't visible from here)

1. Meta Business Portfolio, ideally **business-verified** (higher messaging
   limits, display name).
2. WhatsApp Business Account + a Meta app with the WhatsApp product.
3. **The support number.** Decide whether `+91-9344967940` moves to the Cloud
   API. If it is on the WhatsApp Business app today, check Meta's
   "coexistence" mode for India or migrate it. ❓ Which number prod sends from
   today.
4. A **System User permanent token** with `whatsapp_business_messaging` +
   `whatsapp_business_management` (not a 24 h temporary token).
5. Webhook callback `https://api.nexachess.in/webhooks/whatsapp` + verify token,
   subscribed to the `messages` field (WABA and app both subscribed).
6. The **app secret** for signature checks.
7. Approved **utility templates** for messages outside the 24 h window (e.g.
   "Update on ticket {{1}}: {{2}}", "An agent replied to your request {{1}}").
8. Pricing (❓ check Meta's current India rate card): since mid-2025 Meta charges
   per template message; free-form replies and utility templates inside the
   customer-service window are free. A reply-only support bot costs ~nothing;
   template follow-ups after 24 h are charged.
9. A separate **Meta test number** for dev/staging (fixes the shared-credentials
   problem in §2).

## 8. Environment variables (names only)

| Variable | Purpose |
|---|---|
| `WHATSAPP_APP_SECRET` | HMAC key for `X-Hub-Signature-256` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Echo check on the `GET` subscription handshake |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Template management / subscription calls |
| `SUPPORT_BOT_ENABLED` | Master switch, default `false` |
| `SUPPORT_SESSION_TIMEOUT_MINUTES` | Idle expiry (§5) |
| `SUPPORT_TEST_NUMBERS_ALLOWLIST` | Dev: the bot replies only to these numbers |
| `SUPPORT_AGENT_REPLY_TEMPLATE` | Template used when an agent replies outside 24 h |
| `FRAPPE_CRM_URL`, `FRAPPE_CRM_API_KEY`, `FRAPPE_CRM_API_SECRET` | Only if the Frappe lead push is approved |

Validated in `packages/config/src/api.ts`. With `SUPPORT_BOT_ENABLED=true` in
production, a missing app secret refuses to boot (same pattern as
`MFA_ENCRYPTION_KEY`).

## 9. Security, tenant isolation and privacy

- **Webhook.** HMAC-SHA256 over the raw bytes, constant-time compare; `GET`
  verify checks the token. Route added to `PUBLIC_ROUTES` (route-auth spec),
  `ANONYMOUS_OK` (auth-boundary suite) and the origin-check exempt list in
  `app.setup.ts`. The route gets its own size-bounded raw-text parser
  registered before the JSON parser (as the payment webhooks do with
  `express.text`), so the signed bytes survive for the HMAC. A bounded
  **IP-level** limit (nginx, before body parsing and signature work) caps
  unsigned floods; after the signature check a **per-contact** abuse limit
  (~30 messages / 10 min → bot pauses, contact flagged) applies.
- **Identity.** WhatsApp authenticates the sender's number (`wa_id`): it proves
  control of the number, **not** a link to a student. Phases 1–2 never reveal
  account data — the bot only collects and hands over to staff. For Phase 3
  account-aware answers ("my next class"), link from inside the app: a signed-in
  user taps Profile → "Link WhatsApp", which opens
  `wa.me/<number>?text=LINK-<one-time code>`, and the bot binds that `wa_id` to
  the user. The code is cryptographically random, expires in ~10 minutes, is
  consumed atomically (single use), and attempts are rate-limited per sender
  number **and** per code: the inbound-message limit alone wouldn't stop
  guessing spread across many numbers. The bot never asks for an OTP; the code comes from the user's own
  authenticated session. Unlinked numbers get public information only.
- **Minors.** Collect names/ages/phones only from the parent and only per flow.
  The first message links to `/privacy`. Phones are unmasked only in the support
  inbox (masked elsewhere, as `MessageDelivery` already does). Sentry and logs
  never get message bodies or phone numbers.
- **RBAC.** v1: `ADMIN` / `SUPER_ADMIN` use the inbox. Coaches get nothing
  unless a ticket is explicitly shared. Every new endpoint taking a ticket or
  conversation id gets a row in the cross-user and admin-route integration
  suites.
- **Tenancy.** ✅ Single-tenant today, so "admin sees all" is correct now. Real
  isolation waits on multi-tenancy Phase 2; `tenantId` on the new tables keeps
  that change small.
- **Consent.** Inbound support messages are user-initiated. Proactive templates
  need opt-in; "STOP" sets `optedOutAt`. Opt-out is enforced at the proactive
  send boundary: every proactive path, `MessagingDeliveryWorker` retries
  included, checks `optedOutAt` right before sending and skips an opted-out
  recipient. Inbound support replies are unaffected. ⚠️ The **existing**
  outbound messaging rules check no opt-out today, so this fixes them too.
- **DPDP Act 2023 / Rules 2025 (❓ needs legal review).** Verifiable parental
  consent for children's data, purpose-limited notice, retention limits, erasure
  on request. Proposed retention: transcripts 12 months after ticket close, raw
  webhook events 30 days; deletion through the existing privacy module.

## 10. Phases, dependencies and risks

| Phase | Scope | Rough size |
|---|---|---|
| **0 — prerequisites (owner)** | Meta account and number decision, test number, separate dev credentials, the §12 decisions | Calendar time, depends on Meta verification |
| **1 — working menu** | Webhook (signature, dedupe, statuses), contact + conversation tables, `support-flows.ts`, interactive sends, menu/back/cancel/expiry, handoff creating a minimal ticket, behind `SUPPORT_BOT_ENABLED` + dev allowlist. Unit tests for every transition; integration tests for duplicate webhooks, concurrent messages, bad signatures | ~1–1.5 weeks |
| **2 — tickets and inbox** | `SupportTicket` + events, assignment, staff notifications, `/admin/support` page (list, transcript, notes, agent reply with template outside 24 h, take over / return to bot), privacy export, retention | ~1.5–2 weeks |
| **3 — academy flows** | Full refund / payment / class / tech flows; FAQ answers from shared content; `Lead` creation + optional Frappe push; in-app number linking; account-aware answers for linked users only (next class, join link) | ~2 weeks |
| **4 — AI and analytics** | Free-text intent classification that only *suggests* a flow (never acts), agent summaries, metrics (volume, handoff rate, time to first reply) | Depends on the model decision: the on-box CPU model is too slow, so an off-box API (privacy sign-off) or keyword rules (Phase 1 already covers "refund", "paid twice", "human") |

AI never approves refunds, invents policy, exposes private data or creates
records on its own; refunds, payments, account access and ticket creation stay
deterministic.

**Major risks:** Meta verification / template approval delays; the number
migration (WhatsApp Business app vs Cloud API without coexistence); the dev/prod
credential sharing; the 2-core box (the bot is light, AI is not); Frappe and
NexaGen both wanting the webhook; agents missing the 24 h window; DPDP
compliance for minors.

## 11. Testing and production deployment

- **Unit:** the pure state machine (each state × valid / invalid / global
  commands / expiry), signature verification, payload builders, redaction.
- **Integration (`*.int-spec.ts`):** a duplicate `wamid` is processed once; two
  concurrent messages leave one consistent state; a retried ticket creation is
  deduped; unsigned bodies are rejected; RBAC rows for the new admin routes.
- **End to end:** a webhook simulator script posting signed fixture payloads (no
  Meta account needed), then the Meta test number pointed at
  `api-dev.nexachess.in`.
- **Rollout:** additive migrations; ship dark (`SUPPORT_BOT_ENABLED=false`), then
  enable with a staff-only allowlist, then the real number. Rollback = flag off;
  the webhook keeps recording events and answering 200, but marks them
  `ignoredAt` so re-enabling never replays messages from the disabled period.
- **Monitoring:** failed sends and unprocessed webhook events surface in the
  inbox and `/health`; add a [TROUBLESHOOTING.md](TROUBLESHOOTING.md) row.

## 12. Decisions needed before implementation

1. **Webhook owner:** NexaGen (recommended) or Frappe `frappe_whatsapp`?
2. **Which number** becomes the bot number? Is it on the WhatsApp Business app
   today? Is the Meta business verified?
3. **Staff workspace:** new NexaGen `/admin/support` inbox (recommended), or
   Frappe (Helpdesk would be a new app)?
4. **Agents:** admins only for v1, or a new `SUPPORT` role?
5. **Leads:** NexaGen `Lead`s only, or also push to Frappe CRM?
6. **Account linking:** is in-app linking acceptable as the only way to unlock
   account-specific answers?
7. **Refund policy text** the bot quotes, and response-time SLA per category.
8. **Support hours:** is a human handoff answered 24/7 or in set hours (with an
   out-of-hours reply)?
9. **Session timeout** (30 min?) and **transcript retention** (12 months?).
10. **Languages:** English only, or also Tamil/Hindi in v1?
11. **`tenantId` on the new tables now:** yes (recommended) or no?
12. **AI phase:** is sending message text to an external model provider
    acceptable at all, given these are minors' families?

First concrete step regardless of the rest: move the dev checkout onto its own
WhatsApp test credentials.
