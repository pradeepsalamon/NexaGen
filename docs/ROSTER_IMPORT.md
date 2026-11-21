# Roster import (CSV)

Built 2026-11-21 for SaaS onboarding: a new academy adds its students and
coaches from a spreadsheet instead of one by one. Owner's calls (2026-11-21):
people get an **email invite to set their password**; a row **without an email
is still imported** but can't sign in until one is added; **academy admins and
platform operators** may import.

## Where

| Part | Path |
|---|---|
| Contract, CSV reader, row checks | `packages/types/src/roster-import.ts` |
| API | `apps/api/src/user/roster-import.service.ts`, routes in `user.controller.ts` |
| Web | Admin → Users → **Import** tab (`features/users/components/RosterImportPanel.tsx`) |
| Invite message | System message `ACCOUNT_INVITE` (Admin → Messaging → System messages) |
| Tests | `user/roster-import.int-spec.ts`; access rows in `test/integration/access/access-cases.ts` |

Routes: `POST /users/import/preview` (checks, creates nothing, 200),
`POST /users/import` (creates, 201), `POST /users/:id/invite` (re-send, 200).
Both import routes take `{ rows, sendInvites }`, up to
`ROSTER_IMPORT_MAX_ROWS` (1000) rows; their JSON body limit is 2 MB
(`app.setup.ts`).

## The file

A CSV with a header row. Only **First name** is required. Recognised columns
(case, spaces, `_` and `-` don't matter; aliases in `HEADER_ALIASES`): First
name, Last name, Email, Role (`Student`/`Coach`, also `teacher`, `trainer`;
empty = Student), Phone, Parent name, Parent email, Parent phone, Batch (the
exact name, any case, of a batch that already exists). Other columns are listed
as "not imported". The page offers a template (`ROSTER_IMPORT_TEMPLATE_CSV`).
The browser reads the file (`readRosterCsv`, RFC 4180 quoting, BOM, CRLF); the
API checks every row again with the same `checkRosterRows`, then:

- **EXISTS**: the email already has an account in the academy (deleted
  accounts count, the unique index covers them), or, for a row without an
  email, the academy already has a no-email account with the same name and
  role. Left untouched, so a re-run of the same file is a no-op. (Two different
  people with the same name and no email: give one an email, or add the second
  by hand.)
- **INVALID**: bad email, unknown role word, an email twice in the file, no
  batch by that name, or two batches with that name.
- **NO_SEAT**: the plan's `maxStudents` / `maxCoaches` would be exceeded.
  Preview counts seats row by row (`EntitlementService.seatsLeft`); the import
  still calls `assertSeatAvailable` inside each row's transaction, so only the
  rows that don't fit are refused.
- **CREATE**: the account is made ACTIVE (an admin adding it is the approval,
  as in `UserService.create`), with a student profile (parent name defaults to
  "<first name> Parent") or an approved coach profile, and a place in the batch.
  Each row is its own transaction.

Roles are Student and Coach only; admins are still made one at a time.

## Accounts without an email

`User.email` is required and unique, so such a row gets a stand-in address
`<role>-<random>@no-email.invalid` (`NO_EMAIL_DOMAIN`, `isPlaceholderEmail`).
`.invalid` can never receive mail (RFC 2606): `MailService` skips any
`.invalid` recipient and `SystemNotifier` skips the email channel for it. The
users table shows "No email". To let the person in, edit the account's email,
then **Re-send invite**.

## Invites

With "Send invite emails" on (the default), every created row with an email gets
`ACCOUNT_INVITE`: a one-time `/reset-password` link valid for 7 days
(`ACCOUNT_INVITE_TTL_MS`), on the academy's own address (`SystemNotifier`
localises links). **Re-send invite** (row action, shown until the person first
signs in, `AuthUser.hasSignedIn`) deletes their unused links and sends a fresh
one; it refuses an account that already signed in (use "Forgot password"), one
without a real email, or a non-ACTIVE one. An admin can't re-send to an admin.

## Who

Academy `SUPER_ADMIN` and `ADMIN`. A platform operator imports through a
support visit (the academy's support account is a super admin there,
[SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) §I "Support access"). Coaches,
students and sales get 403.

## Not built

- Updating existing accounts from the file (it only adds).
- Importing parents as their own accounts (there is no parent role,
  [PARENT_REPORTS.md](PARENT_REPORTS.md)).
- Excel files directly: save as CSV first.
