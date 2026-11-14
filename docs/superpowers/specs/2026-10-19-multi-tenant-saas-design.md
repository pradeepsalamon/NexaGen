# Multi-tenant white-label SaaS — design

Date: 2026-10-19. Status: **design, awaiting owner approval**.

This document records what the owner decided and what this programme must
build. The technical architecture it builds on is
[docs/SAAS_MULTI_TENANCY.md](../../SAAS_MULTI_TENANCY.md) (the "architecture
doc"); where the two disagree, **this document wins**, and the overrides are
listed in §11. Plans, features and limits as they exist today are in
[docs/SAAS_PLANS.md](../../SAAS_PLANS.md).

Items marked *(builder's call)* were decided by Claude during design, not by the
owner; the owner may revisit them.

---

## 1. Intent

Nexa Chess today is one academy's platform. The owner wants it to become a
platform that **many independent chess academies** run on, from **one shared
deployment and one shared database**, where:

- each academy looks like its own product: its own address, its own brand, no
  sign of Nexa anywhere;
- each academy's data is completely separate from every other academy's;
- the owner (platform owner) creates academies and controls, without a
  developer, what each one pays and gets: plans, prices, features, limits and
  the content it can use;
- each academy collects its students' fees into its **own** payment account,
  and pays the owner for its plan.

No specific second academy is signed yet. The platform must be ready for any
academy, so everything commercial (plans, prices, features per plan, limits,
content per plan, one-off deals) is configurable at runtime.

Nexa itself becomes the first academy on the platform. Its students and staff
must notice no change.

## 2. Goals

1. **Shared tenancy.** One deployment, one database, one schema. Every
   academy-owned row carries its academy; every request runs in exactly one
   academy; nothing crosses.
2. **Platform console** where the owner manages academies, plans, features,
   limits, content packs, custom deals, domains, subscriptions and support
   access.
3. **Addresses.** Every academy gets `<slug>.nexachess.in` automatically and may
   also have any number of full domains (`learn.acme.com`).
4. **Full white-label.** On an academy's addresses, students and staff see only
   that academy's name, logo, colours and wording.
5. **Money, two flows.** Academies pay the owner (platform billing); students pay
   their academy into the academy's own gateway account.
6. **Nexa unchanged.** `nexachess.in` keeps working as today with Nexa's brand,
   data, payments and logins.

## 3. Non-goals (not in this programme)

- Separate deployments or databases per academy (explicitly rejected by the owner).
- Self-serve academy sign-up. Only the owner creates academies.
- One login shared across academies, or an academy switcher.
- Automatic TLS / certificate issuance for custom domains. The owner configures
  DNS, certificates and the proxy on the VPS by hand.
- Customer-supplied CSS or JavaScript.
- Sending email from an academy's own email domain (later; see §7.4).
- Deleting a whole academy (suspend/reactivate is in scope; deletion is later).
  *(builder's call)*
- Scaling beyond the single VPS. Capacity is a known risk (§10), not solved here.

## 4. Anti-goals (failure even if it "works")

- **Any** academy can see, change, or infer another academy's data: through a
  route, a list, a search, a cache, a job, a file URL, a live-class token, an
  export or an email.
- A Nexa student or coach is logged out, loses data, or sees anything different.
- The word "Nexa", Nexa's logo, or Nexa's colours appear anywhere in another
  academy's pages, email content, PDFs or authenticator entry. **Accepted
  exceptions (owner decision):** the platform domain `nexachess.in` in academy
  subdomains and the shared email sender address; the owner's
  company name on the plan checkout and on the owner's plan invoices to academies.
- Nexa's private puzzles, courses or student data become visible to another
  academy without the owner publishing them.
- A student's payment lands in the wrong account (the owner's or another
  academy's), or an academy's plan payment lands anywhere but the owner's account.
- A plan change silently deletes an academy's data.

## 5. Constraints

- **India only for now (owner decision):** every academy is Indian, prices and
  payments are INR, tax is the existing GST engine made per-academy. Other
  countries/currencies are a later programme; don't generalise the tax engine.

- Every rule in `CLAUDE.md` holds (no auth guards; `authenticateUser`;
  `API_ROUTES`; money in integer minor units; `applyProviderState` single funnel;
  UTC storage; soft delete via `TrashRepository`; etc.).
- Production deploys continuously from `main` and rollback restores images but
  **never reverses migrations**, so every schema step is additive
  (expand/contract, architecture doc §D).
- Students are minors: platform-level analytics are aggregate-only; Sentry stays
  `user.id` + role (+ a tenant tag).
- One ARM64 VPS runs everything.
- The owner approves each phase before the next starts; nothing is merged into
  `dev`/`main` without explicit approval.

## 6. Who's who

| Person | Where they sign in | What they can do |
|---|---|---|
| **Platform owner = Nexa's super admins** | `nexachess.in`, as today | everything in §8, from a "Platform" section of Nexa's admin area; MFA always required |
| **Academy super admin / admin** | their academy's addresses | run their academy, as Nexa's admins do today |
| **Coach, student** | their academy's addresses | as today, inside their academy only |

- **Accounts belong to one academy** *(builder's call, owner delegated it)*. The
  same email may exist in two academies as two unrelated accounts with separate
  passwords, MFA and sessions. Email and username become unique **per academy**,
  not globally. There is no membership table: `User` gets a `tenantId` and
  keeps its `role`. (Overrides architecture doc §C/§E, which kept one global
  identity.)
- **No separate console address (owner decision).** Platform management lives
  inside Nexa's own admin area on `nexachess.in` and is available to **Nexa's
  `SUPER_ADMIN` accounts only**: the rule is `role === SUPER_ADMIN` **and** the
  user's academy is `tenant_nexa`. A super admin of any other academy has no
  platform powers, ever. This replaces the `PlatformStaff` row as the source of
  platform powers (the table can be retired). Nexa's admins and super admins keep
  running Nexa as today.
- Platform screens act across academies through the data layer's one explicit
  platform bypass (§7.1), never by dropping the academy filter ad hoc.

## 7. The four parts, in build order

Each part ends with a checkpoint: owner review, green `typecheck`, `lint`, unit
and integration tests, docs updated. Part 1 must be complete before any second
academy holds real data.

### 7.1 Part 1 — Foundation and separation

Follows architecture doc §D (D1–D5), §E and §J, with these decisions:

- **Tenant on every academy-owned row**, child rows included, backfilled to
  `tenant_nexa`, per the ownership matrix in architecture doc §C — except
  `User` and its per-person tables, which are now academy-owned (see §6).
- **Academy from the address.** A `TenantDomain` table maps hostnames to
  academies. The API resolves the academy from the request host (trusting
  `X-Forwarded-Host` only through `TRUST_PROXY_HOPS`); an unknown host is a
  "no such academy" page, never a fallback to Nexa.
- **Fail-closed data layer**: request-scoped tenant context + a Prisma extension
  modelled on `soft-delete.extension.ts` that scopes every query on a tenant
  model and throws when no context is set; one grep-able bypass for platform
  code; explicit tenant predicates on every raw SQL call; crons and jobs run each
  row inside its own academy's context; every cache key includes the academy.
- **Sessions bound to an academy.** A session issued on academy A's host is
  rejected on any other host. Cookies become host-only.
- **No forced logout for Nexa** during the switch. *(builder's call on how)* The
  platform domain stays `nexachess.in` (owner decision), so Nexa's existing
  `.nexachess.in` domain-wide cookies would reach every academy subdomain: the
  plan must include an explicit migration to host-only cookies, and until it
  completes the session-to-academy binding is what keeps a Nexa token useless on
  another academy's host.
- **Per-academy settings rows** for everything that is a singleton today
  (attendance policy, live-class policy, appearance, typography, puzzle scoring,
  invoice settings, payment settings, messaging rules, offline payment methods)
  and per-academy number sequences (invoices, credit notes, payslips).
- **LiveKit, Cloudinary, recordings**: academy-prefixed room names and storage
  paths, and every token / download checks the academy (architecture doc §E).
- **Proof**: the existing cross-user access suite runs as **two academies**, the
  auth-boundary suite proves a token from A fails on B's host, and a schema test
  fails any new model without a tenant column unless it is on the platform list.
- Database row-level security under a non-superuser role (architecture doc §E.4)
  is **follow-up hardening**, not required to finish Part 1. *(builder's call)*

Done when: Nexa production runs on the new code with no visible change, and a
second seeded academy on staging can't see or change any Nexa row through any of
the API's routes.

### 7.2 Part 2 — Platform console

A "Platform" section inside Nexa's admin area on `nexachess.in` (the "console"
below), visible and usable only by Nexa's super admins (§6), backed by the
existing `/platform/*` routes plus new ones. The API enforces the rule on every
`/platform/*` route; the integration suite asserts every other academy's roles,
super admins included, get 403. Every console action is written to a
platform audit log.

**Academies**

- Create an academy: name, slug (→ `<slug>.nexachess.in`), timezone, plan, first super admin's email (an invite is sent from the academy's
  address), initial branding.
- List, view, edit, suspend, reactivate.
- See usage against limits (students, coaches, batches, live classes, storage).

**Plans — fully customisable**

- Create, edit, duplicate and retire plans (retired = no new subscriptions,
  existing ones continue).
- Per plan: name, description, display order, public/hidden; price per billing
  period (monthly and yearly, integer minor units, INR only for now); trial
  length; the lapse policy (below); feature switches (every key in the
  feature catalogue); every limit (number or unlimited); content packs (§7.2.1).
- **Editing a plan applies to new subscriptions only.** Each subscription keeps
  the price, features, limits and packs it signed up on; the console offers an
  explicit "apply to existing subscribers" action that is logged per academy.
  *(builder's call — replaces today's "editing a plan re-scopes everyone")*

**Lapse policy — customisable per plan, overridable per academy (owner decision).**

- *Past-due days*: days after a missed payment with full access.
- *Grace days*: days after that in grace, then locked.
- *What still works in grace*: switches for, at least, live classes and joining
  them (with attendance), homework and puzzle attempts, students paying fees,
  chat. Admin growth (new students, coaches, batches) is always blocked in grace.
  *(builder's call on the exact switch list)*
- This replaces today's fixed "grace = GET/HEAD only" rule in
  `resolveTenantAccessMode`. Locked stays locked; nothing is ever deleted.

**Feature catalogue.** The list of features stays defined in code, because every
feature must be enforced by an API route (`SAAS_PLANS.md` rule). The console can
switch any catalogued feature on/off per plan and per academy; adding a brand-new
feature still needs a developer. Display names/descriptions in the console come
from the catalogue.

**Custom deals (per academy)**: add/remove features, override any limit,
add/remove content packs, a custom price, and a note. Shown clearly as overrides.

**Subscriptions**: move an academy between plans (now or at period end), set
status and dates, record a manual payment, and read the full history (who, what,
when, why).

**Domains**: per academy, list its addresses; add or remove a full domain; mark
one as primary (used in links and emails). See §7.3.

**Support access**: "open as support" on any academy starts a support session in
that academy:

- full access (read and write) with super-admin rights, *(builder's call;
  owner said "can control")*
- actions are recorded under a hidden **"Platform support" user that each
  academy gets on creation**, so no Nexa user id lands in another academy's rows;
  the support log names the real staff member, *(builder's call)*
- a visible "Platform support" banner on every page,
- every request logged with the staff member and a reason they typed,
- expires automatically (1 hour default),
- no per-visit approval from the academy,
- the academy's super admin can see the support-visit history.

#### 7.2.1 Content packs

- The owner groups platform content into named **content packs**. The public
  Lichess puzzle catalogue is one built-in pack; others are made by publishing
  Nexa's own puzzle folders, puzzle sets and courses (and later presets).
- **Nothing of Nexa's is shared until the owner publishes it**, item or folder at
  a time.
- Plans include packs; custom deals add or remove packs per academy.
- Academies see pack content **read-only** and can copy any item into their own
  library to edit the copy. Their own content, attempts and progress stay
  private.
- Losing a pack (downgrade) never breaks homework already assigned from it; it
  only stops new assignments from that pack.
- How pack content is stored (live reference to the published originals vs a
  snapshot taken on publish) is the builder's call, provided Nexa's unpublished
  data is unreachable from other academies.

### 7.3 Part 3 — Domains and branding

**Addresses**

- Every academy gets `<slug>.nexachess.in` on creation. Reserved slugs (`www`,
  `api`, `console`, `livekit`, `admin`, `mail`, …) are refused.
- Any number of full domains per academy, added by the owner in the console.
  The owner sets up DNS, the certificate and the proxy on the VPS; the app's job
  is to know the hostname, map it to the academy, and refuse unknown ones.
- The console shows, for a new domain, the exact proxy rule to add and a
  "check" button that confirms the domain reaches this app and resolves to the
  right academy. *(builder's call)*
- One primary address per academy: password-reset, invite and email links are
  always built from it, **never from the request's `Host` header**.

**Routing**

- The web app always calls the API **on its own address under `/api`**. Every
  host — `nexachess.in`, academy subdomains (via a wildcard server block) and
  full domains — needs the `/api` proxy rule to the same API container.
  `api.nexachess.in` stays reachable for webhooks and anything else that uses it.
  (Today's absolute, build-time `NEXT_PUBLIC_API_URL` goes away for browser calls;
  server-side rendering calls the API internally with the forwarded host.)
- LiveKit stays on one shared address for every academy.
- The request-origin (CSRF) check accepts an academy's own active domains instead
  of the static `CORS_ORIGIN` list.
- The owner receives a written VPS checklist (wildcard DNS + certificate for
  `*.nexachess.in`, per-domain server block, `/api` rule) in the docs.

**Branding, per academy**

- Name, logo (light/dark), favicon, brand colours, default theme, login-page
  image, contact details, SEO title/description, link-preview image, landing-page
  content, legal-page details. Board appearance and fonts reuse the existing
  per-academy settings.
- Colours are validated (hex, WCAG AA contrast against surface/background) and
  injected as `--rgb-*` triplets.
- Set by the owner when creating the academy; afterwards editable by the
  academy's admins **if** the plan's `customBranding` feature is on.
- **Nexa disappears everywhere on other academies**: tab titles, header, login,
  favicon, preview images, landing page, FAQ, SEO data and `llms.txt`, emails,
  PDFs (invoices, payslips, credit notes), legal pages, WhatsApp text, and the
  authenticator-app entry (issuer = the academy's name only — overrides the
  architecture doc's "Academy (NexaChess)").
- `nexachess.in` keeps Nexa's existing `/academy` marketing site; other
  academies get a generic landing page built from their branding content.

#### 7.4 Email and WhatsApp

- Email is sent from one shared platform address with the **academy's name** as
  the sender name and the academy's contact as reply-to (owner agreed). Sending
  from an academy's own domain is later.
- WhatsApp: an academy connects its **own** WhatsApp Business credentials, as it
  does its payment gateway; without them, WhatsApp is off for that academy and
  email still works. Nexa keeps today's number. *(builder's call — the shared
  Nexa number would show Nexa's business name)*

### 7.5 Part 4 — Money

**Academies pay the owner (platform billing)** — a separate module, never part of
`PaymentService` (architecture doc §G):

- Through Razorpay, Cashfree or Stripe on the **owner's** merchant account, or a
  manual payment the owner records in the console.
- Each billing period the academy's super admin pays from their academy's
  subscription page; the owner can also send a payment link. Card-on-file
  auto-debit is not in v1. *(builder's call)*
- The owner issues each academy a GST invoice under the owner's company details,
  through the shared tax engine, with its own number series.
- Missed payment: past due → grace → locked, timed and scoped by the lapse
  policy (§7.2). Nothing is ever deleted. A browser "success" never grants anything;
  only a verified webhook or a provider read does.

**Students pay their academy**

- Each academy's admins connect their **own** Razorpay / Cashfree / Stripe keys in
  their admin settings, stored encrypted per academy.
- Each academy's webhooks arrive on an address that identifies the academy and
  are verified with that academy's secret.
- No gateway connected ⇒ online payments are off; manual payments still work.
- The `studentPayments` plan feature still decides whether an academy has
  payments at all.
- Nexa's current environment credentials become Nexa's academy credentials with
  no interruption.
- Invoices, credit notes and payslips use each academy's own seller details and
  number series; payroll stays inside the academy.

## 8. What "fully customisable" covers (summary)

| Owner can, at runtime, without a developer | Needs a developer |
|---|---|
| create / edit / retire plans; prices, periods, currency, trial, grace | a brand-new feature (it must be enforced in the API) |
| turn any catalogued feature on/off per plan or per academy | a brand-new limit type |
| set any limit per plan or per academy | a new kind of content (beyond puzzles, folders, courses) |
| build content packs and assign them to plans or academies | |
| create academies, domains, branding; suspend / reactivate | |
| move academies between plans; record payments; custom prices | |
| open any academy as support | |

## 9. Testing expectations

- Two-academy versions of `cross-user-access`, `auth-boundary` and
  `admin-routes` integration suites; every existing denial row also runs across
  academies, admins included.
- A schema test fails any model without a tenant column unless listed as
  platform-wide; a test fails any unreviewed raw SQL file.
- Concurrency test at a plan limit (exactly one of two parallel creates wins),
  already present for students/batches — extended per academy.
- Duplicate / forged webhook tests for both money flows.
- A migration rehearsal on a restored production backup before the
  constraint-dropping step (architecture doc §J), with row counts and financial
  totals compared.
- Playwright: Nexa's existing e2e suite stays green; a white-label smoke test on
  a second academy's address finds no "Nexa" text.

## 10. Risks

- **Size.** Part 1 touches ~125 models, ~1,600 Prisma call sites, 80 raw SQL calls,
  19 crons. Architecture doc estimate: roughly 6–9 months for everything; Part 1
  alone 2–3 months.
- **Single VPS capacity**, especially live video, as academies are added.
- **Manual domain setup** by the owner is a per-academy ops step; a mistake there
  shows up as an "unknown academy" page, not a data leak.

## 11. Overrides of the architecture doc

| Architecture doc | This design |
|---|---|
| Global user identity + `TenantMembership` (§C, §E) | accounts per academy; `User.tenantId`; email/username unique per academy; no memberships |
| Self-serve onboarding wizard (§H) | owner creates academies in the console |
| Separate console host, `PlatformStaff` only (§B, §I) | no console host; platform section in Nexa's admin area, Nexa `SUPER_ADMIN`s only |
| Caddy on-demand TLS / Cloudflare, TXT verification (§H, §N-1) | owner configures the VPS by hand; app maps hostnames and offers a reachability check |
| Student payments for other tenants offline-only in v1 (§G) | each academy brings its own gateway in this programme |
| MFA issuer "Academy (NexaChess)" (§F) | academy name only |
| Support access read-only by default, optional owner approval (§I) | full access, logged, auto-expiring, no approval |
| Editing a plan re-scopes everyone (SAAS_PLANS.md "Not yet") | subscriptions keep what they signed up on; explicit "apply to existing" |
| Answers to §N | §N-1 manual VPS, platform domain stays `nexachess.in`; §N-3 per-academy accounts; §N-5 lapse policy customisable per plan/academy; §N-11 India/INR/GST only; §N-6 content packs; §N-7 own gateway per academy; §N-8 shared sender, own WhatsApp; §N-10 no approval |

Still open from architecture doc §N (not blocking Part 1): §N-2 hosting capacity
plan, §N-9 SVG logos and which branding items are plan-gated, §N-11
post-deletion retention, §N-12 tenant-facing
terms and data processing agreement.
