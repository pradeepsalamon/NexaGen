# Admin email: verification policy and direct email

Page: `/admin/email` (Admin and Super Admin). Code: `apps/api/src/email-admin/`,
`apps/web/src/features/email-admin/`, contract in `@nexa-chess/types`
`email-admin.ts`. Sending needs the `SMTP_*` variables; without them the policy
can only stay Off and nothing can be sent.

## Verification policy

One academy-wide setting, stored in `email_settings` (no row means Off).

| Policy | New sign-ups | Reminder banner | Sign-in |
|---|---|---|---|
| **Off** (default) | Count as verified, no email | No | Allowed |
| **Ask, but don't require** (`OPTIONAL`) | Unverified, link sent | Yes | Allowed |
| **Required to sign in** (`REQUIRED`) | Unverified, link sent | Yes | Students and coaches refused until verified |

`EmailVerificationService.blocksSignIn` is the one sign-in rule. Rules to keep:

- **Admins are exempt**, so a broken mail server can't lock everyone out.
- The gate is at password sign-in only. Someone already signed in stays signed in
  until their session ends.
- A refused sign-in sends a new link, unless one went out in the last 5 minutes.
  The password was already right, so this reveals nothing to a stranger.
- A mail failure never fails a registration, sign-in message or email change
  (`sendLinkBestEffort`). The person can ask again, or staff can mark them verified.
- The API refuses to turn verification on without SMTP.
- Only the newest link works. Changing an address (self or by staff) retires
  outstanding links, so a link sent to the old address can't vouch for the new one.
- Changing your own address while the policy is on resets you to unverified. An
  address staff type in counts as trusted, as it does when they create the account.

Staff controls:

- `/admin/email`: everyone unverified, with **Send verification link**, **Mark as
  verified** and **Mark all as verified**. Run the last one before turning on
  `REQUIRED` over accounts that predate it, if you trust those addresses.
- `/admin/users`: the mail icon on a row opens the same controls plus a message box.
- A plain Admin can't change another admin's verification (same rule as editing a user).

The verification email's wording can be edited at `/admin/messaging` → System
messages ([MESSAGING.md](MESSAGING.md)).

## Direct email

Staff write to anyone with an account, including pending and archived ones:
from **Write an email** (search by name or email), a row in `/admin/users`, or
rows selected there (up to `DIRECT_EMAIL_MAX_RECIPIENTS`, 50).

- Recipients must be accounts, never a typed address, so this can't be used to
  mail outsiders from the academy's domain.
- Each person gets their own copy, sent one at a time by the browser
  (`POST /admin/email/users/:userId/send`, throttled 60/min). `BulkResultDialog`
  reports each failure; failed recipients and the draft stay in the dialog to retry.
- Subject and body are plain text. The HTML part escapes the body and never
  renders it.
- Mail goes out from `SMTP_FROM`, with no reply-to, so replies reach the academy's
  inbox and an admin's sign-in address isn't exposed.
- `direct_emails` logs every send, written **before** sending so nothing goes out
  unlogged. `PENDING` means the server stopped before confirming it; the page
  shows it as "Not confirmed". SMTP error text stays with staff.
- Rows are kept 365 days (`RETENTION_RULES`), are removed with a purged recipient,
  and appear in the recipient's data export (`directEmails`, without the sender).
