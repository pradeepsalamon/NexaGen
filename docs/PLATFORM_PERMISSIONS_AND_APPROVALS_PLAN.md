# Platform permissions and admin approvals — master plan

Status: **in progress** (started 2026-11-01). Owner decisions are recorded in §1.3.
This is the living plan. Each stage updates §7 "Progress" in the same change.
The per-resource policy as built stays in [AUTHORIZATION.md](AUTHORIZATION.md);
this file is the target model, the roadmap and the record of what changed.

Contents: 1 Business requirements · 2 Architecture · 3 Current-state findings ·
4 Permission and approval rules · 5 Roadmap · 6 Testing and security
requirements · 7 Progress · 8 Outstanding decisions.

---

## 1. Business requirements

### 1.1 Core principle

Coaches run their **assigned** batches, students and classes efficiently.
They never, on their own, override an academy-level decision, an
admin-controlled setting, an important student permission or a privileged
operation. Anything beyond a coach's assigned authority is an **admin request**
that an admin approves. Normal teaching never waits for an admin.

### 1.2 Authority

| Role | Authority |
|---|---|
| Super Admin | Platform administration: admins, coach applications, backups, trash, data retention, demo classes, AI. Plus everything an Admin does. |
| Admin | Academy-wide management, policies, and **approval authority**. Never approves their own request. Never overrides consent. |
| Coach | Operational management of assigned batches, students and classes, within academy policy. |
| Student | Their own permitted preferences and information. |
| Parent/Guardian | Authority over their child's permissions and privacy, **once a verified guardian identity and consent records exist** (§2.8). Not built. |

### 1.3 Owner decisions (2026-11-01)

| Topic | Decision |
|---|---|
| Live classes | Admins can lock individual live-class settings. Coaches change unlocked settings only and never override a locked academy policy. Covers recording, waiting room, cameras, microphones, screen sharing and other applicable controls. |
| Class cancellation | More than 24 h before the class: the coach cancels directly. Within 24 h: admin approval. After the class has started: an exceptional cancellation process. Emergency reporting stays possible. |
| Students outside assigned batches | A coach can't directly add a student from outside their batches. They request admin approval, in student-access and live-class participant workflows alike. |
| Recurring schedules | Admin and Super Admin both manage them, within their scope. |
| Batch type | Keep the per-class override for now; investigate its effects (done: §3.3). |
| Privacy and consent | Admin approval never overrides legally required consent or a valid parent/student privacy objection. Guardian identity and consent are designed separately and integrated (§2.8). |

---

## 2. Architecture

The design extends what the codebase already does. It doesn't import a new
framework.

### 2.1 Enforcement stays in services

No NestJS role guards (CLAUDE.md §3.2). Every rule lives in the service:
`authenticateUser` → role check → row scope. The web hides controls for
usability only. Every rule in §4 has a backend check and a test (§6).

### 2.2 Shared rules live once, in `@nexa-chess/types`

Any rule both apps need is a pure function in `packages/types`, used by the API
(enforcement) and the web (showing the right control). Examples:
`class-availability.ts`, `resolveBatchType`, the live-settings resolver. New
ones in this plan:

| Rule | Module | Stage |
|---|---|---|
| `isParentContactChange` — when a profile save moves the guardian contact | `index.ts` | 1 ✅ |
| Live-setting locks: `LOCKABLE_LIVE_SETTINGS`, `readLiveClassLocks`, `withoutLockedFields`, `lockedFieldsChanged`, `liveClassLockSources`; `resolveLiveClassSettings({ systemLocks, batchLocks })` | `live-class-settings.ts` | 2 ✅ |
| `resolveCancellationPath(class, now)` → `DIRECT` / `APPROVAL` / `EXCEPTIONAL` / `NOT_ALLOWED` | `class-cancellation.ts` | 4 ✅ |
| Approval catalogue: action types, categories, TTLs, requester/reviewer roles, request/response contract | `approvals.ts` | 3 ✅ |

### 2.3 One approval engine, not one per module

**Decision:** build one generic engine and port existing workflows into it,
instead of adding a sixth bespoke request table.

* **Reuse:** the class-request pattern is correct and becomes the engine's core:
  a status-filtered claim, revalidation and the change itself, all in one
  `$transaction`, with messaging after commit.
* **Not reused:** its table, which is class-specific.

```
apps/api/src/approval/
  approval.module.ts, approval.controller.ts, approval.service.ts   lifecycle, auth, listing
  approval-handler.registry.ts                                       actionType → handler
  handlers/<action>.handler.ts                                       one file per action type
packages/types/src/approvals.ts                                      catalogue + Zod payload per type
```

**Handler contract.** The owning module writes the handler; the engine owns the
lifecycle.

| Member | Purpose |
|---|---|
| `actionType`, `category`, `payloadSchema` | Catalogue entry; payload validated with Zod. |
| `requesterRoles`, `reviewerRoles` | Who may ask; who may decide (ADMIN/SUPER_ADMIN, or SUPER_ADMIN only). |
| `dedupeKey(payload)` | One PENDING request per operation (e.g. `CLASS_CANCEL:<classId>`). |
| `authorize(requester, payload, tx)` | The requester's scope at creation, re-run at approval. |
| `snapshot(tx, payload)` | The "current value" stored with the request and compared at approval. |
| `execute(tx, request, reviewer)` | The change itself, in the approval transaction. |
| `assertConsent?(tx, request)` | Consent gate (§2.8), run at approval. Approval can't skip it. |
| `afterCommit?(request)` | Messaging and queues. |

**Lifecycle guarantees** (implemented once, in `ApprovalService`):

| Threat | Guard |
|---|---|
| Self-approval | `reviewerId <> requesterId`, in the claim's `where` and as a DB `CHECK`. |
| Duplicate pending request | Partial unique index `(dedupeKey) WHERE status = 'PENDING'` → 409. |
| Approval after expiry | Claim requires `expiresAt > now()`; a `JobLockService.runExclusive` cron marks rows EXPIRED. |
| Approval after cancellation, or replay | Status-filtered `updateMany` claim; count 0 → 409. A decided request never returns to PENDING. |
| State changed while pending | `authorize` re-run for the **requester** plus a `snapshot` comparison → 409 "changed since requested"; nothing executes, and the request stays reviewable so it can be rejected. |
| Partial execution | Claim, revalidation, change and event row commit together or not at all. |
| Unauthorized reviewer | Handler `reviewerRoles`. `/admin/approvals/*` is covered automatically by `admin-routes.int-spec.ts`. |

**Existing workflows:**

| Workflow | Plan |
|---|---|
| Class change requests | Ported as the first handlers (`CLASS_EXTRA`, `CLASS_RESCHEDULE`). The old table stays read-only for history (migrations are additive). |
| Manual payments | `ManualPaymentService` keeps the money path (`PaymentService.applyProviderState` stays the single funnel). Listed read-only in the same inbox and decided on its own page (Stage 5; no handler, so there is no second way to settle a payment). |
| Account deletion | Stays its own service: it's a data right, not a coach permission. It's listed in the admin inbox. |
| Coach applications, knowledge suggestions | Unchanged (different actors and semantics). Listed in the inbox. |

### 2.4 Data model (Stage 3, additive)

* `ApprovalRequest`: `id, category, actionType, status (PENDING|APPROVED|REJECTED|CANCELLED|EXPIRED), requesterId, requesterRole, batchId?, classId?, subjectUserId?, currentValue Json, requestedValue Json, reason, details Json?, urgent, dedupeKey, expiresAt, reviewerId?, decidedAt?, rejectionReason?, executionResult Json?, createdAt, updatedAt`.
  * Requester and reviewer relations are `onDelete: Restrict`; the history is retained like financial history.
  * The partial unique index and the `CHECK` are hand-written in the migration.
* `ApprovalEvent`: an append-only trail (`CREATED, APPROVED, REJECTED, CANCELLED, EXPIRED, REVALIDATION_FAILED`) with actor, timestamp and metadata. It's immutable (§2.6).
* Getters in `PrismaService`, plus a privacy-export section for requests a user made.

### 2.5 Live-setting locks (Stage 2, no migration)

`locks` is an array of lockable field paths, stored inside the existing JSON:
`LiveClassPolicy.settings` (academy) and `Batch.liveClassSettings` (batch).

* **Resolution:** a field locked at a layer ignores every lower layer's value
  for it. Order: system → batch → class; a preset is copied into the class.
* **Coach writes:** a class override that changes a locked field is refused
  with 403. This applies before the class, during it, and when applying a
  preset.
* **Snapshots and tokens:** the frozen session snapshot and LiveKit grants come
  from the same resolver, so a lock is enforced at token level too.
* **Lockable fields:** recording mode, waiting room, student mic, camera,
  screen share, chat, private chat, reactions, board, and auto-join. The coach's
  own mic and camera defaults aren't academy policy, so they can't be locked.
* **Exceptions:** an exception to a lock before the class is an approval request
  (`LIVE_SETTING_EXCEPTION`, Stage 6). During a class there are no exceptions.

### 2.6 Audit

* `trash_audit_logs` (the general audit table) and `approval_events` become
  **append-only at database level**. A trigger rejects DELETE and any UPDATE,
  except the `userId → NULL` that the foreign key performs when a user is
  purged.
* Test truncation uses `TRUNCATE`, which row triggers don't fire on.
* Administrative decisions write an audit row in the same transaction as the
  change.

### 2.7 Notifications

All through `MessagingDispatchService` (CLAUDE.md §3.6e):
* `APPROVAL_REQUESTED` → admins.
* `APPROVAL_DECIDED` → the requester.
* Existing events still fire from handlers' `afterCommit` (e.g.
  `CLASS_CANCELLED`, `CLASS_SCHEDULED`).

### 2.8 Consent and guardians (separate design, integrated by hook)

Today nothing records consent (V11) and there's no parent identity
([PARENT_REPORTS.md](PARENT_REPORTS.md)). A separate design,
`docs/CONSENT_AND_GUARDIANS.md`, must define:

* `GuardianLink` (verified parent–child link).
* `ConsentRecord { subjectUserId, purpose, grantedById, basis, grantedAt, withdrawnAt }`.
* The purposes: recording, external-account sync, AI processing, WhatsApp, marketing.
* Who may grant consent: guardian for a minor, the student when of age.

**Integration rule fixed now:** every consent-controlled action calls one
`ConsentService.assert(purpose, subject)`, inside the approval handler's
`assertConsent` as well as on the direct path. No role, approval included,
bypasses it, and a withdrawal applies to pending requests at approval time.
Until that design is approved, the hook is not wired, and the C rows in §4 stay
**not enforceable**, flagged as a risk (§8).

---

## 3. Current-state findings

Audit of `origin/main` on 2026-11-01, re-checked before each fix.
The earlier cross-user sweep is in [AUTHORIZATION.md](AUTHORIZATION.md) § Audit 2026-10-16.

### 3.1 Existing approval workflows

| Workflow | Table | Race guard | Expiry | Duplicate guard | History |
|---|---|---|---|---|---|
| Class change request | `ClassChangeRequest` (engine actions since Stage 5) | ✅ status-filtered claim | past-start only | reschedule only (EXTRA_CLASS added in Stage 1) | columns only |
| Manual payment | `ManualPaymentRecord` | ❌ → ✅ Stage 1 (V2) | ❌ | idempotency key | payment `raw` |
| Account deletion | `AccountDeletionRequest` | ✅ | ❌ | one per user | columns only |
| Coach application | `CoachProfile.approvalStatus` | n/a | ❌ | n/a | columns only |
| Knowledge suggestion | `KnowledgeArticleVersion` | versioned | ❌ | n/a | `KnowledgeArticleEvent` |

### 3.2 Vulnerabilities and their status

| # | Sev | Finding | Status |
|---|---|---|---|
| V1 | Medium | A coach's class-level live settings override the admin academy policy and batch defaults; no field can be locked (`live-class-settings.service.ts` `updateSettingsForClass`, `live-class.service.ts` `updateLiveSettings`). | ✅ Fixed, Stage 2 |
| V2 | Medium | Manual-payment approve/reject was read-then-write. Payments may go FAILED → PAID, so a concurrent reject and approve could leave a REJECTED record next to a PAID payment and a granted entitlement, or settle twice. | ✅ Fixed, Stage 1 |
| V3 | Medium | Class-request approval didn't revalidate that the requesting coach was still an active coach of a live, unarchived batch, or that a rescheduled class was still theirs. | ✅ Fixed, Stage 1 |
| V4 | Low–Med | The live-class pull roster searches every active student in the academy, and a pull admits any of them. | ✅ Fixed, Stage 4 (own batches or an approved `LIVE_CLASS_GUEST_STUDENT`) |
| V5 | Latent | Per-class `batchType` override; the payroll rate scope supports `classTypes`. | Investigated (§3.3); kept by decision |
| V6 | Low | A coach set their own `CoachProfile.hourlyRate`, which admins see as the coach's rate. | ✅ Fixed, Stage 1 |
| V7 | Low | A student (a minor) could silently change `parentEmail`/`parentPhone`, the default invoice and notice contact. | ✅ Mitigated, Stage 1 |
| V8 | — | Reported as a web/API mismatch on recurring schedules. **Re-check: false positive.** `/admin/schedule` (recurring schedules) is Admin + Super Admin on both sides. `/admin/classes` is a different page (the batch-classes report), SUPER_ADMIN on both. | ✅ Closed; decision pinned by spec |
| V9 | Low | Audit rows can be updated or deleted. | ✅ Fixed, Stage 3 (DB trigger) |
| V10 | Info | A coach can cancel their own class up to the start time. | ✅ Fixed, Stage 4 (24 h rule) |
| V11 | Info | No consent records exist. | Separate design (§2.8) |
| V12 | Info | A minor can request account deletion without a guardian. | Separate design (§2.8) |

### 3.3 Batch type: effects (investigated 2026-11-01)

`Batch.batchType` (admin default) and `CoachClass.batchType` (per-class coach
override) are resolved by `resolveBatchType` and used **only for display**:

* the coach's upcoming-class card and select;
* the student dashboard and class detail;
* the admin batch form.

They're not used by payroll, attendance, analytics (its `classType` filter is
demo vs batch), payments, invoices or messaging. The payroll compensation-rate
scope accepts `classTypes`, but no caller passes a class type
(`compensation-rate-resolution.service.ts`).

**Rule for the future:** if pay, billing or reporting ever keys on batch type,
the per-class override must become an approval request (or admin-only) in the
same change.

---

## 4. Permission and approval rules

Legend:
* **D**: direct.
* **R**: request → admin approval.
* **A**: admin-only (ADMIN + SUPER_ADMIN).
* **S**: super-admin only.
* **C**: consent-controlled and non-overridable (§2.8).
* "Own" means the coach's assigned batch or class.

| Module | Action | Coach | Admin | Student | Status |
|---|---|---|---|---|---|
| **Live classes** | Start/end own class within the start window | D | D | — | built |
| | Change an **unlocked** setting of own class | D | D | — | built |
| | Change a **locked** setting | ✗ (R before class, Stage 6) | ✗ on the class; unlock or change it at the academy/batch layer that locked it | — | Stage 2 |
| | Lock or unlock academy/batch settings | — | A | — | Stage 2 |
| | Moderate, kick, admit from waiting room (own class) | D | D | — | built |
| | Pull a student from own batch | D | D | — | built |
| | Pull or admit a student from **outside** own batches | R | D | — | ✅ Stage 4 |
| | Start/stop recording (own class) | D if unlocked (C once consent exists) | D | — | Stage 2 |
| **Scheduling** | Edit notes, topic, homework of own class | D | D | — | built |
| | Extra class / reschedule | R | D | — | ✅ engine, Stage 5 |
| | Cancel own class **> 24 h** ahead | D | D | — | ✅ Stage 4 |
| | Cancel own class **≤ 24 h** ahead | R (urgent under 6 h; admins notified at once) | D | — | ✅ Stage 4 |
| | Cancel after start ("not held") | R, exceptional, always urgent (affects attendance and payroll) | D | — | ✅ Stage 4 |
| | Recurring schedules | — | A | — | built; pinned by spec |
| | Per-class batch-type override | D (display only, §3.3) | D | — | built |
| **Batches** | Create, edit, archive, delete; assign coaches and students | — | A | — | built |
| | Batch default live settings and locks | — | A | — | Stage 2 |
| **Students and enrolment** | Read students of own batches | D | D | own | built |
| | Enrol, remove or transfer a student | R | D | — | Stage 6 |
| | Give a student from outside own batches access to own class | R | D | — | ✅ Stage 4 |
| | Edit own profile | D (pay rate is read-only, set via compensation rates) | D (any) | D | built |
| | Change parent/guardian contact | — | D | D + password + previous contact told | ✅ Stage 1 |
| **Attendance** | Automatic recording (LiveKit) | — | — | — | built |
| | Correct a student's attendance in own class | R | D (audited) | — | Stage 6 |
| | Attendance policy | — | A | — | built |
| **Coach management** | Coach assignment, approval, status | — | A (applications: S) | — | built |
| | Own pay rate (`hourlyRate`, compensation rates) | read-only | A | — | ✅ Stage 1 |
| | Request a substitute for own class | R | D | — | Stage 6 (optional) |
| **Payments and finance** | Record manual payment (own batch student) | R | D | — | built; race fixed Stage 1 |
| | Discounts, refunds, plans, invoices, payroll | — | A | own invoices | built |
| **External integrations / game sync** | Link, verify and sync own external chess account | — | — | D | built |
| | Sync or analyse a student's account on their behalf | — | A + C | — | not built; needs consent |
| **AI** | AI diagnostics and tools | — | S | — | built (mock only) |
| | Process a student's data with AI | — | S + C | — | not built; needs consent |
| **Announcements / communications** | Chat with own batch students; groups of own students | D | D | DM staff/coach | built |
| | Announcements, messaging rules, WhatsApp templates | — | A | — | built |
| **Knowledge base / content** | Suggest an article | D (submits for review) | — | — | built |
| | Publish articles, global puzzles, homework-approved folders | — | A (folders: S) | — | built |
| | Own private puzzles, assignments to own batches | D | D | — | built |
| **Account deletion / data rights** | Own data export | D | D | D | built |
| | Request own account deletion | D | D | D (C: guardian, once built) | built |
| | Complete a deletion | — | A (not own) | — | built |
| | Trash, backups, data retention | — | S | — | built |
| **Academy settings** | Live policy, attendance policy, appearance, typography, puzzle scoring, invoice settings | — | A | own preferences | built |
| **Approvals** | Approve or reject a request | — | A (never own; some types S) | — | Stage 3 |
| | View own requests, cancel own pending request | D | D | — | Stage 3 |

**Never overridable:** legally required consent and a valid parent/student
privacy objection (C rows). An admin approval runs the consent check (§2.8) and
fails if consent is missing or withdrawn.

---

## 5. Roadmap

Stages are small, isolated and tested. Each updates §7.

| Stage | Scope | Schema | Status |
|---|---|---|---|
| **1. Immediate fixes** | V2 manual-payment claim · V3 class-request revalidation (+ EXTRA_CLASS duplicate guard, coach timezone) · V6 hourly rate read-only · V7 parent-contact safeguard · V8 re-check and pin · batch-type investigation | none | ✅ done |
| **2. Live-setting locks (V1)** | `locks` in policy and batch JSON; resolver honours locks; coach class/preset/mid-class writes refused on locked fields; admin lock UI; coach UI shows locks | none (JSON) | ✅ done |
| **3. Approval engine + immutable audit (V9)** | `approvals.ts` catalogue; `ApprovalRequest` + `ApprovalEvent`; `ApprovalService` with the §2.3 guarantees; expiry cron; append-only triggers on `trash_audit_logs` and `approval_events`; privacy export | migration `20261101082355_approval_requests_and_append_only_audit` | ✅ done (backend; no action handlers yet) |
| **4. Cancellation, outside-batch students, inbox (V4, V10)** | `resolveCancellationPath`; `CLASS_CANCEL` / `CLASS_CANCEL_EXCEPTIONAL` handlers (urgent emergency flag); pull roster limited to own batches plus `LIVE_CLASS_GUEST_STUDENT`; **shipped together with** the admin inbox `/admin/requests` and coach `/coach/requests` plus `APPROVAL_REQUESTED`/`APPROVAL_DECIDED` notifications, so no coach workflow is blocked without a way to ask | enum migration `approval_notifications` (messaging events + `ADMINS` audience) | ✅ done |
| **5. Port and unify** | Class change requests ported to engine handlers (data migration, old table read-only); manual payments, account deletions and coach applications listed in the inbox | data migration `20261101100736_class_requests_into_approvals` | ✅ done |
| **6. More request types** | Enrolment/transfer, attendance correction (+ audited admin correction), live-setting exception, substitute coach | none | |
| **7. Consent and guardians** | Separate design (§2.8), then `ConsentService` wired into handlers and direct paths | migration | needs owner/legal decision |

---

## 6. Testing and security requirements

Every stage runs, for what it touched:
* `npm run typecheck -w apps/<x>` and `npm run lint -w apps/<x>`;
* `npm run test -w apps/api`;
* `npm run build -w apps/web` (web changes);
* `npm run test:integration` against a throwaway `_int` database for schema
  stages. Never `vps_dev`, never production.

Required coverage (rows are added as stages land):

| Requirement | Where |
|---|---|
| Coach can't reach another coach's batch, class or request | `cross-user-access.int-spec.ts` row for every new id-taking route |
| Coach can't modify academy settings or locks | unit specs + `admin-routes.int-spec.ts` (auto-discovers `/admin/*`) |
| Coach can't bypass an approval through the direct API | for each R action: the direct route refuses the coach (e.g. a locked setting via `PUT live-settings`, a ≤ 24 h cancel via `PATCH cancel`) |
| Unauthorized approval, self-approval | engine unit spec + DB `CHECK` int-spec |
| Duplicate, expired, cancelled, replayed requests | engine unit spec + partial-unique-index int-spec + concurrent approve‖approve and approve‖reject |
| Admin changes during a pending request | coach removed / archived / batch archived / class cancelled → 409 and nothing executes ✅ (V3: `class-request.service.spec.ts`) |
| Payment review races | ✅ `manual-payment.service.spec.ts` (approve‖reject, double approve, failed settle released) |
| Consent withdrawal | Stage 7: withdraw, then approve → refused |
| Immutable audit | int-spec: UPDATE/DELETE on audit tables raises; the user-purge `SET NULL` still works |
| Cross-tenant | N/A while single-tenant ([SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md)); add when `tenantId` lands |

---

## 7. Progress

### Stage 1: immediate security and consistency fixes (2026-11-01) ✅

* **V2:** `ManualPaymentService.approve/reject` claim the PENDING record
  (status-filtered `updateMany`) **before** touching the payment, and release
  the claim if the payment step throws. Concurrent reviews get exactly one
  winner; the loser gets 409.
* **V3:** `ClassRequestService.approve` revalidates, inside the transaction, that
  the requesting coach is still an ACTIVE coach assigned to a live, unarchived
  batch. A reschedule moves the class only if it's still that coach's. The
  clash check uses the coach's timezone (previously the admin's). Duplicate
  pending EXTRA_CLASS requests at the same time get 409. Creating a request for
  an archived batch is refused.
* **V6:** the API ignores a coach-submitted `hourlyRate` (the field is still
  accepted for older clients). The profile form no longer shows the legacy
  `CoachProfile.hourlyRate` (pay comes from `CoachCompensationRate`; Earnings
  shows it).
* **V7:** a student changing the parent email or phone must enter their current
  password. The previous parent email gets a notice that doesn't reveal the new
  contact, and an audit row (`PARENT_CONTACT_CHANGE`) is written. The shared
  rule `isParentContactChange` lives in `@nexa-chess/types`.
* **V8:** re-checked and closed as a false positive. The owner's decision
  (Admin and Super Admin manage recurring schedules) is pinned by a spec.
* **Batch type:** investigated; display-only (§3.3).

### Stage 2: live-setting locks, V1 (2026-11-01) ✅

* `@nexa-chess/types`: `LOCKABLE_LIVE_SETTINGS` (student mic, camera, screen
  share, chat, private chat, reactions, board; student auto-join; recording;
  waiting room) with labels. `resolveLiveClassSettings` takes `systemLocks` /
  `batchLocks`: an academy lock ignores the batch and class layers, a batch
  lock ignores the class layer. Snapshots and LiveKit grants use the same
  resolver, so locks hold at token level.
* Locks are stored as `locks` beside the settings in `LiveClassPolicy.settings`
  and `Batch.liveClassSettings`. **No migration**; existing parsers strip the key.
* `LiveClassSettingsService`:
  * policy and batch saves accept `locks` (admin-only, normalised in the service);
  * a class override, before or during the class, that changes a locked field
    → 403 naming the fields. This binds admins editing one class too;
  * stale-but-unchanged values and preset values for locked fields are
    stripped, not refused;
  * a batch default changing an academy-locked field → 403;
  * audit rows carry `locksBefore` / `locksAfter`.
* Web:
  * the shared settings form shows "Locked by academy/batch" (read-only);
  * the academy and batch editors have a lock toggle per field;
  * the coach pre-class, preset and in-room panels honour locks and never
    send locked fields;
  * the audit log shows lock changes.

### Stage 3: approval engine and append-only audit, V9 (2026-11-01) ✅

* Schema (one additive migration): `ApprovalRequest`, `ApprovalEvent`, enums.
  Hand-written SQL adds:
  * the partial unique index on `dedupeKey` for PENDING rows;
  * the `approval_requests_no_self_review` CHECK;
  * the `nexa_append_only` trigger on `trash_audit_logs` and `approval_events`.
    It refuses DELETE and any UPDATE except the foreign key's user→NULL on a
    hard purge (only when nested in the FK action, `pg_trigger_depth() > 1`,
    since migration `20261101091856_harden_append_only_and_extra_class_unique`).
* `apps/api/src/approval/`:
  * `ApprovalService` implements every §2.3 guarantee: catalogue roles,
    self-decision refused, duplicates → 409, expiry- and status-filtered claim
    (no replay, no approve-after-cancel or approve-after-expiry), claim +
    revalidate + execute + event in one transaction, a
    `REVALIDATION_FAILED` event when state changed;
  * an expiry cron under `JOB_LOCKS.approvalExpiry`;
  * a handler registry (`APPROVAL_HANDLERS`), currently empty, so no request
    can be made yet;
  * routes under `API_ROUTES.approvals` (requester) and
    `API_ROUTES.adminApprovals` (reviewer only; covered automatically by
    `admin-routes.int-spec.ts`).
* Privacy export: `approvalRequests` (made by the user) and
  `approvalRequestsAboutMe`.

### Review follow-ups to stages 1–3 (2026-11-01) ✅

From the CodeRabbit review of PR #125:

* **Class requests:** a RESCHEDULE for a class in an archived batch is refused
  at creation; approval share-locks (`FOR SHARE`) the batch, batch-coach and
  coach rows before revalidating, so an archive or removal waits for it; a
  partial unique index (`class_change_requests_pending_extra_class_unique`)
  backs the duplicate EXTRA_CLASS check (older duplicates are withdrawn by the
  migration).
* **Manual payments:** approving an APPROVED record whose payment isn't PAID
  (a process died between claim and settle) now finishes the settlement.
* **Live-setting locks:** policy, batch and class writers each run in one
  transaction with the audit row, take row locks policy → batch → class and
  re-read the lock lists under them; a batch's value and lock under a later
  academy lock are kept; the 403 names the locking layer; the form never offers
  waiting room ENABLED against a locked student auto-join ENABLED (or the
  reverse).
* **Parent contact (V7):** the audit row is written inside the profile
  transaction; the notice is the `PARENT_CONTACT_CHANGED` system message
  (editable at `/admin/messaging`) and no longer claims the old address stops
  getting notices; the avatar upload/remove handlers stop before touching the
  stored image when the save would need a password that wasn't entered.
* **Audit tables:** a direct `userId`/`actorId` → NULL is refused; only the
  FK's own SET NULL may do it.
* Not changed, with reasons: explicit `createdAt` on approval rows (Prisma
  fills `@default(now())` client-side in UTC, verified against an
  `Asia/Kolkata` session); locks in a dedicated column (the JSON writers are
  all lock-aware now; revisit only if a pre-lock rollback image is ever
  deployed); a durable outbox for the parent notice (the outbox only mails
  accounts, and the old parent email is a typed address: R3 below).

### Stage 4: cancellation, outside-batch students, inbox, V4 + V10 (2026-11-01) ✅

* `@nexa-chess/types` `class-cancellation.ts`: `resolveCancellationPath` —
  `DIRECT` more than 24 h ahead, `APPROVAL` within 24 h, `EXCEPTIONAL` once the
  start has passed or the class is running, `NOT_ALLOWED` when cancelled or
  completed.
* `CoachService.cancelClass` takes only `DIRECT` (403 otherwise, naming the
  request to make) and is now status-filtered.
* Handlers in `apps/api/src/approval/handlers/`:
  * `CLASS_CANCEL` / `CLASS_CANCEL_EXCEPTIONAL` (`class-cancel.handler.ts`):
    shared dedupe key `CLASS_CANCEL:<classId>`; a regular request expires at the
    class start and is urgent under 6 h, an exceptional one is always urgent;
    revalidation row-locks the class and re-checks the coach (owner, ACTIVE),
    the start time and the status; a running class must be ended before an
    exceptional approval, and a COMPLETED one can't be cancelled; the cancel is
    status-filtered and `CLASS_CANCELLED` goes out after commit.
  * `LIVE_CLASS_GUEST_STUDENT` (`live-class-guest-student.handler.ts`): for a
    student outside the coach's live batches, for one class, expiring at its
    end. The APPROVED request is the grant; if the class is live at approval,
    the pull is sent on the coach's behalf.
* V4: `LiveClassPullService` lets a coach pull only students of their own live
  batches or an approved guest for that class (403 otherwise). Search still
  finds other students, flagged `needsApproval` / `approvalPending` with
  presence hidden, so the coach can ask.
* Notifications: `APPROVAL_REQUESTED` (every ACTIVE reviewer, never the
  requester; new audience `ADMINS`) and `APPROVAL_DECIDED` (requester, on
  approve, reject or expiry), enabled and in-app only. Migration
  `approval_notifications`.
* Web: `/admin/requests` (inbox: filter, urgent badge, approve with an optional
  note, reject with a required reason, `?id=` deep link from the
  notification); `/coach/requests` (own requests, withdraw while waiting);
  `useCoachClassCancel` routes the coach's Cancel button by the 24 h rule; the
  in-class pull list offers "Ask an admin" for students outside the coach's
  batches.

### Stage 5: port and unify (2026-11-01) ✅

* **Class change requests are engine actions.** `CLASS_EXTRA` and
  `CLASS_RESCHEDULE` (`apps/api/src/approval/handlers/class-change.handler.ts`,
  payload schemas in `@nexa-chess/types` `class-requests.ts`):
  * dedupe keys `CLASS_EXTRA:<coach>:<batch>:<start ISO>` and
    `CLASS_RESCHEDULE:<class>` (one pending request each, via the engine's
    partial unique index);
  * a request expires after 72 h (D2 default) or at the class start, whichever
    is first (a reschedule: the earlier of the class's start and the new one);
  * revalidation share-locks batch, batch-coach and coach rows (a reschedule
    also row-locks the class), then re-checks everything V3 checked: the coach
    is still an ACTIVE coach of a live batch, a moved class is still theirs,
    `SCHEDULED` and at the time it had when asked, the start isn't past, the
    batch dates and the coach's schedule (`assertNoSchedulingConflict`, coach's
    timezone);
  * execution creates the class (and links it to the request's `classId`, then
    `CLASS_SCHEDULED` after commit) or moves it status-filtered.
* **Data migration** `20261101100736_class_requests_into_approvals`:
  * locks `class_change_requests`, then copies every row into
    `approval_requests` under the **same id** with its history as events
    (CREATED; APPROVED with the review note; REJECTED with the reason; a
    withdrawal as CANCELLED). Status map: PENDING → PENDING, APPROVED →
    APPROVED, REJECTED → REJECTED, WITHDRAWN → CANCELLED;
  * a still-pending copy gets `expiresAt` = the earliest of the class start(s)
    and now + 72 h. One already past is expired by the next cron run, which
    tells the coach;
  * the old pending rows are marked WITHDRAWN with a note naming their copy;
  * the `nexa_read_only_history` trigger then refuses direct INSERT, UPDATE and
    DELETE on `class_change_requests`. Only the foreign keys' own cascades
    (user/batch hard purge, class delete → `classId` NULL) still run.
  * Verified on a local Postgres with sample rows of every status; the
    `approval-constraints` int-spec pins the trigger.
* **Old routes removed:** `apps/api/src/class-request/`,
  `API_ROUTES.classRequests` and `features/class-requests/`. The coach's dialog
  (`features/approvals/components/ClassRequestDialog.tsx`) sends
  `POST /approvals`; `/admin/class-requests` redirects to `/admin/requests`; the
  coach's schedule shows their waiting scheduling requests. The inbox shows a
  reschedule as old time → new time. E2E fixtures use the new routes.
* **One inbox:** `GET API_ROUTES.adminApprovals.queues` (`RequestQueuesService`)
  returns the pending count and the oldest five of each queue that keeps its own
  page, only to someone who could review it there:
  * offline payments (ADMIN / SUPER_ADMIN, only while `studentPayments` is in
    the plan);
  * account deletions (ADMIN / SUPER_ADMIN);
  * coach applications (SUPER_ADMIN).

  `/admin/requests` shows them under "Also waiting for review" with a link to
  each page (`/admin/payments?tab=manual`, `/admin/privacy`,
  `/admin/approvals?tab=coaches`). They stay read-only there by design: a
  payment settles only through `ManualPaymentService` and `applyProviderState`,
  and a deletion only through `AccountDeletionService`.
* The permission table's enrolment/transfer, attendance correction, substitute
  and locked-setting exception rows now say Stage 6, matching the roadmap.

---

## 8. Outstanding decisions and risks

| # | Item | Needed from |
|---|---|---|
| D1 | Consent and guardian design (§2.8): purposes, legal basis per purpose, guardian verification, age of digital consent per jurisdiction. Blocks enforcement of every C row, including recording of minors. | owner + legal |
| D2 | Request expiry defaults. Proposed: 72 h for most types; class requests expire at the class start; urgent cancellation requests expire at the class start. | owner (default applied if unanswered) |
| D3 | Whether a student (minor) may change the parent contact at all, or only through an admin once guardians exist. Current mitigation: password, notice and audit. | owner, with D1 |
| R1 | ~~V4 stays open until Stage 4.~~ Closed by Stage 4. | — |
| R2 | ~~Request notifications aren't built yet.~~ Shipped in Stage 4. | — |
| R3 | The previous-parent-contact notice (V7) is sent best-effort after commit; an SMTP failure drops it (logged). The messaging outbox only delivers to accounts, so a durable notice to a typed address needs either a guardian account (D1/D3) or an outbox row type for raw addresses. | owner, with D1 |
