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
