# Payments, invoices & credit notes

> Moved out of [CLAUDE.md](../CLAUDE.md) on 2026-10-17 to keep that file
> under the context limit; the text is unchanged. `§` numbers refer to
> CLAUDE.md, which keeps a short summary under the same number.

## 3.6f Payments (Razorpay / Cashfree / Stripe)

`apps/api/src/payments/` + `apps/web/src/features/payments/`, pages
`/plans`, `/checkout/[planId]`, `/student/billing`, `/admin/payments`, routes
`API_ROUTES.payments.*` / `.adminPayments.*`. Provider-agnostic and UPI-first
for India.

- **Business logic talks to `PaymentService` and nothing else.** It asks
  `PaymentRouterService` for a gateway; the router answers from the
  admin-editable config. **Never import a provider adapter outside
  `payments/providers/`** — no provider status string may exist past that folder.
- **The shared contract lives in `@nexa-chess/types` (`payments.ts`)**:
  `PaymentStatus` + `PAYMENT_STATUS_RANK` + `canTransitionPaymentStatus`,
  `resolvePaymentProvider`, `DEFAULT_PAYMENT_ROUTING`, `formatMoney`,
  `toMinorUnits`/`toMajorUnits`. The admin routing preview calls the *same*
  `resolvePaymentProvider` the server does, so the two cannot drift.
- **Money is always integer minor units** (paise, cents) — `Int` columns, never
  a float or Decimal. `toMinorUnits` is the only major→minor conversion, and
  Cashfree (which speaks rupees) converts at its adapter boundary only.
- **`applyProviderState` is the single state funnel.** Webhooks, the client's
  `verify` callback, the "Check payment status" button and the reconciliation
  cron are four doors into one transactional room. It applies the rank guard, so
  a stale `PENDING` redelivered after a capture — or a `FAILED` for a sibling
  attempt — cannot un-pay anything. A captured amount that differs from the
  order parks the payment at `PROCESSING` with `failureCode: amount_mismatch`
  rather than granting. State whose `providerOrderId` is not the payment's own
  is ignored, and `verify` only ever queries the stored gateway order — a
  client-supplied handle for another order can never apply that order's capture.
- **Access is an `Entitlement` row, never a gateway status (§21).** Provider →
  verification → payment → order → entitlement → access.
  `EntitlementService.grant` runs inside the capture transaction and is
  idempotent on the unique `(orderId, planId)`; batch enrolment is an `upsert`
  (BatchStudent is soft-deletable and its unique key spans deleted rows).
  **Nothing else in the codebase may enrol a student off a payment.**
- **Double-payment protection is the unique index on `orders.idempotencyKey`**,
  not a check-then-insert. The web client holds one key per plan in
  `sessionStorage` (`features/payments/lib/checkoutKey.ts`), so a double click,
  refresh, back-navigation or second tab replays it and the server returns the
  original order.
- **A retry is a new `PaymentAttempt` on the same `Order`.** `retry` reconciles
  first and refuses while anything is in flight. §17: a provider is only
  excluded from re-routing once its attempt reached a settled failure, and
  `failoverEnabled` is **off by default** — never re-route while it is unclear
  whether money moved.
- **Webhooks are public but never trusted.** `/payments/webhooks/{razorpay,
  cashfree,stripe}`; `main.ts` mounts `express.text` on those three paths so the
  raw bytes survive for signature verification — **do not let a JSON parser
  claim them**. The unique `(provider, eventId)` on `payment_webhook_events` is
  the idempotency guard (a redelivery collides on insert); an unsigned payload
  is persisted for audit and then rejected, and a handler failure marks the row
  FAILED for the 10-minute recovery sweep rather than asking the provider to
  retry forever.
- **A refund is never SUCCEEDED because the API accepted it (§14)** — only a
  webhook or a reconciliation read settles it. A *transport* failure leaves it
  PENDING, deliberately: the gateway may have taken it, and marking it failed
  invites a second refund.
- Invoices are issued inside the capture transaction, numbered gaplessly from
  `InvoiceSequence`, and rendered as printable HTML (no PDF dependency on the
  ARM box). Line items are copied, so a later plan rename never rewrites a
  receipt someone already downloaded.
- Payment messaging rides the existing rules: `PAYMENT_RECEIVED`,
  `PAYMENT_FAILED`, `REFUND_PROCESSED`, `SUBSCRIPTION_RENEWAL_FAILED` ship
  **enabled, in-app only** via `MessagingDispatchService`. Every figure is read
  back from the payment row, so a caller cannot assert an amount.
- **A batch's price IS a `Plan` row carrying its `batchId`** — there is no second
  pricing model. `BatchPricingService` + the "Pricing" tab in the admin
  `BatchForm` are how an admin sets what a batch costs, and a batch may hold
  several options at once (a monthly subscription beside a one-time fee). Plan
  codes are generated from the batch name + interval, never typed.
- **A recurring plan opens a mandate, not a charge.** `createCheckout` branches
  on `isRecurringInterval(plan.interval)` into `SubscriptionService.start`, and
  the router is passed `recurring: true` so only a gateway that can actually
  mandate that method is a candidate. The provider bills each cycle; we mirror
  its state from webhooks and never charge on our own clock.
- **Discounts are the ONE mechanism that changes what someone pays.** A launch
  code, a UPI-only offer and a batch deal are the same `Discount` row with a
  different scope (`planIds` / `batchIds` / `methods`). The arithmetic is
  `computeDiscount` in `@nexa-chess/types`, shared with the checkout preview.
  **Tax is charged on the DISCOUNTED subtotal** — taxing the list price would
  overcharge. A code is re-resolved server-side at checkout; the client's figure
  is never trusted, and an invalid one is simply not applied rather than
  refusing the purchase.
- **A code is consumed at CAPTURE, not at checkout** — `DiscountService.redeem`
  runs in the capture transaction, idempotent on the unique `orderId`, so an
  abandoned cart never burns a limited code and a replayed webhook never
  consumes a second use.
- **Per-method switches live in `PaymentRoutingConfig.methodSettings`** (a
  *partial* record — an absent method is enabled, so adding one never silently
  disables it). `isMethodEnabled` gates the router AND the picker, so one switch
  takes a method out everywhere. A plan's `allowedMethods` then narrows further;
  it can restrict but never widen.
- **None of these models are soft-deletable** and none are Trash-registered — a
  financial record is never trashed. Plans archive (`isActive: false`) instead.
- Every gateway is optional. Unset credentials ⇒ that adapter reports
  `isConfigured()` false, the router skips it, and the checkout screen stops
  offering the methods only it could serve. With none configured the API still
  boots and a checkout attempt is a clean 503.
- **Manual / offline payments (cash, a coach's personal UPI/GPay, bank
  transfer) are tracked the same way without a gateway.**
  `apps/api/src/payments/manual-payment.service.ts` builds an ordinary
  `Order` + `Payment` (`provider: MANUAL`, never routed to by
  `PaymentRouterService` or given a provider adapter) and reaches `PAID`
  through the SAME `PaymentService.applyProviderState` funnel a gateway
  capture uses — same entitlement, same invoice, same `PAYMENT_RECEIVED`
  message. Admin → Payments → "Manual payments" (`ManualPaymentsPanel.tsx`);
  coach → Payments (`/coach/payments`, `CoachManualPaymentsClient.tsx`),
  scoped to their own batches via `BatchCoach`/`BatchStudent`. **A coach's
  record is `PENDING` until an admin approves it** (`ManualPaymentRecord`,
  its own approval workflow, not soft-deletable/Trash-registered like the
  rest of this module) — **an admin's own record is auto-approved**. The
  offline method itself (Cash, UPI/GPay, …) is an admin-managed catalogue
  (`OfflinePaymentMethod`, seeded lazily on first read), not hardcoded. An
  optional proof-of-payment attachment (screenshot or PDF) is stored the
  same private/authenticated way as an invoice PDF
  (`manual-payment-attachment.storage.ts`) and streamed back through the API.
  **Never refundable through this system** — `verify`/`reconcile`/`retry`
  and `RefundService.create` all reject provider `MANUAL` with a clear error
  instead of the opaque "no adapter registered" a bare `ProviderRegistry`
  lookup would otherwise produce. The shared `PaymentSource` type
  (`RAZORPAY | CASHFREE | STRIPE | MANUAL`, in `packages/types/src/
  payments.ts`) is deliberately kept separate from the narrower
  `PaymentProvider` (the 3 routable gateways) — only fields that reflect an
  actual stored payment/refund/subscription widen to `PaymentSource`;
  routing, checkout handoff and gateway health stay on `PaymentProvider` and
  never see `MANUAL`.

## 3.6g Invoices, PDFs and credit notes

`apps/api/src/payments/invoice*.ts` + `credit-note.service.ts` +
`billing-profile.service.ts`, `apps/web/src/features/invoices/`, pages
`/student/billing/invoices/[id]` and `/admin/finance/invoices`, routes
`API_ROUTES.invoices.*` / `.adminInvoices.*`.

- **The line item names what was actually bought.** `describePurchase`
  (payment.service.ts) builds it from the plan name + the batch the plan prices
  + the billing interval — a batch plan is usually named "Term fee", which alone
  tells a parent nothing. It is copied onto the invoice, so a later plan rename
  never rewrites an issued receipt, and it is **deliberately defensive**: it runs
  inside the capture transaction, so a missing field costs a nicer label, never
  the payment.
- **An invoice is a frozen snapshot.** `InvoiceService.issue` copies the lines,
  the buyer's billing identity, the seller's registered details and the whole
  tax split onto the row inside the capture transaction. Nothing is resolved by
  joining a live plan, profile or settings row afterwards — a receipt downloaded
  a year ago must render identically today. Idempotent on the unique `orderId`.
- **The tax engine lives in `@nexa-chess/types` (`invoices.ts`)** —
  `resolveTaxTreatment`, `computeTax`, `computeCreditBreakdown`,
  `sumInvoiceLines`, `formatDocumentNumber`, `isValidGstin`,
  `stateCodeFromGstin`. Use them, don't reimplement, or the admin preview stops
  matching the issued document. **Never assume CGST+SGST or IGST**: the
  treatment is derived from the seller's and buyer's place of supply, and a sale
  abroad is a zero-rated export whatever the plan's rate says. Tax is charged on
  the **discounted** subtotal.
- **PDF generation NEVER touches the payment (§20).** It runs after the capture
  commits, on the BullMQ `invoice` queue. A failure sets `pdfStatus: FAILED` and
  leaves the financial `status: PAID` alone; `sweepFailedGenerations` (10 min,
  job lock `invoice.pdf-sweep`) retries, and a download of a missing archive
  re-renders on the spot. Do not move generation into the capture transaction.
- **The queue is a nudge, not the source of truth.** `pdfStatus` + the sweep is
  what guarantees a PDF exists; BullMQ just means a restart mid-render does not
  lose the work. With `REDIS_URL` unset the service renders **inline** rather
  than letting `createDisabledQueue` drop the job. **A `jobId` must not contain
  a colon** — BullMQ joins its Redis keys on `:` and rejects one ("Custom Id
  cannot contain :"), which silently breaks every enqueue; the helpers in
  `invoice-queue.ts` use `--`.
- **WhatsApp delivery goes through `MessagingDispatchService`, never
  `WhatsAppService` directly** (§3.6e). The `INVOICE_ISSUED` rule carries it.
  The PDF is uploaded to Meta at dispatch time and the media handle is stored on
  the outbox row, so the delivery worker attaches a real document rather than a
  link — and the worker never has to reach back into the payments module to
  build one. Upload only happens when the rule actually enables WhatsApp; a
  failure degrades to the link. The message is addressed to the invoice's
  `billingPhone` (the parent), not the account's number.
- **pdfmake, not headless Chrome** (`invoice-pdf.service.ts`). Egress' Chromium
  already competes for this box's two vCPUs. pdfmake's table paginates itself
  and its bundled Roboto has real ₹ / € / £ / • glyphs — no extra font ships.
- **Storage is private and optional.** Cloudinary `type: "authenticated"`,
  `resource_type: "raw"`. There is no permanently-public URL for a financial
  document, and downloads always stream through the authenticated API route.
  With `CLOUDINARY_*` unset nothing is archived and PDFs render on demand.
- **A refund never edits an issued invoice (§19).** `recordRefund` only moves
  `amountRefunded` + `status`; the reversal is a separate numbered `CreditNote`,
  idempotent on the unique `refundId`, with tax reversed proportionally.
- **The invoice email is claimed before it is sent.** `emailSent` is set by a
  conditional `updateMany` *before* the send, so two redelivered webhooks
  produce one email; a failed send releases the claim for the retry sweep.
- **Billing identity is its own row.** A student is usually paid for by a
  parent, so `BillingProfile` → `StudentProfile.parent*` → the account is the
  resolution order. Never bill a student invoice to the student's own profile
  without checking.
- **Business details are `InvoiceSettings`, never template constants** — a
  singleton seeded from the legacy `PAYMENTS_*` env vars on first read, edited
  at Admin → Invoices → Billing & invoicing.
- `Invoice`, `CreditNote`, `InvoiceSettings`, `InvoiceAuditLog` and
  `BillingProfile` are **not soft-deletable** and not Trash-registered — a
  financial record is never trashed.

## Guide: how payments work

Provider-agnostic checkout across **Razorpay**, **Cashfree** and **Stripe**,
UPI-first for India and card/wallet-first internationally. Business logic only
ever talks to `PaymentService`; a `PaymentRouter` picks the gateway, so adding a
fourth provider means writing one adapter and registering it — nothing else
changes.

```
PaymentService
      ↓
PaymentRouter                 ← admin-editable rules, /admin/payments → Gateways
      ↓
Razorpay │ Cashfree │ Stripe  ← apps/api/src/payments/providers/
```

### What each gateway is for

| Gateway | Role | Methods |
|---|---|---|
| Razorpay | Primary, India | UPI (intent/QR/collect via Checkout), cards, net banking, wallets, EMI, subscriptions |
| Cashfree | Secondary India / UPI failover | UPI, cards, net banking, wallets, EMI |
| Stripe | International | Cards, Apple Pay, Google Pay, Stripe-supported local methods, multi-currency, subscriptions |

**The app never touches a card number, CVV, UPI PIN or bank credential.** Every
one is entered on the gateway's own surface: Razorpay and Cashfree open their
SDK modal, Stripe redirects to a hosted Checkout Session. The only gateway value
that reaches a browser is a publishable key or a single-order session token, and
the API supplies it in the checkout response — nothing is baked into the web
build.

### Configuration

Each gateway is independent and optional. Unset credentials make that adapter
report itself unconfigured: the router skips it and the checkout screen stops
offering the methods only it could serve. With none configured the API still
boots — the catalogue and billing history read fine, and a checkout attempt is a
clean 503. See `.env.example` for the full block, including which webhook events
to subscribe to.

```env
PAYMENTS_ENABLED=true
PAYMENTS_MODE=sandbox          # selects provider hostnames only
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
CASHFREE_APP_ID=
CASHFREE_SECRET_KEY=
CASHFREE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Webhook endpoints to register in each dashboard:

```
POST https://<api-host>/payments/webhooks/razorpay
POST https://<api-host>/payments/webhooks/cashfree
POST https://<api-host>/payments/webhooks/stripe
```

### Pricing a batch

An admin sets what a batch costs from the batch itself: **Batches → (a batch) →
Pricing**. A batch can carry several price options at once — a monthly
subscription beside a one-time fee — each with its own tax, access length and
allowed payment methods.

```
Batch "Intermediate B"
├─ Monthly       ₹999   + 18% GST   UPI, Cards      → subscription
└─ Lifetime    ₹4,999   + 18% GST   all methods     → one-time
```

Those options **are** `Plan` rows carrying the batch id — there is deliberately
no second pricing model, so the checkout, the invoice, the entitlement and the
admin's idea of "what this batch costs" are all the same object. Plan codes are
generated from the batch name and interval; nobody has to invent one.

Changing a price never re-prices anything already sold: an order freezes its
amounts at checkout and a subscription freezes its amount at subscribe time.

### One-time vs subscription

`ONE_TIME` takes a single payment. `MONTHLY`, `QUARTERLY` and `YEARLY` open a
**mandate at the gateway** instead — the provider bills each cycle and we mirror
its state from webhooks, never charging on our own clock. The router is told the
plan recurs and only considers a gateway that can actually mandate the chosen
method, which is why §13's warning matters: net banking and most wallets cannot
hold a mandate, so they are not offered for a recurring plan.

Members cancel from **Billing**, and cancelling at period end keeps the access
they already paid for.

### Payment methods, twice over

Two independent controls, and they only ever narrow:

| Where | Scope | Use it for |
|---|---|---|
| **Payments → Gateways → Payment methods** | Platform-wide | Turning a method off everywhere, and rewording its checkout line |
| **A batch's price option → Payment methods** | One price option | "This plan is UPI-only" |

A method is offered only if *both* allow it and a configured gateway can serve
it. A method absent from the platform-wide map is **enabled** — adding a new
method to the codebase never silently disables it on an existing install.

### Discounts

**Payments → Discounts.** One mechanism covers every kind of offer, because a
launch code, a UPI-only deal and a batch-specific promotion are the same object
with a different scope:

| Field | Effect |
|---|---|
| `PERCENTAGE` / `FIXED` | 25% off, or ₹500 off. A percentage can be capped |
| `methods` | How "10% off on UPI" is expressed — the code only prices once that method is chosen |
| `batchIds` / `planIds` | Restrict to certain batches or price options |
| `minOrderAmount` | Minimum order value |
| `startsAt` / `endsAt` | Validity window |
| `maxRedemptions` / `maxPerUser` | Total uses, and uses per account |

Rules that shape the implementation:

- **Priced server-side, always.** The checkout preview runs the same
  `computeDiscount` the server does, but the order's `discountAmount` only ever
  comes from a fresh server-side resolve. A code that expired between preview
  and pay is simply not applied — the purchase still goes through at the honest
  price rather than failing.
- **Tax is charged on the discounted subtotal.** Taxing the list price would
  overcharge the buyer by the tax on money they never paid.
- **A code is consumed when money arrives, not when a checkout opens.** An
  abandoned cart never burns a limited code, and a replayed webhook never
  consumes a second use (the redemption is unique per order).
- A code can never make an order negative — one worth more than the order makes
  it free.
- The receipt shows the discount as its own negative line, naming the code, so
  a member can see both what they paid and what they saved.

Deleting a code that has already been claimed **deactivates** it instead: the
orders that used it point at the row, and a receipt has to keep making sense.

### The rule that shapes everything

**The payment gateway is not the source of truth for access.** A frontend
saying "success" grants nothing, and neither does a gateway status on its own:

```
Provider → server-side verification → Payment → Order → Entitlement → access
```

Only an `Entitlement` row unlocks anything, it is written inside the same
transaction that marks the payment PAID, and it is unique per `(orderId,
planId)` — so a replayed webhook, a status-check and a reconciliation sweep all
converge on one grant and one batch enrolment.

### Money

Always **integer minor units** (paise, cents) in `Int` columns — never a float,
never a Decimal a rounding bug can shave. `toMinorUnits` / `toMajorUnits` /
`formatMoney` in `@nexa-chess/types` are the only conversions; Cashfree, which
speaks rupees, converts at its adapter boundary and nowhere else.

### Duplicate and double-charge protection

| Hazard | What stops it |
|---|---|
| Double click, refresh, back/forward, second tab | Unique index on `orders.idempotencyKey`; the client holds one key per plan in `sessionStorage` and the server replays the original order |
| Webhook delivered twice | Unique `(provider, eventId)` on `payment_webhook_events` — the redelivery collides on insert |
| Out-of-order webhooks | `PAYMENT_STATUS_RANK`: a status may only move forward, so a stale `PENDING` (or a sibling attempt's `FAILED`) cannot un-pay a captured payment |
| Benefit granted twice | Unique `(orderId, planId)` on `entitlements` |
| Retry against another gateway | Off by default (`failoverEnabled`). A provider is only excluded after its attempt reached a *settled* failure — never while it is unclear whether money moved |
| Browser closed mid-payment | The reconciliation cron asks the gateway directly and applies the answer through the same funnel |
| Wrong amount captured | Parked at `PROCESSING` with `amount_mismatch`; access is withheld for review |

### Refunds

Admins refund in full or in part from `/admin/payments`. A refund is **never**
marked complete because the provider's API accepted the request — only a webhook
or a reconciliation read settles it. A *transport* failure deliberately leaves
the refund PENDING rather than FAILED, because the gateway may have taken it and
"failed" invites a second refund for the same money.

### Manual / offline payments

Cash, a coach's personal UPI/GPay, or a bank transfer collected outside the
app — tracked the same way as a gateway payment, without one. An admin or a
coach records it from **Payments → Manual payments** (admin) or **Payments**
(coach, scoped to their own batches). It never goes through `PaymentRouter` or
a provider adapter: `ManualPaymentService` builds an ordinary `Order` +
`Payment` (`provider: MANUAL`) directly and reaches `PAID` through the exact
same `PaymentService.applyProviderState` funnel a gateway capture uses, so the
entitlement, invoice and `PAYMENT_RECEIVED` message are unchanged code paths.

- **A coach's record is `PENDING` until an admin approves it.** Approving
  reaches `PAID`; rejecting reaches `FAILED` with a reason the coach can see —
  both through `applyProviderState`, so nothing about the access/invoice/
  messaging logic is duplicated. **An admin's own record is auto-approved.**
- **The offline method (Cash, UPI/GPay, bank transfer, …) is an
  admin-managed catalogue** (`OfflinePaymentMethod`), not a hardcoded list —
  deactivate instead of delete once a record references one.
- **A record can carry an optional proof-of-payment attachment** (a
  screenshot or a PDF receipt), stored the same private/authenticated way as
  an invoice PDF (`manual-payment-attachment.storage.ts`) and streamed back
  through the API, never a bare Cloudinary URL.
- **Never refundable through this system** — there is no gateway to call.
  `verify`/`reconcile`/`retry`/refund all reject provider `MANUAL` with a
  clear error rather than the opaque "no adapter registered" a missing
  `ProviderRegistry` entry would otherwise produce.
- **A coach only ever sees the manual entries they themselves submitted** —
  never a student's online payment history. Money between a student and the
  academy otherwise stays admin-only, unchanged.

### Invoices and credit notes

Issued once, inside the capture transaction, numbered gaplessly per Indian
financial year (April–March, IST) from `InvoiceSequence` in the GST Rule 46
format `INV/26-27/00001` (≤16 characters; the admin prefix is at most 4
letters, digits or hyphens; a number that would pass 16 shortens its year to
`INV/26/100000` rather than truncate the sequence); credit notes the same from `CreditNoteSequence`
(`CN/26-27/00001`). File names and storage keys turn `/` into `_`. Document
dates print in IST (`DEFAULT_TIME_ZONE`), so a 00:30 IST payment carries
that day's date.
Everything the invoice asserts —
line items, the buyer's billing identity, the seller's registered details, the
tax split — is **frozen onto the row at issue time**, so a receipt someone
downloaded a year ago renders identically today.

**The line names the purchase**, not just the plan: a batch's price is a `Plan`
usually called something like "Term fee", so the line is built as
`<plan> — <batch> (<interval>)` — "Term fee — Saturday Intermediate (Monthly)".
That string is copied at issue time, so renaming or deleting the plan later
never rewrites a receipt someone already downloaded.

**PDFs** are rendered server-side with **pdfmake** (`invoice-pdf.service.ts`),
not headless Chrome: this box already runs LiveKit egress' Chromium during
recordings and a second browser competing for two vCPUs is how a class loses its
recording. pdfmake's table primitive paginates on its own, and the Roboto it
bundles carries real glyphs for ₹, €, £ and •, so no extra font ships in the
image. A printable HTML version is served alongside for anyone who would rather
print.

**Storage is private.** A rendered PDF is archived to Cloudinary as an
`authenticated` `raw` asset (`invoice-storage.service.ts`) — there is no
permanently-public URL for a financial document. Downloads always stream through
the authenticated API route, so changing the id in the URL reaches someone
else's invoice only if you are an admin. Cloudinary is **optional**: with the
credentials unset nothing is archived and PDFs are rendered on demand instead,
so local dev needs no account.

**Rendering runs on BullMQ** (`invoice` queue, `invoice.processor.ts`). The
capture enqueues a job keyed on the invoice row, so two redelivered webhooks
collapse into one render, and a container restarted mid-render picks the work
back up instead of losing it. Queues are optional as everywhere else: with
`REDIS_URL` unset the service renders inline rather than letting
`createDisabledQueue` drop the job, so `npm run dev:api` still works without
Docker. `pdfStatus` remains the source of truth and the sweep remains the net —
the queue is a nudge.

**A failed render never touches the payment.** Generation runs *after* the
capture commits. A failure parks the invoice at `pdfStatus: FAILED` — the
financial `status` stays `PAID` — and the retry sweep picks it up. If the
archive is missing when someone asks for their receipt, it is re-rendered on the
spot, so a background failure is invisible to the customer.

**The invoice is delivered on WhatsApp as the PDF itself**, not a link. Once the
render succeeds, the `INVOICE_ISSUED` messaging rule fires through
`MessagingDispatchService` like every other outbound message. When the rule has
WhatsApp enabled, the PDF is uploaded to Meta first and the resulting media
handle is attached to the outbox row, so the delivery worker sends a `document`
message (or a template with a DOCUMENT header, when the rule names one) and a
parent receives the receipt in the chat. Nothing is uploaded for an in-app-only
rule, and a failed upload degrades to the download link in the body rather than
dropping the message. It is addressed to the **invoice's** billing phone — the
parent — not the student's account number.

**Tax** is computed by the shared engine in `@nexa-chess/types`
(`invoices.ts`): `resolveTaxTreatment` decides CGST+SGST (intra-state),
IGST (inter-state) or zero-rated export from the seller's and buyer's place of
supply — never assumed — and the admin preview calls the same function the
server does. Tax is always charged on the **discounted** subtotal.

**A refund never edits the invoice.** It records `amountRefunded` and moves the
status; the document that accounts for the reversal is a separate, numbered
`CreditNote` (`CN/26-27/00001`), idempotent on the unique `refundId`, with
tax reversed in the proportion it was charged.

**Business details are configuration**, never constants in the template:
Admin → Invoices → Billing & invoicing (`InvoiceSettings`, a singleton seeded
from the legacy `PAYMENTS_*` env vars on first read).

Surfaces: student `/student/billing` (invoices, credit notes, billing details)
and `/student/billing/invoices/[id]`; admin `/admin/finance/invoices` with
per-currency roll-ups, filters, CSV export, PDF retry, email resend and the
audit trail. Routes are `API_ROUTES.invoices.*` / `.adminInvoices.*`.

### Background work

| Job | Cadence | What it does |
|---|---|---|
| `PaymentReconciliationService.sweep` | 5 min (job lock `payments.reconciliation`) | Asks each gateway about in-flight payments; expires unpaid orders past their TTL |
| `PaymentWebhookService.recoverFailedEvents` | 10 min | Replays stored webhook events whose handler threw |
| `InvoiceProcessor` (BullMQ `invoice` queue) | on demand | Renders + archives an invoice or credit-note PDF, then emails and WhatsApps it. 5 attempts with exponential backoff; failures kept 7 days |
| `InvoiceGenerationService.sweepFailedGenerations` | 10 min (job lock `invoice.pdf-sweep`) | Retries failed/pending invoice PDFs, and reclaims rows stuck `GENERATING` over 15 min |
| `RefundService.reconcilePending` | 30 min | Reads the gateway for refunds it has not reported on |
| `InvoiceGenerationService.sweepUnsentEmails` | 30 min | Re-sends invoice emails that failed after a successful render |
| `EntitlementService.expireLapsed` | hourly | Marks entitlements past `endsAt` as expired |
| `ProviderHealthService.pruneOldEvents` | daily | Trims provider telemetry past 30 days |

### Verifying it

Unit tests run with the rest of the suite (`npm run test -w apps/api`) and cover
the status machine, routing, signature verification, status mapping, the capture
funnel, entitlements and refunds.

Two database-backed checks go further. They need a built `dist` and a seeded
database, and they clean up everything they create:

```bash
npm run build -w apps/api && npm run db:seed
npm run test:payments:integration -w apps/api   # capture → entitlement → invoice → enrolment
npm run test:payments:webhooks -w apps/api      # real signed webhooks from all three gateways
npm run test:payments:pricing -w apps/api       # batch pricing, discounts, discounted tax
```

The webhook check signs payloads with each gateway's own scheme (Razorpay hex
HMAC, Cashfree base64 HMAC over timestamp+body, Stripe `t=`/`v1=` with its
tolerance window), so it exercises the real verification code — including that a
forged signature, a replayed Cashfree timestamp and an expired Stripe signature
are all rejected.

### Admin dashboard

`/admin/payments` — revenue (net of refunds, bucketed in the admin's own
timezone), a filterable transaction table with CSV export, refunds,
subscriptions, the plan catalogue, discount codes, gateway health, the
per-method switches and the routing rules. The
routing preview runs the same `resolvePaymentProvider` the server does, so what
an admin sees is exactly what a checkout would pick.

Adding a plan there is what makes anything buyable: a plan carries its price,
currency, billing interval, tax percent and — optionally — the batch a
successful purchase enrols the student into. For a batch, pricing it from the
batch's own **Pricing** tab is usually easier (see above).
