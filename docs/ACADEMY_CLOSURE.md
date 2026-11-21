# Closing an academy: keep or delete its data

Built 2026-11-21 (SaaS, the "academy deletion workflow" from
[SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) §L "Later"). Owner's calls
(2026-11-21): an academy is closed **only when it asks**, and **the academy
chooses** whether its data is **kept** (closed, can be reopened) or **deleted**;
platform operators decide; the academy's super admin can ask, an operator
confirms. Builder's call (logged in BACKLOG): a deletion waits a **7-day undo
window** (`ACADEMY_CLOSURE_UNDO_DAYS`), and every decision needs the academy's
name typed back.

## Where

| Part | Path |
|---|---|
| Contract | `packages/types/src/academy-closure.ts`; routes `API_ROUTES.academyClosure`, `API_ROUTES.platform.closure*`, `tenantClose`, `tenantExport` |
| Requests and decisions | `apps/api/src/academy-closure/academy-closure.service.ts` |
| Export | `academy-export.service.ts` |
| Purge | `academy-purge.service.ts` (hourly at :17 UTC, `JOB_LOCKS.academyPurge`) |
| Schema knowledge (kept tables, secret columns, SQL) | `academy-data.catalogue.ts` (+ `.spec.ts`) |
| Model | `TenantClosure` (`tenant_closures`, a platform model; one open closure per academy by a partial unique index) |
| Academy UI | Admin → Subscription → "Your data and closing the academy" (`features/subscription/components/AcademyClosureSection.tsx`) |
| Console UI | Platform console → **Closures** tab; academy page → "Closing the academy" card (`features/platform/components/Closures*.tsx`, `AcademyClosureCard.tsx`) |
| Messages | `ACADEMY_CLOSURE_REQUESTED` (to operators, platform only), `ACADEMY_CLOSURE_DECIDED` (to the super admin who asked) |
| Tests | `academy-closure.int-spec.ts` (two academies + Nexa, enforce), access rows in `access-cases.ts` |

## The flow

```
REQUESTED ──withdraw──▶ WITHDRAWN
    │ └──decline──▶ DECLINED                (academy carries on)
    │ approve (name typed)
    ├─ KEEP_DATA ───▶ CLOSED ──reopen──▶ REOPENED
    └─ DELETE_DATA ─▶ PURGE_SCHEDULED ──cancel──▶ CANCELLED ──reopen──▶ REOPENED
                          │ purgeAfter passes (7 days)
                          ▼
                       PURGING ─▶ PURGED
```

- **The academy asks.** Only its own `SUPER_ADMIN` (not an admin, not the
  platform support account on a support visit): choice, reason, its name typed
  back. Operators get `ACADEMY_CLOSURE_REQUESTED`. Nexa's own academy can't be
  closed. A second open request is a 409.
- **An operator records a request made by email or phone** from the academy's
  console page ("Close academy"): the request and the approval in one step,
  with "how and when the academy asked" as the reason.
- **Approving** (status-filtered claim, in one transaction with the platform
  audit row `tenant.close`): the academy becomes `DEACTIVATED` (no address
  resolves, `forEachTenant` crons skip it, the subscription lapse sweep leaves
  it alone, platform checkout refuses it) and every login session of the
  academy is revoked. KEEP_DATA → `CLOSED`; DELETE_DATA → `PURGE_SCHEDULED`
  with `purgeAfter` = now + 7 days. The super admin who asked gets
  `ACADEMY_CLOSURE_DECIDED`.
- **Cancel the deletion** (only `PURGE_SCHEDULED`): `CANCELLED`, the academy
  stays closed with its data. **Reopen** (`CLOSED` or `CANCELLED`, the
  academy's latest closure only): `REOPENED`, the academy is `ACTIVE` again;
  its people sign in again (their sessions were ended). Check its subscription
  afterwards. The older Suspend/Reactivate buttons don't act on a closed academy.

## Export

`GET /admin/academy/export` (the academy's super admin) and
`GET /platform/tenants/:tenantId/export` (operators; audit row `tenant.export`;
also works after closing, until the purge). A gzip file, one JSON object per
line: a header (`AcademyExportHeader`: format, version, academy, the columns
left out), then `{ table, row }` for every row of every academy table
(`TENANT_TABLES`), paged by primary key. **Columns whose name looks secret are
left out** (`isSecretColumn`: password, token, hash, secret, encrypted, OTP,
recovery codes, API/webhook keys, signatures, MFA). The academy can't sign in
once it is closed, so the request form tells it to download first.

## The purge

Hourly, single runner, restartable (a run that stops is picked up when its
one-hour lease lapses). For one academy:

1. Its uploaded files (`uploaded_files`) are destroyed in Cloudinary, best
   effort (`UploadService.destroyByPublicId`; a failure is counted in the
   report, not fatal).
2. Every nullable reference held by its deletable rows is cleared (breaks
   cycles and self-links).
3. Passes delete each academy table's rows **that no row anywhere points at**
   (`deleteUnreferencedSql`), until a pass deletes nothing. Because a row is
   only deleted once nothing references it, no `ON DELETE CASCADE` ever fires
   into a kept table. **Never deleted** (`RETAINED_MODELS`): orders, payments,
   refunds, invoices, credit notes, invoice audit log, manual payment records,
   coach payroll records, payroll adjustments, payslips, referral cash
   withdrawals — the records tax law requires. What they point at stays too
   (e.g. the batch an order was for).
4. Users still there (named on a kept record) are **anonymised**
   (`ANONYMISE_USERS_SQL`: name "Deleted user", `deleted-<id>@deleted.invalid`,
   no phone, avatar, username or marketing fields, password unusable, status
   DELETED). A spec fails a new `User` field that isn't classified as
   anonymised or kept. The invoices' own snapshots (billing name and address)
   stay, as the law requires.
5. The academy's addresses are released (`REMOVED`). The `tenants` row, its
   subscription history and the platform's own invoices to it stay.

The report on the closure (`purgeReport`) lists rows deleted, rows kept per
table, users anonymised, files removed, and **`crossAcademyLinks`**: rows
labelled with another academy that point into this one. The purge never
deletes another academy's rows, so such a link keeps its target alive; it is
also a tenant integrity finding (console → Integrity).

## Not covered

- LiveKit recordings and backups in object storage (the purge removes the
  recording rows, not the files; database backups age out on their own
  schedule, [DATABASE_RESTORE.md](DATABASE_RESTORE.md)).
- Deleting the `tenants` row itself (it anchors the kept records).
- An academy closing itself without an operator (by design).
- A "this academy is closed" page: while closed, its address answers nothing
  useful (the API refuses its origin), so an open tab shows "Session expired"
  and failing widgets. After reopening, such a tab goes back to `/login`.
